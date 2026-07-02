import { lazy, Suspense } from 'react'
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
const ImportHistory = lazy(() => import('./pages/admin/ImportHistory'))
const Payouts = lazy(() => import('./pages/admin/Payouts'))
const Promotions = lazy(() => import('./pages/admin/Promotions'))
const Customers = lazy(() => import('./pages/admin/Customers'))
const CustomerDetail = lazy(() => import('./pages/admin/CustomerDetail'))
const Policies = lazy(() => import('./pages/admin/Policies'))
const PolicyDetail = lazy(() => import('./pages/admin/PolicyDetail'))
const AllReports = lazy(() => import('./pages/admin/AllReports'))
const SystemLogs = lazy(() => import('./pages/admin/SystemLogs'))

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

export default function App() {
  const { isConfigured, authLoading } = useAuth()
  if (!isConfigured) return <ConfigNotice />
  if (authLoading) return <Loader />

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />

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

              {/* My earnings */}
              <Route path="/my-earnings" element={<MyEarnings />} />
              <Route path="/my-downline" element={<MyDownline />} />
              <Route path="/cmd-awards" element={<CmdAwards />} />

              {/* Admin */}
              <Route path="/admin/members" element={<Protected capability={CAP.ADMIN}><Members /></Protected>} />
              <Route path="/admin/members/:id" element={<Protected capability={CAP.ADMIN}><MemberDetail /></Protected>} />
              <Route path="/admin/branches" element={<Protected capability={CAP.ADMIN}><Branches /></Protected>} />
              <Route path="/admin/branches/:id" element={<Protected capability={CAP.ADMIN}><BranchDetail /></Protected>} />
              <Route path="/admin/import" element={<Protected capability={CAP.ADMIN}><ImportData /></Protected>} />
              <Route path="/admin/import/history" element={<Protected capability={CAP.ADMIN}><ImportHistory /></Protected>} />
              <Route path="/admin/payouts" element={<Protected capability={CAP.ADMIN}><Payouts /></Protected>} />
              <Route path="/admin/promotions" element={<Protected capability={CAP.ADMIN}><Promotions /></Protected>} />
              <Route path="/admin/customers" element={<Protected capability={CAP.ADMIN}><Customers /></Protected>} />
              <Route path="/admin/customers/:id" element={<Protected capability={CAP.ADMIN}><CustomerDetail /></Protected>} />
              <Route path="/admin/policies" element={<Protected capability={CAP.ADMIN}><Policies /></Protected>} />
              <Route path="/admin/policies/:id" element={<Protected capability={CAP.ADMIN}><PolicyDetail /></Protected>} />
              <Route path="/admin/settings" element={<Protected capability={CAP.ADMIN}><Settings /></Protected>} />

              {/* Super admin */}
              <Route path="/admin/overview" element={<Protected capability={CAP.SUPER_ADMIN}><Overview /></Protected>} />
              <Route path="/admin/all-reports" element={<Protected capability={CAP.SUPER_ADMIN}><AllReports /></Protected>} />
              <Route path="/admin/logs" element={<Protected capability={CAP.SUPER_ADMIN}><SystemLogs /></Protected>} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
