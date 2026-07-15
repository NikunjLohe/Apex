import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { CAP } from './hooks/usePermission'
import { Protected, PublicOnly } from './components/RouteGuards'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Logo from './components/ui/Logo'

// ---- Lazy routes ----
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CustomerList = lazy(() => import('./pages/customers/CustomerList'))
const CustomerNew = lazy(() => import('./pages/customers/CustomerNew'))
const CustomerProfile = lazy(() => import('./pages/customers/CustomerProfile'))
const PlanEnroll = lazy(() => import('./pages/plans/PlanEnroll'))
const PlanStart = lazy(() => import('./pages/plans/PlanStart'))
const Passbook = lazy(() => import('./pages/plans/Passbook'))
const CollectPayment = lazy(() => import('./pages/payments/CollectPayment'))
const Receipt = lazy(() => import('./pages/payments/Receipt'))
const Collections = lazy(() => import('./pages/reports/Collections'))
const Defaulters = lazy(() => import('./pages/reports/Defaulters'))
const Maturities = lazy(() => import('./pages/reports/Maturities'))
const MyEarnings = lazy(() => import('./pages/earnings/MyEarnings'))
const MyDownline = lazy(() => import('./pages/earnings/MyDownline'))
const CmdAwards = lazy(() => import('./pages/earnings/CmdAwards'))
const Members = lazy(() => import('./pages/admin/Members'))
const MemberDetail = lazy(() => import('./pages/admin/MemberDetail'))
const Branches = lazy(() => import('./pages/admin/Branches'))
const BranchDetail = lazy(() => import('./pages/admin/BranchDetail'))
const Overview = lazy(() => import('./pages/admin/Overview'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const ImportData = lazy(() => import('./pages/admin/ImportData'))
const PaymentImport = lazy(() => import('./pages/admin/PaymentImport'))
const ImportHistory = lazy(() => import('./pages/admin/ImportHistory'))
const Payouts = lazy(() => import('./pages/admin/Payouts'))
const CommissionBill = lazy(() => import('./pages/admin/CommissionBill'))
const Promotions = lazy(() => import('./pages/admin/Promotions'))
const Customers = lazy(() => import('./pages/admin/Customers'))
const CustomerDetail = lazy(() => import('./pages/admin/CustomerDetail'))
const Policies = lazy(() => import('./pages/admin/Policies'))
const PolicyDetail = lazy(() => import('./pages/admin/PolicyDetail'))
const AllReports = lazy(() => import('./pages/admin/AllReports'))
const SystemLogs = lazy(() => import('./pages/admin/SystemLogs'))
const SeedDemo = lazy(() => import('./pages/admin/SeedDemo'))
const NotFound = lazy(() => import('./pages/errors/NotFound'))
const Unauthorized = lazy(() => import('./pages/errors/Unauthorized'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))

function Loader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse"><Logo size={48} tagline /></div>
    </div>
  )
}

function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <Logo size={48} className="mx-auto mb-4 justify-center" />
        <h1 className="text-xl font-bold text-ink-1">Firebase not configured</h1>
        <p className="mt-2 text-sm text-ink-2">Add your credentials to <code className="text-gold">.env.local</code> and restart the dev server.</p>
      </div>
    </div>
  )
}

