import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { customersAPI, profilesAPI, masterDataAPI } from '../../lib/supabase'
import { fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IUsers, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 15

export default function Customers() {
  const navigate = useNavigate()
  const [customersList, setCustomersList] = useState([])
  const [usersList, setUsersList] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      try {
        const [cData, uData] = await Promise.all([
          customersAPI.listCustomers(),
          profilesAPI.listProfiles(),
        ])
        if (!cancelled) {
          setCustomersList(cData || [])
          setUsersList(uData || [])
        }
      } catch (err) {
        console.error('[Customers] Error fetching data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  const agentMap = useMemo(() => {
    const map = {}
    usersList.forEach(u => {
      map[u.id] = `${u.name} (${u.sponsorCode || '—'})`
    })
    return map
  }, [usersList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customersList
      .filter((c) => {
        if (!q) return true

        const agentName = agentMap[c.enrolledBy]?.toLowerCase() || ''

        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.customerId?.toLowerCase().includes(q) ||
          agentName.includes(q)
        )
      })
      .sort((a, b) => {
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return timeB - timeA
})
  }, [customersList, search, agentMap])

const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

return (
  <div className="mx-auto max-w-6xl space-y-4">
    {/* Header */}
    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-navy-4/50 pb-4">
      <div>
        <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink-1 tracking-tight">System Customers</h2>
        <p className="text-xs text-ink-2">CIF account records uploaded from bank approved daily logs.</p>
      </div>
    </div>

    {/* Filters bar */}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
        <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search CIF ID, name, phone, agent…"
          className="field pl-10"
        />
      </div>
    </div>

    {/* Table */}
    {loading ? (
      <SkeletonTable rows={8} cols={7} />
    ) : !filtered.length ? (
      <EmptyState
        icon={<IUsers size={24} />}
        title="No customers found"
        message={search ? "Try adjusting your search criteria." : "Bank Excel uploads will automatically create customer records."}
      />
    ) : (
      <>
        <p className="text-xs text-ink-2 font-mono">{filtered.length} customer record{filtered.length === 1 ? '' : 's'} registered</p>

        {/* Mobile Customer Cards */}
        <div className="space-y-2.5 md:hidden">
          {pageItems.map((c) => (
            <div
              key={`mob-cust-${c.id}`}
              onClick={() => navigate(`/admin/customers/${c.id}`)}
              className="card p-3.5 cursor-pointer hover:border-gold-1/40 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-ink-1 truncate">{c.name}</p>
                  <p className="font-mono text-xs font-semibold text-gold">{c.customerId || '—'}</p>
                </div>
                <span className="font-bold text-xs text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4 font-mono shrink-0">
                  {c.plansCount || 0} {c.plansCount === 1 ? 'Plan' : 'Plans'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink-2 pt-1.5 border-t border-navy-4/40">
                <div><span className="text-[10px] uppercase block">Mobile</span><span className="font-mono text-ink-1">{c.phone || '—'}</span></div>
                <div><span className="text-[10px] uppercase block">Agent</span><span className="text-ink-1 truncate block">{agentMap[c.enrolledBy] || '—'}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block table-wrap overflow-x-auto">
          <table className="tbl text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Customer CIF ID</th>
                  <th>Customer Name</th>
                  <th>Mobile</th>
                  <th>Assigned Agent</th>
                  <th className="text-center">Policies</th>
                  <th>Import Date</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-navy-2/30"
                    onClick={() => navigate(`/admin/customers/${c.id}`)}
                  >
                    <td className="font-mono text-xs font-semibold text-gold hover:underline">
                      {c.customerId || '—'}
                    </td>
                    <td className="font-semibold text-ink-1">
                      {c.name}
                    </td>
                    <td className="text-ink-2 font-mono">{c.phone || '—'}</td>
                    <td className="text-ink-2 font-medium">{agentMap[c.enrolledBy] || '—'}</td>
                    <td className="text-center">
                      <span className="font-bold text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4 font-mono">
                        {c.plansCount || 0}
                      </span>
                    </td>
                    <td className="text-ink-2">{c.createdAt ? fmtDate(c.createdAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-ghost py-1.5 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-sm text-ink-2">Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </>
    )}
  </div>
)
}

