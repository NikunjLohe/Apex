import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            {/* Backdrop — tapping outside closes the drawer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-navy-1/70 lg:hidden"
              onTouchEnd={(e) => { e.preventDefault(); closeDrawer() }}
              onClick={closeDrawer}
            />
            {/* Sidebar panel */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden"
            >
              <Sidebar onNavigate={closeDrawer} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/*
        ── Mobile close button (React Portal) ──────────────────────────────
        Rendered via createPortal INTO document.body — completely outside
        the React app tree and any CSS stacking context. Guaranteed to be
        the topmost element. Placed at the bottom center for easy thumb
        reach on phones. Uses onTouchEnd to fire before click (instant
        mobile response) with e.preventDefault() to cancel ghost clicks.
      */}
      {drawer && createPortal(
        <button
          type="button"
          onTouchEnd={(e) => { e.preventDefault(); closeDrawer() }}
          onClick={closeDrawer}
          style={{
            position: 'fixed',
            bottom: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2147483647,
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
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <IClose size={18} />
          Close Menu
        </button>,
        document.body
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar title={title} onMenu={() => setDrawer(d => !d)} />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
