import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ErrorBoundary from '../ErrorBoundary'
import { useAuth } from '../../contexts/AuthContext'
import AgentProfileCompletionModal from '../AgentProfileCompletionModal'
import { IClose } from '../ui/icons'

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
  ['/my-earnings', 'My Earnings'],
  ['/my-downline', 'My Downline'],
  ['/cmd-awards', 'CMD Awards'],
  ['/admin/members', 'Members'],
  ['/admin/branches', 'Branches'],
  ['/admin/settings', 'Settings'],
  ['/admin/overview', 'Overview'],
  ['/admin/all-reports', 'All Reports'],
  ['/admin/logs', 'System Logs'],
  ['/admin/policies', 'Policies'],
  ['/admin/payouts', 'Payout Engine'],
  ['/admin/promotions', 'Promotions'],
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
  const { profile } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const title = titleFor(location.pathname)

  // Auto-close drawer on route change (handles nav item clicks)
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

  const closeDrawer = () => setDrawer(false)

  const showCompletion = profile && !profile.isSuperAdmin && !profile.profileCompleted

  return (
    <div className="flex min-h-screen">
      {showCompletion && <AgentProfileCompletionModal />}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-navy-4 lg:block">
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
        className={`fixed inset-0 z-40 bg-navy-1/70 lg:hidden transition-all duration-300 ${
          drawer ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 
        Mobile Sidebar Panel
        Always mounted, controlled via CSS transforms.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 lg:hidden bg-navy-2 shadow-card transition-transform duration-300 transform ${
          drawer ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={closeDrawer} />
      </aside>

      {/*
        ── Mobile Close Button ──────────────────────────────────────────────
        Controlled by the same 'drawer' state, styled as a premium gold pill.
        Always in sync with backdrop/sidebar panel.
      */}
      <button
        type="button"
        onTouchEnd={(e) => { e.preventDefault(); closeDrawer() }}
        onClick={closeDrawer}
        style={{
          position: 'fixed',
          bottom: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          touchAction: 'manipulation',
          background: 'linear-gradient(135deg, #C9A84C, #E5C66A)',
          color: '#1B1F3B',
          border: 'none',
          borderRadius: 9999,
          padding: '13px 28px',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '0.02em',
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        className={`lg:hidden flex items-center gap-2 shadow-lg transition-all duration-300 ${
          drawer ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'
        }`}
        aria-label="Close menu"
      >
        <IClose size={18} />
        Close Menu
      </button>

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar title={title} onMenu={() => setDrawer(d => !d)} />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        
        {/* Premium Fyndevs Footer */}
        <footer className="border-t border-navy-4 bg-navy-3 py-4 text-xs text-ink-2">
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