function StartupErrorScreen({ onRetry, onReset }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-navy-1">
      <div className="card max-w-md w-full p-8 text-center border border-navy-3 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-gold-1/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-info/10 rounded-full blur-3xl pointer-events-none" />
        
        <Logo size={48} className="mx-auto mb-6 justify-center text-gold-1" />
        <h1 className="text-xl font-bold text-white tracking-tight">Unable to Initialize Application</h1>
        <p className="mt-3 text-sm text-ink-2 leading-relaxed">
          The startup sequence timed out. This can happen due to an intermittent network lag or database connection failure.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={onRetry}
            className="btn-primary w-full py-2.5 font-medium flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform duration-150 active:scale-[0.98]"
          >
            🔄 Retry Connection
          </button>
          
          <button
            onClick={onReset}
            className="btn-secondary w-full py-2.5 font-medium border border-danger/30 hover:border-danger text-danger bg-danger/5 hover:bg-danger/10 hover:scale-[1.02] transition-transform duration-150 active:scale-[0.98]"
          >
            🚪 Reset Session & Logout
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { isConfigured, authLoading, profileLoading, user, isAuthenticated, profile, logout } = useAuth()
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const isAppLoading = authLoading || (isAuthenticated && (profileLoading || !profile))

  useEffect(() => {
    if (!isConfigured) return

    if (!isAppLoading) {
      console.log('[App] Application successfully initialized!')
      setStartupTimedOut(false)
      return
    }

    console.log(
      `[App] Startup in progress... authLoading=${authLoading}, profileLoading=${profileLoading}, isAuthenticated=${isAuthenticated}, profile=${!!profile}, user=${user?.uid || 'none'}`
    )

    const timer = setTimeout(() => {
      console.warn('[App] Startup timeout exceeded! (7 seconds)')
      setStartupTimedOut(true)
    }, 7000)

    return () => clearTimeout(timer)
  }, [isConfigured, isAppLoading, authLoading, profileLoading, user, profile, retryCount])

  if (!isConfigured) return <ConfigNotice />
  if (startupTimedOut) {
    return (
      <StartupErrorScreen
        onRetry={() => {
          console.log('[App] Retrying startup...')
          setStartupTimedOut(false)
          setRetryCount(prev => prev + 1)
        }}
        onReset={() => {
          console.log('[App] Resetting session...')
          logout()
          setStartupTimedOut(false)
        }}
      />
    )
  }
  if (isAppLoading) return <Loader />

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/change-password" element={<Protected ignorePasswordForce><ChangePassword /></Protected>} />

            {/* App (protected, with chrome) */}
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Customers */}
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/customers/new" element={<Protected capability={CAP.ONBOARD}><CustomerNew /></Protected>} />
              <Route path="/customers/:id" element={<CustomerProfile />} />
              <Route path="/customers/:id/enroll" element={<Protected capability={CAP.ONBOARD}><PlanEnroll /></Protected>} />
              <Route path="/customers/:id/plans/:planId/passbook" element={<Passbook />} />

              {/* Plans */}
              <Route path="/plans/new" element={<Protected capability={CAP.ONBOARD}><PlanStart /></Protected>} />

              {/* Payments */}
              <Route path="/payments/collect" element={<Protected capability={CAP.COLLECT}><CollectPayment /></Protected>} />
              <Route path="/payments/:id/receipt" element={<Receipt />} />

              {/* Reports */}
              <Route path="/reports/collections" element={<Collections />} />
              <Route path="/reports/defaulters" element={<Defaulters />} />
              <Route path="/reports/maturities" element={<Maturities />} />

              {/* My Earnings — agent accounts only (rank 1–18, not pure super admin) */}
              <Route path="/my-earnings" element={<Protected capability={CAP.AGENT_ONLY}><MyEarnings /></Protected>} />
              <Route path="/my-downline" element={<Protected capability={CAP.AGENT_ONLY}><MyDownline /></Protected>} />
              <Route path="/cmd-awards"  element={<Protected capability={CAP.AGENT_ONLY}><CmdAwards /></Protected>} />


              {/* Admin */}
              <Route path="/admin/members" element={<Protected capability={CAP.ADMIN}><Members /></Protected>} />
              <Route path="/admin/members/:id" element={<Protected capability={CAP.ADMIN}><MemberDetail /></Protected>} />
              <Route path="/admin/branches" element={<Protected capability={CAP.ADMIN}><Branches /></Protected>} />
              <Route path="/admin/branches/:id" element={<Protected capability={CAP.ADMIN}><BranchDetail /></Protected>} />
              <Route path="/admin/import" element={<Protected capability={CAP.ADMIN}><ImportData /></Protected>} />
              <Route path="/admin/payment-import" element={<Protected capability={CAP.ADMIN}><PaymentImport /></Protected>} />
              <Route path="/admin/import/history" element={<Protected capability={CAP.ADMIN}><ImportHistory /></Protected>} />
              <Route path="/admin/payouts" element={<Protected capability={CAP.ADMIN}><Payouts /></Protected>} />
              <Route path="/admin/commission-bill/:id" element={<Protected capability={CAP.ADMIN}><CommissionBill /></Protected>} />
              <Route path="/admin/promotions" element={<Protected capability={CAP.ADMIN}><Promotions /></Protected>} />
              <Route path="/admin/customers" element={<Protected capability={CAP.ADMIN}><Customers /></Protected>} />
              <Route path="/admin/customers/:id" element={<Protected capability={CAP.ADMIN}><CustomerDetail /></Protected>} />
              <Route path="/admin/policies" element={<Protected capability={CAP.ADMIN}><Policies /></Protected>} />
              <Route path="/admin/policies/:id" element={<Protected capability={CAP.ADMIN}><PolicyDetail /></Protected>} />
              <Route path="/admin/settings" element={<Protected capability={CAP.ADMIN}><Settings /></Protected>} />
              {import.meta.env.DEV && (
                <Route path="/admin/seed" element={<Protected capability={CAP.ADMIN}><SeedDemo /></Protected>} />
              )}

              {/* Super admin */}
              <Route path="/admin/overview" element={<Protected capability={CAP.SUPER_ADMIN}><Overview /></Protected>} />
              <Route path="/admin/all-reports" element={<Protected capability={CAP.SUPER_ADMIN}><AllReports /></Protected>} />
              <Route path="/admin/logs" element={<Protected capability={CAP.SUPER_ADMIN}><SystemLogs /></Protected>} />
              <Route path="/unauthorized" element={<Unauthorized />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
