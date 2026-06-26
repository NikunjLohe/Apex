import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ErrorBoundary from '../ErrorBoundary'

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
]

function titleFor(pathname) {
  if (pathname.includes('/passbook')) return 'Passbook'
  if (pathname.includes('/enroll')) return 'Enroll in Plan'
  const found = TITLES.find(([p]) => pathname.startsWith(p))
  return found ? found[1] : 'APEX'
}

export default function Layout() {
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const title = titleFor(location.pathname)

  return (
    <div className="flex min-h-screen">
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
