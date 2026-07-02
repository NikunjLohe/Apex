import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IDoc, IUsers, ICash, IBuilding, ISettings } from '../../components/ui/icons'
import { addYears } from 'date-fns'

export default function PolicyDetail() {
  const { id } = useParams()
  const policyDoc = useDoc(id ? `plans/${id}` : null)
  const users = useCollection('users')
  const branches = useCollection('branches')

  const p = policyDoc.data

  // Calculate maturity date if not explicitly in Firestore
  const maturityDate = useMemo(() => {
    if (!p?.startDate || !p?.duration) return null
    const start = p.startDate.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
    return addYears(start, p.duration)
  }, [p?.startDate, p?.duration])

  // Get agent profile
  const agent = useMemo(() => {
    if (!p?.agentId || !users.data) return null
    return users.data.find(u => u.id === p.agentId)
  }, [p?.agentId, users.data])

  // Get branch name
  const branchName = useMemo(() => {
    if (!p?.branchId || !branches.data) return '—'
    return branches.data.find(b => b.id === p.branchId)?.name || '—'
  }, [p?.branchId, branches.data])

  // Calculate total business value of this policy
  const businessValue = useMemo(() => {
    if (!p) return 0
    if (p.monthlyAmount > 0) {
      // RD: monthly deposit * 12 months * term duration
      return p.monthlyAmount * 12 * (p.duration || 1)
    }
    // FD / Pension: Lump sum amount
    return p.fdAmount || 0
  }, [p])

  const loading = policyDoc.loading || users.loading || branches.loading

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={2} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!policyDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Policy Certificate Not Found</h2>
        <p className="text-sm text-ink-2">This policy record does not exist in the system.</p>
        <Link to="/admin/policies" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Policies</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Info */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IDoc size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Policy #{p.policyNumber || '—'}</h1>
                <StatusBadge status={p.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">Product: {p.type || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/admin/policies" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Columns - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Policy Information */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Policy Credentials & Deposit Stats
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Product</span>
                  <span className="font-semibold text-ink-1 uppercase">{p.type || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Term (Duration)</span>
                  <span className="font-semibold text-ink-1">{p.duration || 1} {p.duration === 1 ? 'Year' : 'Years'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Deposit Value</span>
                  {p.monthlyAmount > 0 ? (
                    <span className="font-semibold text-ink-1">{formatINR(p.monthlyAmount)} /month (RD)</span>
                  ) : (
                    <span className="font-semibold text-ink-1">{formatINR(p.fdAmount)} Lump Sum (FD)</span>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Policy Start Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Maturity Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{maturityDate ? fmtDate(maturityDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Branch Allocated</span>
                  <span className="font-semibold text-ink-1">{branchName}</span>
                </div>
              </div>
            </div>

            {/* Business value summary banner */}
            <div className="bg-navy-2/30 border border-navy-4 rounded p-4 flex justify-between items-center text-xs mt-2">
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Cumulative Business Value</span>
                <span className="text-xl font-bold font-serif text-ink-1 mt-0.5 block">{formatINR(businessValue)}</span>
              </div>
              <ICash size={24} className="text-gold-1/60" />
            </div>
          </div>

          {/* Phase 4 Commission Engine Warning Alert Card */}
          <div className="card p-5 space-y-4 border border-dashed border-gold-1/30 bg-gold-1/5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-gold-1/20 flex items-center gap-2">
              <ISettings size={16} /> Commission Allocation Diagnostics (Phase 4)
            </h3>
            <div className="space-y-3 text-xs text-ink-2">
              <p>
                This policy has been successfully imported and verified from the bank approvals sheet. Payouts and commission percentages mapped under the commission master settings are currently in the queue.
              </p>
              <div className="flex flex-wrap gap-4 text-[10px] border-t border-gold-1/10 pt-3">
                <div className="flex gap-1.5 items-center">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold-1" />
                  <span className="text-ink-1 font-semibold">Commissions Status:</span>
                  <span className="font-mono bg-navy-2 px-1.5 py-0.5 rounded text-gold-1 font-bold">LOCKED_IN_QUEUE</span>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-ink-1 font-semibold">Calculation Model:</span>
                  <span className="font-mono bg-navy-2 px-1.5 py-0.5 rounded text-ink-2">Yearly-Tiered Breakdown</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns - Customer & Agent click cards */}
        <div className="space-y-6">
          {/* Linked Customer Profile */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Customer (CIF Owner)
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gold-1/10 border border-gold-1/35 flex items-center justify-center font-bold text-gold-1">
                  {p.customerName ? p.customerName.charAt(0) : 'C'}
                </div>
                <div>
                  <Link to={`/admin/customers/${p.customerId}`} className="font-semibold text-ink-1 hover:underline">
                    {p.customerName}
                  </Link>
                  <div className="text-[10px] text-ink-2 font-mono">CIF: {p.customerAccount || '—'}</div>
                </div>
              </div>
              <div className="pt-2 text-center">
                <Link to={`/admin/customers/${p.customerId}`} className="text-xs text-gold hover:underline font-bold">
                  View Customer Folder &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Linked Agent Card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Submitting Agent
            </h3>
            {agent ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-navy-4 flex items-center justify-center font-bold text-gold-1">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <Link to={`/admin/members/${agent.id}`} className="font-semibold text-ink-1 hover:underline">
                      {agent.name}
                    </Link>
                    <div className="text-[10px] text-ink-2 font-mono">{agent.sponsorCode}</div>
                  </div>
                </div>
                <div className="border-t border-navy-4/50 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Level Rank</span>
                    <span className="font-semibold text-ink-1 uppercase font-mono">{agent.rank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Phone</span>
                    <span className="font-mono text-ink-1">{agent.phone || '—'}</span>
                  </div>
                </div>
                <div className="pt-1 text-center">
                  <Link to={`/admin/members/${agent.id}`} className="text-xs text-gold hover:underline font-bold">
                    View Agent Dashboard &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-ink-1 font-semibold">{p.agentName || '—'}</p>
                <p className="text-xs text-ink-2 italic py-1">Missing detailed database mapping record.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
