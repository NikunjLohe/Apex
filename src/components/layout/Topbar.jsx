import { useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { rankCode } from '../../data/ranks'
import { IBell, IMenu, ILogout } from '../ui/icons'

export default function Topbar({ title, onMenu }) {
  const { profile, user, logout, isSuperAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const name = profile?.name || user?.displayName || user?.email || 'User'
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-navy-4 bg-navy-2/90 px-4 py-3 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onMenu} className="rounded-card p-1.5 text-ink-2 hover:text-ink-1 lg:hidden" aria-label="Menu">
          <IMenu size={22} />
        </button>
        <h1 className="text-base font-semibold text-ink-1 sm:text-lg">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-gold-1/30 bg-gold-1/10 px-3 py-1 text-xs font-semibold text-gold sm:inline-flex">
          {format(new Date(), 'MMMM yyyy')}
        </span>
        <button type="button" className="relative rounded-card border border-navy-4 p-2 text-ink-2 hover:text-gold" aria-label="Notifications">
          <IBell size={18} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold-1" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-card border border-navy-4 py-1 pl-1 pr-2.5 hover:border-gold-1/40"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-1 text-xs font-bold text-navy-1">{initials}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold text-ink-1">{name}</span>
              <span className="block text-[10px] text-gold">{isSuperAdmin ? 'Super Admin' : rankCode(profile?.rank)}</span>
            </span>
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card">
                <div className="border-b border-navy-4 px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink-1">{name}</p>
                  <p className="truncate text-xs text-ink-2">{user?.email || user?.phoneNumber}</p>
                </div>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-ink-2 hover:bg-navy-2 hover:text-danger">
                  <ILogout size={18} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
