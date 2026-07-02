import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { where } from 'firebase/firestore'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { fmtDate, formatINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IUsers, IDoc, IBuilding, IClock } from '../../components/ui/icons'

export default function CustomerDetail() {
  const { id } = useParams()
  const customerDoc = useDoc(id ? `customers/${id}` : null)
  const plans = useCollection('plans', id ? [where('customerId', '==', id)] : null)
  const users = useCollection('users')
  const branches = useCollection('branches')

  const c = customerDoc.data

  // Get assigned agent details
  const agent = useMemo(() => {
    if (!c?.enrolledBy || !users.data) return null
    return users.data.find(u => u.id === c.enrolledBy)
  }, [c?.enrolledBy, users.data])

  // Get branch details
  const branchName = useMemo(() => {
    if (!c?.branchId || !branches.data) return '—'
    return branches.data.find(b => b.id === c.branchId)?.name || '—'
  }, [c?.branchId, branches.data])

  const loading = customerDoc.loading || plans.loading || users.loading || branches.loading

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={3} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!customerDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Customer Not Found</h2>
        <p className="text-sm text-ink-2">This customer record does not exist in the system.</p>
        <Link to="/admin/customers" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Customers</Link>
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
              <IUsers size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{c.name}</h1>
                <span className="text-[10px] bg-ok/10 border border-ok/25 px-2 py-0.5 rounded text-ok font-semibold">Bank Verified</span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">CIF ID: {c.customerId || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/admin/customers" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Customer and Agent details */}
        <div className="space-y-6">
          {/* Customer Profile card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> CIF Customer Profile
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] text-ink-2">Mobile / Contact</span>
                <span className="font-semibold text-ink-1 font-mono">{c.phone || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Address</span>
                <span className="font-semibold text-ink-1 whitespace-pre-wrap">{c.address || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Home Branch Office</span>
                <span className="font-semibold text-ink-1">{branchName}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Import / Created Date</span>
                <span className="font-semibold text-ink-1">{c.createdAt ? fmtDate(c.createdAt) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Assigned Agent card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Assigned Agent
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
                    <span className="text-ink-2">Rank Level</span>
                    <RankBadge rank={agent.rank} size="sm" showName />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Phone</span>
                    <span className="font-mono text-ink-1">{agent.phone || '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-1">No enrolled agent mapping found.</p>
            )}
          </div>
        </div>

        {/* Right Column: Policies and Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Linked Policies */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Linked Policies
            </h3>
            {plans.data.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy No.</th>
                      <th>Plan Product</th>
                      <th>Amount</th>
                      <th>Duration</th>
                      <th>Start Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.data.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-[10px] font-semibold text-gold">
                          <Link to={`/admin/policies/${p.id}`} className="hover:underline">
                            {p.policyNumber || '—'}
                          </Link>
                        </td>
                        <td className="font-semibold uppercase text-ink-1">{p.type}</td>
                        <td className="font-semibold text-ink-1">
                          {p.monthlyAmount > 0 ? (
                            <span>{formatINR(p.monthlyAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo</span></span>
                          ) : (
                            <span>{formatINR(p.fdAmount)} <span className="text-[9px] text-ink-2 font-normal">Total</span></span>
                          )}
                        </td>
                        <td className="text-ink-2">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                        <td className="text-ink-2 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</td>
                        <td>
                          <StatusBadge status={p.status || 'active'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-4 text-center">No active policies found for this customer.</p>
            )}
          </div>

          {/* Timeline Audit Logs */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IClock size={16} /> CIF Onboarding Timeline
            </h3>
            <div className="space-y-4 pl-4 relative before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-0.5 before:bg-navy-4">
              <div className="relative pl-6">
                <span className="absolute left-[5px] top-1 h-2 w-2 rounded-full bg-gold-1 ring-4 ring-navy-3" />
                <span className="block text-[10px] text-ink-2 font-mono">
                  {c.createdAt ? fmtDate(c.createdAt) : '—'}
                </span>
                <span className="text-xs font-semibold text-ink-1">CIF Profile Created</span>
                <p className="text-[11px] text-ink-2 mt-0.5">Account auto-generated via daily ledger upload.</p>
              </div>
              {plans.data.map((p, idx) => (
                <div key={p.id} className="relative pl-6">
                  <span className="absolute left-[5px] top-1 h-2 w-2 rounded-full bg-ok ring-4 ring-navy-3" />
                  <span className="block text-[10px] text-ink-2 font-mono">
                    {p.startDate ? fmtDate(p.startDate) : '—'}
                  </span>
                  <span className="text-xs font-semibold text-ink-1">Policy #{p.policyNumber} Allocated</span>
                  <p className="text-[11px] text-ink-2 mt-0.5">Linked {p.type} savings plan via Agent {p.agentName || '—'}.</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
