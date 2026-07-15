import { useState, useEffect } from 'react'
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

  // Close drawer on every route change (covers nav items, logo click, back button)
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-navy-1/70 lg:hidden"
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden"
            >
              {/* Close button — directly in Layout, direct access to setDrawer */}
              <button
                type="button"
                onClick={() => setDrawer(false)}
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 60 }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-navy-3 border border-navy-4 text-ink-2 hover:text-ink-1 hover:bg-navy-4 active:scale-95 transition-all"
                aria-label="Close menu"
              >
                <IClose size={20} />
              </button>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar title={title} onMenu={() => setDrawer(true)} />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
