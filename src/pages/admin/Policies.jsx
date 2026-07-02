import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IDoc, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 15

export default function Policies() {
  const navigate = useNavigate()
  const policies = useCollection('plans')
  const users = useCollection('users')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const agentMap = useMemo(() => {
    const map = {}
    users.data.forEach(u => {
      map[u.id] = u.name
    })
    return map
  }, [users.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return policies.data
      .filter((p) => {
        if (statusFilter !== 'all' && (p.status || 'active') !== statusFilter) return false
        if (!q) return true
        
        return (
          p.policyNumber?.toLowerCase().includes(q) ||
          p.customerName?.toLowerCase().includes(q) ||
          p.agentName?.toLowerCase().includes(q) ||
          p.type?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime()) : 0
        const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime()) : 0
        return timeB - timeA
      })
  }, [policies.data, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const loading = policies.loading || users.loading

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Active Policies Ledger</h2>
          <p className="text-xs text-ink-2">Total active customer saving accounts and certificates approved by bank reports.</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search Policy No, customer name, agent, product…"
            className="field pl-10"
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} 
          className="field w-auto text-xs font-semibold"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="matured">Matured</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : !filtered.length ? (
        <EmptyState 
          icon={<IDoc size={24} />} 
          title="No policies found" 
          message={search || statusFilter !== 'all' ? "Try adjusting your search criteria or status filters." : "Import bank Excel data to automatically populate the policy ledger."} 
        />
      ) : (
        <>
          <p className="text-xs text-ink-2 font-mono">{filtered.length} policy certificate{filtered.length === 1 ? '' : 's'} registered</p>
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="tbl text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th>Policy Number</th>
                    <th>Customer Name</th>
                    <th>Assigned Agent</th>
                    <th>Product</th>
                    <th>Term</th>
                    <th>Amount</th>
                    <th>Start Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const isRDPlan = p.type?.toLowerCase().startsWith('rd')
                    return (
                      <tr 
                        key={p.id} 
                        className="cursor-pointer hover:bg-navy-2/30" 
                        onClick={() => navigate(`/admin/policies/${p.id}`)}
                      >
                        <td className="font-mono text-xs font-semibold text-gold hover:underline font-mono">
                          {p.policyNumber || '—'}
                        </td>
                        <td className="font-semibold text-ink-1">
                          {p.customerName}
                        </td>
                        <td className="text-ink-2 font-medium">{p.agentName || '—'}</td>
                        <td className="text-ink-2 font-semibold uppercase">{p.type || '—'}</td>
                        <td className="text-ink-2 font-medium">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                        <td className="font-semibold text-ink-1">
                          {isRDPlan ? (
                            <span>{formatINR(p.monthlyAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo</span></span>
                          ) : (
                            <span>{formatINR(p.fdAmount)} <span className="text-[9px] text-ink-2 font-normal">Total</span></span>
                          )}
                        </td>
                        <td className="text-ink-2 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</td>
                        <td>
                          <StatusBadge status={p.status || 'active'} />
                        </td>
                      </tr>
                    )
                  })}
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
