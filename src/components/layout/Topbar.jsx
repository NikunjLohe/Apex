import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { useCollection } from '../../hooks/useFirestore'
import { where, writeBatch, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { IBell, IMenu, ILogout, ISearch, IUsers, IDoc } from '../ui/icons'

export default function Topbar({ title, onMenu }) {
  const { profile, user, logout, isSuperAdmin } = useAuth()
  const { rankCode } = useRanks()
  const [open, setOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  
  const name = profile?.name || user?.displayName || user?.email || 'User'
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  const uid = user?.uid
  const notifications = useCollection('notifications', uid ? [where('userId', '==', uid)] : null)

  // Local database catalogs for search
  const isAgent = !isSuperAdmin && (profile?.rank || 0) < 10
  const allUsers = useCollection(!isAgent ? 'users' : null)
  const allCustomers = useCollection(!isAgent ? 'customers' : null)
  const allPlans = useCollection(!isAgent ? 'plans' : null)

  const unreadCount = useMemo(() => {
    return (notifications.data || []).filter(n => !n.read).length
  }, [notifications.data])

  const handleMarkAllRead = async () => {
    try {
      const batch = writeBatch(db)
      notifications.data.forEach(n => {
        if (!n.read) {
          batch.update(doc(db, 'notifications', n.id), { read: true })
        }
      })
      await batch.commit()
    } catch (e) {
      console.error(e)
    }
  }

  // Filter search results locally
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || isAgent) return []
    const queryLower = searchQuery.toLowerCase().trim()
    const results = []

    // 1. Search Agents
    if (allUsers.data) {
      allUsers.data.forEach(u => {
        if (
          u.name.toLowerCase().includes(queryLower) ||
          (u.sponsorCode && u.sponsorCode.toLowerCase().includes(queryLower))
        ) {
          results.push({
            id: u.id,
            title: u.name,
            subtitle: `Agent Code: ${u.sponsorCode || '—'}`,
            to: `/admin/members/${u.id}`,
            type: 'agent'
          })
        }
      })
    }

    // 2. Search Customers
    if (allCustomers.data) {
      allCustomers.data.forEach(c => {
        if (
          c.name.toLowerCase().includes(queryLower) ||
          (c.customerId && c.customerId.toLowerCase().includes(queryLower)) ||
          (c.phone && c.phone.includes(queryLower))
        ) {
          results.push({
            id: c.id,
            title: c.name,
            subtitle: `Customer ID: ${c.customerId || '—'}`,
            to: `/admin/customers/${c.id}`,
            type: 'customer'
          })
        }
      })
    }

    // 3. Search Policies
    if (allPlans.data) {
      allPlans.data.forEach(p => {
        if (
          p.policyNumber && p.policyNumber.toLowerCase().includes(queryLower)
        ) {
          results.push({
            id: p.id,
            title: `Policy: ${p.policyNumber}`,
            subtitle: `Client: ${p.customerName || '—'} (${p.type || '—'})`,
            to: `/admin/policies/${p.id}`,
            type: 'policy'
          })
        }
      })
    }

    return results.slice(0, 8)
  }, [searchQuery, allUsers.data, allCustomers.data, allPlans.data, isAgent])

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-navy-4/50 bg-navy-1/90 px-4 py-3 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onMenu} className="rounded-card p-1.5 text-ink-2 hover:text-ink-1 lg:hidden" aria-label="Menu">
          <IMenu size={22} />
        </button>
        <h1 className="font-serif text-base font-bold text-ink-1 sm:text-xl tracking-tight">{title}</h1>
      </div>

      {/* Global Search Bar (Admins only) */}
      {!isAgent && (
        <div className="relative flex-1 max-w-md hidden md:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
            <ISearch size={16} />
          </span>
          <input
            type="text"
            placeholder="Global search agent, client ID, or policy..."
            className="field pl-9 py-1.5 text-xs bg-navy-3/95 w-full border border-navy-4 hover:border-gold-1/30"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchQuery.trim().length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSearchOpen(false)} />
              <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card max-h-80 overflow-y-auto divide-y divide-navy-4/50">
                {searchResults.length === 0 ? (
                  <p className="p-3 text-[10px] text-ink-2 italic text-center">No matching records found.</p>
                ) : (
                  searchResults.map(res => (
                    <Link
                      key={`${res.type}-${res.id}`}
                      to={res.to}
                      onClick={() => {
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-navy-2/60 transition-all text-left"
                    >
                      <span className="text-gold">
                        {res.type === 'agent' || res.type === 'customer' ? <IUsers size={16} /> : <IDoc size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-ink-1 truncate">{res.title}</span>
                        <span className="block text-[10px] text-ink-2 truncate">{res.subtitle}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-navy-4 bg-navy-3 px-3 py-1 text-xs font-semibold text-ink-2 sm:inline-flex">
          {format(new Date(), 'MMMM yyyy')}
        </span>
        
        <div className="relative">
          <button 
            type="button" 
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-card border border-navy-4 bg-navy-3 p-2 text-ink-2 hover:text-gold-1 hover:border-gold-1/30" 
            aria-label="Notifications"
          >
            <IBell size={18} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold-tan animate-pulse" />
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card">
                <div className="border-b border-navy-4 px-3 py-2 flex justify-between items-center bg-navy-2/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gold-tan">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-[10px] font-bold text-gold hover:underline">Mark read</button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-navy-4/50">
                  {notifications.loading ? (
                    <p className="p-3 text-[10px] text-ink-2 italic text-center">Loading alerts...</p>
                  ) : notifications.data.length === 0 ? (
                    <p className="p-3 text-[10px] text-ink-2 italic text-center">No new notifications.</p>
                  ) : (
                    notifications.data.slice(0, 10).map(n => (
                      <div key={n.id} className={`p-2.5 text-[11px] leading-relaxed ${!n.read ? 'bg-navy-2/30 font-semibold' : ''}`}>
                        <span className="block text-ink-1 font-bold">{n.title}</span>
                        <span className="block text-ink-2 mt-0.5">{n.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-card border border-navy-4 bg-navy-3 py-1 pl-1 pr-2.5 hover:border-gold-1/30"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-1 text-xs font-bold text-navy-1 font-serif">{initials}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold text-ink-1">{name}</span>
              <span className="block text-[10px] text-ink-2 font-medium">{isSuperAdmin ? 'Super Admin' : rankCode(profile?.rank)}</span>
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
