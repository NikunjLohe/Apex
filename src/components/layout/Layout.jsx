import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ErrorBoundary from '../ErrorBoundary'
import { useAuth } from '../../contexts/AuthContext'
import AgentProfileCompletionModal from '../AgentProfileCompletionModal'
import { IAlert } from '../ui/icons'

// Map path prefixes → page title for the topbar.
const TITLES = [
  ['/dashboard', 'Dashboard'],
  ['/customers/new', 'New Customer'],
  ['/customers', 'Customers'],
  ['/plans/new', 'New RD/FD Plan'],
  ['/payments/collect', 'Collect Payment'],
  ['/payments', 'Receipt'],
  ['/reports/collections', 'Collections Report'],
  ['/reports/defaulters', 'Defaulters'],
  ['/reports/maturities', 'Maturities'],
  ['/my-profile', 'My Profile'],
  ['/my-earnings', 'My Earnings'],
  ['/my-mfa', 'Monthly Field Allowance'],
  ['/my-downline', 'My Downline'],
  ['/cmd-awards', 'CMD Awards'],
  ['/admin/members', 'Members'],
  ['/admin/settings', 'Settings'],
  ['/admin/overview', 'Overview'],
  ['/admin/all-reports', 'All Reports'],
  ['/admin/monthly-business', 'Monthly Business'],
  ['/admin/logs', 'System Logs'],
  ['/admin/policies', 'Policies'],
  ['/admin/payouts', 'Payout Engine'],
  ['/admin/mfa', 'MFA Management'],
  ['/admin/promotions', 'Promotions'],
  ['/admin/payment-import', 'Payment Engine'],
  ['/admin/import', 'Import Center'],
  ['/admin/customers', 'Customers'],
  ['/admin/commission-bill', 'Commission Bill'],
]

function titleFor(pathname) {
  if (pathname.includes('/passbook')) return 'Passbook'
  if (pathname.includes('/enroll')) return 'Enroll in Plan'
  const found = TITLES.find(([p]) => pathname.startsWith(p))
  return found ? found[1] : 'Apex Multisolutions'
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, isViewingAs, stopViewingAs, realProfile } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const title = titleFor(location.pathname)

  const closeDrawer = () => setDrawer(false)

  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

  useEffect(() => {
    if (!drawer) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [drawer])

  const handleExitView = async () => {
    await stopViewingAs()
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen print:block print:min-h-0 print:bg-white">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-navy-4 lg:block print:hidden">
        <Sidebar />
      </aside>

      {/* 
        Mobile Drawer Backdrop
        Always mounted, controlled via opacity and pointer-events transitions.
        This completely avoids Framer Motion exit animation bugs on mobile browsers.
      */}
      <div
        onTouchEnd={(e) => { e.preventDefault(); closeDrawer() }}
        onClick={closeDrawer}
        className={`fixed inset-0 z-40 bg-navy-1/70 lg:hidden print:hidden transition-all duration-300 ${
          drawer ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 
        Mobile Sidebar Panel
        Always mounted, controlled via CSS transforms.
      */}
      <aside
        aria-label="Mobile navigation"
        aria-hidden={!drawer}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto lg:hidden print:hidden bg-navy-2 shadow-card transition-transform duration-300 transform ${
          drawer ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <Sidebar onNavigate={closeDrawer} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col print:block print:min-h-0">
        <Topbar title={title} onMenu={() => setDrawer(d => !d)} />

        {isViewingAs && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm backdrop-blur-sm z-30 sticky top-16 lg:top-0 print:hidden">
            <div className="flex items-center gap-2 text-red-500 font-medium text-xs sm:text-sm min-w-0">
              <IAlert size={18} className="shrink-0" />
              <span className="truncate">
                VIEWING AS AGENT: <span className="font-bold">{profile?.name}</span> • {profile?.sponsorCode || profile?.agentCode}
              </span>
            </div>
            <button
              onClick={handleExitView}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors shadow-sm shrink-0"
            >
              EXIT VIEW
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 print:p-0">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        
        {/* Premium Fyndevs Footer */}
        <footer className="border-t border-navy-4 bg-navy-3 py-4 text-xs text-ink-2 print:hidden">
          <div className="mx-auto px-4 lg:px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
            <p className="font-medium">
              &copy; 2026{' '}
              <a
                href="https://fyndevs.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-gold hover:underline transition-colors"
              >
                Fyndevs
              </a>{' '}
              Technologies. All Rights Reserved.
            </p>
            <p className="font-medium">
              Designed &amp; Developed by{' '}
              <a
                href="https://fyndevs.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-gold hover:underline transition-colors"
              >
                Fyndevs
              </a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
