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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  
  const name = profile?.name || user?.displayName || user?.email || 'User'
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  const uid = user?.id || user?.uid
  const notifications = useCollection('notifications', uid ? [where('userId', '==', uid)] : null)

  // Local database catalogs for search
  const isAgent = !isSuperAdmin
  const allUsers = useCollection(!isAgent ? 'users' : null)
  const allCustomers = useCollection(!isAgent ? 'customers' : null)
  const allPlans = useCollection(!isAgent ? 'plans' : null)

  const unreadCount = useMemo(() => {
    return (notifications?.data || []).filter(n => !n.read).length
  }, [notifications?.data])

  const handleMarkAllRead = async () => {
    try {
      const batch = writeBatch(db)
      ;(notifications?.data || []).forEach(n => {
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
    window.location.href = '/'
  }

  return (
    <header className="sticky top-0 z-20 border-b border-navy-4/50 bg-navy-1/90 px-3 sm:px-4 py-2.5 sm:py-3 backdrop-blur-md lg:px-6 print:hidden">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-navy-4/60 bg-navy-2/40 text-ink-2 hover:text-ink-1 lg:hidden"
            aria-label="Open menu"
          >
            <IMenu size={20} />
          </button>
          <h1 className="font-serif text-base font-bold text-ink-1 sm:text-xl tracking-tight truncate">{title}</h1>
        </div>

        {/* Global Search Bar (Admins only, Desktop/Tablet) */}
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

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {!isAgent && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-card border border-navy-4 bg-navy-3 text-ink-2 hover:text-gold-1"
              aria-label="Toggle global search"
            >
              <ISearch size={18} />
            </button>
          )}

          <span className="hidden items-center gap-1.5 rounded-full border border-navy-4 bg-navy-3 px-3 py-1 text-xs font-semibold text-ink-2 sm:inline-flex whitespace-nowrap">
            {format(new Date(), 'MMMM yyyy')}
          </span>
          
          <div className="relative">
            <button 
              type="button" 
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative flex h-10 w-10 items-center justify-center rounded-card border border-navy-4 bg-navy-3 text-ink-2 hover:text-gold-1 hover:border-gold-1/30" 
              aria-label="Notifications"
            >
              <IBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold-tan animate-pulse" />
              )}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 z-20 overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card">
                  <div className="border-b border-navy-4 px-3 py-2 flex justify-between items-center bg-navy-2/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold-tan">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-[10px] font-bold text-gold hover:underline">Mark read</button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-navy-4/50">
                    {notifications.loading ? (
                      <p className="p-3 text-[10px] text-ink-2 italic text-center">Loading alerts...</p>
                    ) : !(notifications?.data?.length) ? (
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
              className="flex h-10 items-center gap-2 rounded-card border border-navy-4 bg-navy-3 p-1 sm:py-1 sm:pl-1 sm:pr-2.5 hover:border-gold-1/30"
              aria-label="User menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-1 text-xs font-bold text-navy-1 font-serif shrink-0">{initials}</span>
              <span className="hidden text-left sm:block max-w-[140px]">
                <span className="block text-xs font-semibold text-ink-1 truncate">{name}</span>
                <span className="block text-[10px] text-ink-2 font-medium truncate">{isSuperAdmin ? 'Super Admin' : rankCode(profile?.rank)}</span>
              </span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card">
                  <div className="border-b border-navy-4 px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-ink-1">{name}</p>
                    <p className="truncate text-xs text-ink-2">{user?.email || user?.phoneNumber}</p>
                    <p className="mt-1 text-[10px] text-gold font-semibold sm:hidden">{format(new Date(), 'MMMM yyyy')} · {isSuperAdmin ? 'Super Admin' : rankCode(profile?.rank)}</p>
                  </div>
                  <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-ink-2 hover:bg-navy-2 hover:text-danger">
                    <ILogout size={18} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Mobile Global Search Bar (Admins only) */}
      {!isAgent && mobileSearchOpen && (
        <div className="mt-2.5 md:hidden relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
            <ISearch size={16} />
          </span>
          <input
            type="text"
            autoFocus
            placeholder="Search agent, client ID, or policy..."
            className="field pl-9 py-2 text-xs bg-navy-3/95 w-full border border-navy-4"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-card border border-navy-4 bg-navy-3 shadow-card max-h-64 overflow-y-auto divide-y divide-navy-4/50">
              {searchResults.length === 0 ? (
                <p className="p-3 text-[10px] text-ink-2 italic text-center">No matching records found.</p>
              ) : (
                searchResults.map(res => (
                  <Link
                    key={`mob-${res.type}-${res.id}`}
                    to={res.to}
                    onClick={() => {
                      setSearchOpen(false)
                      setMobileSearchOpen(false)
                      setSearchQuery('')
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs hover:bg-navy-2/60 transition-all text-left"
                  >
                    <span className="text-gold shrink-0">
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
          )}
        </div>
      )}
    </header>
  )
}
