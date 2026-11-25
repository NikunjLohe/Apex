import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { policiesAPI, profilesAPI, commissionsAPI } from '../../lib/supabase'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IDoc, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 25

export default function Policies() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [policiesList, setPoliciesList] = useState([])
  const [usersList, setUsersList] = useState([])
  const [ledgerList, setLedgerList] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      try {
        const filters = statusFilter !== 'all' ? { status: statusFilter } : {}
        const [pData, uData, cData] = await Promise.all([
          policiesAPI.listPolicies(filters),
          profilesAPI.listProfiles(),
          commissionsAPI.listCommissionLedger().catch(() => []),
        ])
        if (!cancelled) {
          setPoliciesList(pData || [])
          setUsersList(uData || [])
          setLedgerList(cData || [])
        }
      } catch (err) {
        console.error('[Policies] Error fetching data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [statusFilter])

  const agentMap = useMemo(() => {
    const map = {}
    usersList.forEach(u => {
      map[u.id] = u.name
    })
    return map
  }, [usersList])

  // Real active commission totals and agent recipient counts reconciled per policy
  const commissionSummaryMap = useMemo(() => {
    const map = {}
    ;(ledgerList || []).forEach((c) => {
      if (String(c.status || '').toLowerCase() === 'reversed') return
      const pid = c.policyId
      if (!pid) return
      if (!map[pid]) {
        map[pid] = { totalCommission: 0, agentIds: new Set(), rowCount: 0 }
      }
      map[pid].totalCommission += Number(c.amount) || 0
      map[pid].rowCount += 1
      if (c.agentId) map[pid].agentIds.add(c.agentId)
    })
    return map
  }, [ledgerList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return policiesList.filter((p) => {
      if (!q) return true
      return (
        p.policyNumber?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.customerAccount?.toLowerCase().includes(q) ||
        p.agentName?.toLowerCase().includes(q) ||
        p.type?.toLowerCase().includes(q)
      )
    })
  }, [policiesList, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start sm:items-center gap-3 border-b border-navy-4/50 pb-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink-1 tracking-tight">Active Policies Ledger</h2>
          <p className="text-xs text-ink-2">Total active customer saving accounts and certificates approved by bank reports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Link to="/admin/import?tab=manual" className="btn-gold py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial">
            + Onboard New Business
          </Link>
          <Link to="/admin/import?tab=excel" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-3.5 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial">
            Excel Import
          </Link>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
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
          className="field w-full sm:w-auto text-xs font-semibold"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="matured">Matured</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table / Mobile Cards */}
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2 font-mono">
            <span>{filtered.length} policy certificate{filtered.length === 1 ? '' : 's'} registered</span>
            {totalPages > 1 && <span>Page {currentPage} of {totalPages}</span>}
          </div>

          {/* Mobile Card Layout */}
          <div className="space-y-2.5 md:hidden">
            {paginated.map((p) => {
              const isRDPlan = p.planType === 'RD' || (p.planType || p.type || '').toLowerCase().startsWith('rd')
              const commInfo = commissionSummaryMap[p.id]
              const commAgentCount = commInfo ? commInfo.agentIds.size : 0
              const commTotal = commInfo ? commInfo.totalCommission : 0
              return (
                <div
                  key={`mob-${p.id}`}
                  onClick={() => navigate(`/admin/policies/${p.id}`)}
                  className="card p-3.5 cursor-pointer hover:border-gold-1/40 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-gold truncate">{p.policyNumber || '—'}</p>
                      <p className="font-semibold text-sm text-ink-1 truncate">{p.customerName}</p>
                      {p.customerAccount && p.customerAccount !== '—' && (
                        <p className="text-[10px] font-mono text-ink-2 truncate">{p.customerAccount}</p>
                      )}
                    </div>
                    <StatusBadge status={p.status || 'active'} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-navy-4/40">
                    <div>
                      <span className="text-[10px] uppercase text-ink-2 block">Agent</span>
                      <span className="text-ink-1 font-medium truncate block">{p.agentName || agentMap[p.agentId] || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-2 block">Product / Term</span>
                      <span className="text-ink-1 font-semibold uppercase">{p.type || p.planCode || '—'} · {p.duration}Y</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-2 block">Deposit</span>
                      <span className="text-ink-1 font-semibold">
                        {isRDPlan ? `${formatINR(p.monthlyAmount || p.installmentAmount)}/mo` : `${formatINR(p.fdAmount)}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-2 block">Start Date</span>
                      <span className="text-ink-1 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-navy-4/40 text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-ink-2 block">Commission Paid</span>
                      <span className="font-mono font-bold text-gold">
                        {commTotal > 0 ? formatINR(commTotal) : '₹0'}
                        <span className="text-[10px] font-normal text-ink-2 ml-1">
                          ({commAgentCount} agent{commAgentCount === 1 ? '' : 's'})
                        </span>
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-gold-1">View Breakdown →</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block table-wrap overflow-x-auto">
            <table className="tbl text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Policy Number</th>
                  <th>Customer Name</th>
                  <th>Assigned Agent</th>
                  <th>Product</th>
                  <th>Term</th>
                  <th>Amount</th>
                  <th>Commission Distributed</th>
                  <th>Start Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => {
                  const isRDPlan = p.planType === 'RD' || (p.planType || p.type || '').toLowerCase().startsWith('rd')
                  const commInfo = commissionSummaryMap[p.id]
                  const commAgentCount = commInfo ? commInfo.agentIds.size : 0
                  const commTotal = commInfo ? commInfo.totalCommission : 0
                  return (
                    <tr 
                      key={p.id} 
                      className="cursor-pointer hover:bg-navy-2/30" 
                      onClick={() => navigate(`/admin/policies/${p.id}`)}
                    >
                      <td className="font-mono text-xs font-semibold text-gold hover:underline">
                        {p.policyNumber || '—'}
                      </td>
                      <td className="font-semibold text-ink-1">
                        <div>{p.customerName}</div>
                        {p.customerAccount && p.customerAccount !== '—' && (
                          <div className="text-[10px] font-mono text-gold-tan font-normal">{p.customerAccount}</div>
                        )}
                      </td>
                      <td className="text-ink-2 font-medium">{p.agentName || agentMap[p.agentId] || '—'}</td>
                      <td className="text-ink-2 font-semibold uppercase">{p.type || p.planCode || '—'}</td>
                      <td className="text-ink-2 font-medium">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                      <td className="font-semibold text-ink-1 whitespace-nowrap">
                        {isRDPlan ? (
                          <span>{formatINR(p.monthlyAmount || p.installmentAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo</span></span>
                        ) : (
                          <span>{formatINR(p.fdAmount)} <span className="text-[9px] text-ink-2 font-normal">Total</span></span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-mono font-bold text-gold">{formatINR(commTotal)}</div>
                        <div className="text-[10px] text-ink-2">
                          {commAgentCount > 0 ? `${commAgentCount} agent${commAgentCount === 1 ? '' : 's'} paid` : 'No ledger entries'}
                        </div>
                      </td>
                      <td className="text-ink-2 font-mono whitespace-nowrap">{p.startDate ? fmtDate(p.startDate) : '—'}</td>
                      <td>
                        <StatusBadge status={p.status || 'active'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-40 flex items-center gap-1"
              >
                <span className="scale-x-[-1] inline-block"><IChevron size={12} /></span> Previous
              </button>
              <span className="text-xs font-mono text-ink-2">Page {currentPage} / {totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-40 flex items-center gap-1"
              >
                Next <IChevron size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

