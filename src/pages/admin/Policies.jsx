import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { policiesAPI, profilesAPI } from '../../lib/supabase'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IDoc, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 25

export default function Policies() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [policiesList, setPoliciesList] = useState([])
  const [usersList, setUsersList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      try {
        const filters = statusFilter !== 'all' ? { status: statusFilter } : {}
        const [pData, uData] = await Promise.all([
          policiesAPI.listPolicies(filters),
          profilesAPI.listProfiles(),
        ])
        if (!cancelled) {
          setPoliciesList(pData || [])
          setUsersList(uData || [])
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return policiesList.filter((p) => {
      if (!q) return true
      return (
        p.policyNumber?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.agentName?.toLowerCase().includes(q) ||
        p.type?.toLowerCase().includes(q)
      )
    })
  }, [policiesList, search])

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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Policy No, customer name, agent, product…"
            className="field pl-10"
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)} 
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
                  {filtered.map((p) => {
                    const isRDPlan = p.planType === 'RD' || (p.planType || p.type || '').toLowerCase().startsWith('rd')
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
                        <td className="text-ink-2 font-medium">{p.agentName || agentMap[p.agentId] || '—'}</td>
                        <td className="text-ink-2 font-semibold uppercase">{p.type || p.planCode || '—'}</td>
                        <td className="text-ink-2 font-medium">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                        <td className="font-semibold text-ink-1">
                          {isRDPlan ? (
                            <span>{formatINR(p.monthlyAmount || p.installmentAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo</span></span>
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
        </>
      )}
    </div>
  )
}

