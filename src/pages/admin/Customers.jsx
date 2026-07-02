import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IUsers, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 15

export default function Customers() {
  const navigate = useNavigate()
  const customers = useCollection('customers')
  const users = useCollection('users')
  const branches = useCollection('branches')

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [page, setPage] = useState(1)

  const agentMap = useMemo(() => {
    const map = {}
    users.data.forEach(u => {
      map[u.id] = `${u.name} (${u.sponsorCode || '—'})`
    })
    return map
  }, [users.data])

  const branchMap = useMemo(() => {
    const map = {}
    branches.data.forEach(b => {
      map[b.id] = b.name
    })
    return map
  }, [branches.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.data
      .filter((c) => {
        if (branchFilter !== 'all' && c.branchId !== branchFilter) return false
        if (!q) return true
        
        const agentName = agentMap[c.enrolledBy]?.toLowerCase() || ''
        const branchName = branchMap[c.branchId]?.toLowerCase() || ''
        
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.customerId?.toLowerCase().includes(q) ||
          agentName.includes(q) ||
          branchName.includes(q)
        );
      })
      .sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime()) : 0
        const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime()) : 0
        return timeB - timeA
      })
  }, [customers.data, search, branchFilter, agentMap, branchMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const loading = customers.loading || users.loading || branches.loading

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">System Customers</h2>
          <p className="text-xs text-ink-2">CIF account records uploaded from bank approved daily logs.</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search CIF ID, name, phone, branch, agent…"
            className="field pl-10"
          />
        </div>
        <select 
          value={branchFilter} 
          onChange={(e) => { setBranchFilter(e.target.value); setPage(1) }} 
          className="field w-auto text-xs font-semibold"
        >
          <option value="all">All Branches</option>
          {branches.data.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : !filtered.length ? (
        <EmptyState 
          icon={<IUsers size={24} />} 
          title="No customers found" 
          message={search || branchFilter !== 'all' ? "Try adjusting your search criteria or branch filters." : "Bank Excel uploads will automatically create customer records."} 
        />
      ) : (
        <>
          <p className="text-xs text-ink-2 font-mono">{filtered.length} customer record{filtered.length === 1 ? '' : 's'} registered</p>
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="tbl text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th>Customer CIF ID</th>
                    <th>Customer Name</th>
                    <th>Mobile</th>
                    <th>Assigned Agent</th>
                    <th>Branch</th>
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
                      <td className="text-ink-2 font-medium">{branchMap[c.branchId] || '—'}</td>
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
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
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
