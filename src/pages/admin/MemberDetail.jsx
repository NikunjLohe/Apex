import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { where, getDocs, query, collection, getDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDoc, useCollection, fetchCollection } from '../../hooks/useFirestore'
import { updateMember } from '../../lib/admin'
import { useRanks } from '../../contexts/RanksContext'
import { fmtDate, formatINR, formatCompactINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { 
  IUsers, ICash, ITrophy, IShield, INetwork, IBuilding, IClock, IDoc, IPlus 
} from '../../components/ui/icons'
import { computeEarnings } from '../../lib/earnings'
import toast from 'react-hot-toast'

export default function MemberDetail() {
  const { id } = useParams()
  const agentDoc = useDoc(id ? `users/${id}` : null)
  const branches = useCollection('branches')
  const { config, nextRank, getRank } = useRanks()

  // Lazy recursive downline loader — avoids loading all users
  const [downline, setDownline] = useState([])
  const [downlineLoading, setDownlineLoading] = useState(true)
  // Cache for sponsor name lookups
  const [sponsorMap, setSponsorMap] = useState({})

  // Agent data states for performance computation
  const [ownPlans, setOwnPlans] = useState([])
  const [ownPayments, setOwnPayments] = useState([])
  const [downlinePlans, setDownlinePlans] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const m = agentDoc.data
  const rank = getRank(m?.rank)
  const next = nextRank(m?.rank)

  // Lazy recursive downline fetch
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setDownlineLoading(true)
    ;(async () => {
      const all = []
      const visited = new Set()
      const queue = [id]
      while (queue.length > 0) {
        const parentId = queue.shift()
        if (visited.has(parentId)) continue
        visited.add(parentId)
        try {
          const snaps = await getDocs(query(collection(db, 'users'), where('referredBy', '==', parentId)))
          snaps.docs.forEach(d => {
            all.push({ id: d.id, ...d.data() })
            queue.push(d.id)
          })
        } catch (err) {
          console.error('Downline fetch error:', err)
        }
      }
      if (!cancelled) {
        setDownline(all.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0)))
        setDownlineLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // Fetch performance data (plans/payments/downline plans)
  useEffect(() => {
    if (!id || !agentDoc.exists) return
    let cancelled = false
    ;(async () => {
      try {
        setStatsLoading(true)
        const plansData = await fetchCollection('plans', [where('agentId', '==', id)])
        const paymentsData = await fetchCollection('payments', [where('agentId', '==', id)])
        
        // Fetch downline plans
        const downlineUsers = await fetchCollection('users', [where('referredBy', '==', id)])
        const dlIds = downlineUsers.map((d) => d.id).slice(0, 10)
        let dlPlansData = []
        if (dlIds.length > 0) {
          dlPlansData = await fetchCollection('plans', [where('agentId', 'in', dlIds)])
        }
        
        if (!cancelled) {
          setOwnPlans(plansData)
          setOwnPayments(paymentsData)
          setDownlinePlans(dlPlansData)
        }
      } catch (e) {
        console.error('Error fetching agent stats:', e)
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, agentDoc.exists])

  const model = useMemo(() => {
    if (!m || statsLoading) return null
    return computeEarnings({
      rank: m?.rank || 1,
      ownPlans,
      payments: ownPayments,
      downlinePlans,
      ranksConfig: config,
    })
  }, [m, statsLoading, ownPlans, ownPayments, downlinePlans, config])

  // downline is loaded lazily by the useEffect above and already sorted

  const toggleStatus = async () => {
    if (!m) return
    setUpdatingStatus(true)
    const newStatus = m.status === 'inactive' ? 'active' : 'inactive'
    try {
      await updateMember(id, { status: newStatus })
      toast.success(`Agent ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`)
    } catch (e) {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const branchName = (bid) => branches.data.find((b) => b.id === bid)?.name || '—'
  const sponsorName = useCallback((uid) => {
    if (!uid) return '—'
    if (sponsorMap[uid]) return sponsorMap[uid]
    // Trigger async fetch and cache
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) setSponsorMap(prev => ({ ...prev, [uid]: snap.data().name || '—' }))
    }).catch(() => {})
    return '…'
  }, [sponsorMap])

  if (agentDoc.loading || branches.loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  if (!agentDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Agent Not Found</h2>
        <p className="text-sm text-ink-2">The agent document or Agent Code does not exist in the database.</p>
        <Link to="/admin/members" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Agents</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Profile card */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-4/50 text-gold-1 font-serif text-2xl font-bold shadow-inner">
              {m.photo ? (
                <img src={m.photo} alt={m.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                m.name?.substring(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{m.name}</h1>
                <RankBadge rank={m.rank} />
                <StatusBadge status={m.status || 'active'} />
              </div>
              <p className="text-sm text-ink-2 mt-1 font-mono font-medium">Agent Code: {m.sponsorCode || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleStatus}
              disabled={updatingStatus}
              className={`py-2 px-4 text-xs font-bold uppercase rounded-md tracking-wider transition-all shadow-sm ${
                m.status === 'inactive' 
                  ? 'bg-ok text-white hover:bg-ok-hover' 
                  : 'bg-danger text-white hover:bg-danger-hover'
              }`}
            >
              {updatingStatus ? 'Updating...' : m.status === 'inactive' ? 'Activate Agent' : 'Deactivate Agent'}
            </button>
            <Link to="/admin/members" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Personal & identity */}
        <div className="space-y-6">
          {/* Personal Info */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Personal Information
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] text-ink-2">Mobile Number</span>
                <span className="font-semibold text-ink-1 font-mono">{m.phone || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Email Address</span>
                <span className="font-semibold text-ink-1">{m.email || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Date of Birth</span>
                <span className="font-semibold text-ink-1">{m.dob || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Joining Date</span>
                <span className="font-semibold text-ink-1">{m.joinDate ? fmtDate(m.joinDate) : '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Current Branch</span>
                <span className="font-semibold text-ink-1 flex items-center gap-1"><IBuilding size={12} /> {branchName(m.branchId)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Address</span>
                <span className="font-semibold text-ink-1 whitespace-pre-wrap">{m.address || '—'}</span>
              </div>
            </div>
          </div>

          {/* Identity & Bank details */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Bank & Identity Profile
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-ink-2">Aadhaar Number</span>
                  <span className="font-semibold text-ink-1 font-mono">{m.aadhaar || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">PAN Card</span>
                  <span className="font-semibold text-ink-1 font-mono uppercase">{m.pan || '—'}</span>
                </div>
              </div>
              <div className="border-t border-navy-4/50 my-2" />
              {m.profileCompleted ? (
                <div className="space-y-3">
                  <div>
                    <span className="block text-[10px] text-ink-2">Account Holder Name</span>
                    <span className="font-semibold text-ink-1">{m.bankDetails?.accountHolderName || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Bank & Branch</span>
                    <span className="font-semibold text-ink-1">{m.bankDetails?.bankName} · {m.bankDetails?.branch}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Number</span>
                      <span className="font-semibold text-ink-1 font-mono">{m.bankDetails?.accountNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">IFSC Code</span>
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m.bankDetails?.ifscCode || '—'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-1">Onboarding details not completed yet.</p>
              )}
            </div>
          </div>

          {/* Photo & Documents Placeholder */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Documents & Attachments
            </h3>
            <div className="rounded-card border border-dashed border-navy-4 bg-navy-2/30 p-4 text-center text-xs text-ink-2 space-y-2">
              <p>Uploaded photo, Aadhaar/PAN scans, and bank passbooks will be shown here.</p>
              <div className="text-[10px] bg-navy-4/30 p-1.5 rounded inline-block text-gold">Optional Document Store Placeholder</div>
            </div>
          </div>
        </div>

        {/* Right column: Performance, network, and logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rank Targets & Promo Progress */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4/50 pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ITrophy size={16} /> Rank & Promotion Target
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-ink-2 uppercase">Current Rank:</span>
                <span className="text-xs font-extrabold text-ink-1 uppercase">{rank.code}</span>
              </div>
            </div>
            {statsLoading ? (
              <SkeletonStats count={2} />
            ) : model && next ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-2">Promotion Target Progress to <strong>{next.code}</strong></span>
                    <span className="text-ink-2 font-mono font-medium">{formatCompactINR(model.lifetimeBV)} / {formatCompactINR(model.promo.target)} BV</span>
                  </div>
                  <div className="h-2 bg-navy-2 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-1 rounded-full" style={{ width: `${Math.max(0, Math.min(100, model.promo.progress))}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/20">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider flex items-center gap-1">
                      <ITrophy size={13} className="text-[#8D7952]" /> Performance Bonus
                    </span>
                    {model.pb.target > 0 ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-[11px] text-ink-2">
                          <span>{formatINR(model.pb.current)} of {formatINR(model.pb.target)}</span>
                          <span className={model.pb.achieved ? 'text-ok font-semibold' : ''}>{model.pb.achieved ? 'Earned' : 'Active'}</span>
                        </div>
                        <div className="h-1.5 bg-navy-2 rounded-full overflow-hidden">
                          <div className={`h-full ${model.pb.achieved ? 'bg-ok' : 'bg-gold-1'}`} style={{ width: `${Math.max(0, Math.min(100, model.pb.progress))}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-2 italic mt-1.5">No targets active for this rank.</p>
                    )}
                  </div>

                  <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/20">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider flex items-center gap-1">
                      <IShield size={13} className="text-[#8D7952]" /> CMD Award Progress
                    </span>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between text-[11px] text-ink-2">
                        <span>{formatCompactINR(model.cmd.weightedTotal)} of {formatCompactINR(model.cmd.target)}</span>
                        <span className={model.cmd.qualified ? 'text-ok font-semibold' : ''}>{model.cmd.qualified ? 'Qualified' : 'Active'}</span>
                      </div>
                      <div className="h-1.5 bg-navy-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-1" style={{ width: `${Math.max(0, Math.min(100, model.cmd.progress))}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic">Agent is at the maximum promotional tier (Managing Director) or promotion metrics are unavailable.</p>
            )}
          </div>

          {/* Business & Commission Summary */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Business Summary */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <IDoc size={16} /> Business Summary
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                  <span className="text-[10px] text-ink-2 uppercase">Active Plans</span>
                  <p className="text-lg font-bold text-ink-1 font-serif mt-0.5">{statsLoading ? '—' : ownPlans.length}</p>
                </div>
                <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                  <span className="text-[10px] text-ink-2 uppercase">Direct Payments</span>
                  <p className="text-lg font-bold text-ink-1 font-serif mt-0.5">{statsLoading ? '—' : ownPayments.length}</p>
                </div>
              </div>
              <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/30 text-xs">
                <h4 className="text-[10px] font-bold uppercase text-gold-tan mb-1">Imported Customers Placeholder</h4>
                <p className="text-[11px] text-ink-2">Customers and sales policies linked to this agent code from daily bank uploads will list here.</p>
              </div>
            </div>

            {/* Commissions */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <ICash size={16} /> Commission & Payouts
              </h3>
              {statsLoading ? (
                <SkeletonStats count={2} />
              ) : model ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-navy-4/20">
                    <span className="text-ink-2">This Month Earnings</span>
                    <span className="font-semibold text-gold-1 font-serif">{formatINR(model.totalThisMonth)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-navy-4/20">
                    <span className="text-ink-2">MDA Accrual (this month)</span>
                    <span className="font-semibold text-ink-1 font-serif">{formatINR(model.mda)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-navy-4/20">
                    <span className="text-ink-2">MFA Commission</span>
                    <span className="font-semibold text-ink-1 font-serif">{formatINR(model.mfa)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-navy-4/20">
                    <span className="text-ink-2">Travel Allowance (TA)</span>
                    <span className="font-semibold text-ink-1 font-serif">{formatINR(model.ta)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-ink-2">Accrued FD Pension</span>
                    <span className="font-semibold text-ink-1 font-serif">{formatINR(model.fdAccrual)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic">Commission metrics not computed.</p>
              )}
              <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30 text-xs">
                <h4 className="text-[10px] font-bold uppercase text-gold-tan mb-0.5">Monthly Payouts Log</h4>
                <p className="text-[10px] text-ink-2 italic">Payout logs appear after monthly accounts finalize.</p>
              </div>
            </div>
          </div>

          {/* Network Downlines */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <INetwork size={16} /> Recursive Team Downline
            </h3>
            {downline.length ? (
              <div className="border border-navy-4 rounded-card overflow-hidden">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th className="py-2">Agent ID</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Rank</th>
                      <th className="py-2">Sponsor</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downline.slice(0, 6).map((x) => (
                      <tr key={x.id}>
                        <td className="py-2 font-mono text-[10px] font-semibold text-ink-1">{x.sponsorCode || '—'}</td>
                        <td className="py-2 font-medium text-ink-1">{x.name}</td>
                        <td className="py-2"><RankBadge rank={x.rank} size="sm" /></td>
                        <td className="py-2 text-ink-2">{x.referredBy === id ? 'This Agent' : sponsorName(x.referredBy)}</td>
                        <td className="py-2"><StatusBadge status={x.status || 'active'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {downline.length > 6 && (
                  <div className="p-2.5 text-center text-xs text-ink-2 bg-navy-2/40 border-t border-navy-4">
                    Showing 6 of {downline.length} downline network agents.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-ink-2 italic bg-navy-2/30 p-4 rounded-card border border-navy-4/50 text-center">
                This agent has not recruited any team downline members yet.
              </div>
            )}
          </div>

          {/* Activity Timeline & Promotions */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Timeline */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <IClock size={16} /> Activity Timeline
              </h3>
              <div className="relative pl-4 border-l border-navy-4 space-y-3.5 text-xs text-ink-2">
                <div className="relative">
                  <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-gold-1" />
                  <p className="font-semibold text-ink-1">Profile Onboarded</p>
                  <p className="text-[10px]">{m.joinDate ? fmtDate(m.joinDate) : '—'}</p>
                </div>
                {m.profileCompleted && (
                  <div className="relative">
                    <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-ok" />
                    <p className="font-semibold text-ink-1">Bank & ID Validation Verified</p>
                    <p className="text-[10px]">Onboarding verification finalized by Agent</p>
                  </div>
                )}
              </div>
            </div>

            {/* Promotion History */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <ITrophy size={16} /> Promotion History Log
              </h3>
              <div className="relative pl-4 border-l border-navy-4 space-y-3.5 text-xs text-ink-2">
                <div className="relative">
                  <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-gold-1" />
                  <p className="font-semibold text-ink-1">Assigned Initial Rank: AO</p>
                  <p className="text-[10px]">{m.joinDate ? fmtDate(m.joinDate) : '—'}</p>
                </div>
                {m.rank > 1 && (
                  <div className="relative">
                    <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-gold-2" />
                    <p className="font-semibold text-ink-1">Promoted to Current Rank: {rank.code}</p>
                    <p className="text-[10px]">Promotions checked annually according to system records.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
