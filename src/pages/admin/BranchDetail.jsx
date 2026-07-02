import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, where } from 'firebase/firestore'
import { useDoc, useCollection, fetchCollection } from '../../hooks/useFirestore'
import { updateBranch } from '../../lib/admin'
import { fmtDate, formatINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IBuilding, IUsers, IDoc, ICash, IClock, IPlus } from '../../components/ui/icons'
import toast from 'react-hot-toast'

export default function BranchDetail() {
  const { id } = useParams()
  const branchDoc = useDoc(id ? `branches/${id}` : null)
  const allUsers = useCollection('users')
  
  const [branchPlans, setBranchPlans] = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const b = branchDoc.data

  // Get agents belonging to this branch
  const branchAgents = useMemo(() => {
    if (!id || !allUsers.data) return []
    return allUsers.data.filter((u) => u.branchId === id)
  }, [allUsers.data, id])

  // Get manager name
  const managerName = useMemo(() => {
    if (!b?.managerId || !allUsers.data) return '—'
    return allUsers.data.find((u) => u.id === b.managerId)?.name || '—'
  }, [b?.managerId, allUsers.data])

  // Get rank distribution in this branch
  const rankDistribution = useMemo(() => {
    const dist = {}
    branchAgents.forEach((a) => {
      const r = a.rank || 1
      dist[r] = (dist[r] || 0) + 1
    })
    return Object.entries(dist)
      .map(([rank, count]) => ({ rank: Number(rank), count }))
      .sort((a, b) => b.rank - a.rank)
  }, [branchAgents])

  // Fetch plans associated with this branch's agents
  useEffect(() => {
    if (branchAgents.length === 0) {
      setBranchPlans([])
      setPlansLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setPlansLoading(true)
        const agentIds = branchAgents.map((a) => a.id).slice(0, 10) // fetch for first 10 for safety limits
        const plansData = await fetchCollection('plans', [where('agentId', 'in', agentIds)])
        if (!cancelled) {
          setBranchPlans(plansData)
        }
      } catch (e) {
        console.error('Error fetching branch plans:', e)
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchAgents])

  const toggleStatus = async () => {
    if (!b) return
    setUpdating(true)
    const nextStatus = b.status === 'inactive' ? 'active' : 'inactive'
    try {
      await updateBranch(id, { status: nextStatus })
      toast.success(`Branch ${nextStatus === 'active' ? 'activated' : 'deactivated'} successfully`)
    } catch {
      toast.error('Failed to change branch status')
    } finally {
      setUpdating(false)
    }
  }

  const loading = branchDoc.loading || allUsers.loading || plansLoading

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  if (!branchDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Branch Not Found</h2>
        <p className="text-sm text-ink-2">This branch does not exist in the database.</p>
        <Link to="/admin/branches" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Branches</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Card */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IBuilding size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{b.name}</h1>
                <StatusBadge status={b.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">Branch Code: {b.branchCode || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleStatus}
              disabled={updating}
              className={`py-2 px-4 text-xs font-bold uppercase rounded-md tracking-wider transition-all shadow-sm ${
                b.status === 'inactive' 
                  ? 'bg-ok text-white hover:bg-ok-hover' 
                  : 'bg-danger text-white hover:bg-danger-hover'
              }`}
            >
              {updating ? 'Updating...' : b.status === 'inactive' ? 'Activate Branch' : 'Deactivate Branch'}
            </button>
            <Link to="/admin/branches" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Agents */}
        <div className="card p-5 border-l-2 border-l-[#A3906B]">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Agents</span>
            <IUsers size={18} className="text-[#A3906B]" />
          </div>
          <p className="text-2xl font-bold text-ink-1 font-serif mt-2">{branchAgents.length}</p>
          <div className="border-t border-dashed border-navy-4/50 my-2.5" />
          <p className="text-[10px] text-ink-2 font-medium">Assigned to this branch</p>
        </div>

        {/* Business Volume */}
        <div className="card p-5 border-l-2 border-l-[#8FA382]">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Business Volume</span>
            <ICash size={18} className="text-[#8E9CA3]" />
          </div>
          <p className="text-2xl font-bold text-ink-1 font-serif mt-2">
            {formatINR(branchPlans.reduce((sum, p) => sum + (p.monthlyAmount || p.fdAmount || 0), 0))}
          </p>
          <div className="border-t border-dashed border-navy-4/50 my-2.5" />
          <p className="text-[10px] text-ink-2 font-medium">Branch cumulative sales (Real-time)</p>
        </div>

        {/* Monthly Performance */}
        <div className="card p-5 border-l-2 border-l-[#D29E6B]">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Monthly Sales</span>
            <ICash size={18} className="text-[#BF8955]" />
          </div>
          <p className="text-2xl font-bold text-ink-1 font-serif mt-2">₹0</p>
          <div className="border-t border-dashed border-navy-4/50 my-2.5" />
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-ink-2 font-medium">Imported this month</span>
            <span className="text-gold font-bold">MTD</span>
          </div>
        </div>

        {/* Imported Policies */}
        <div className="card p-5 border-l-2 border-l-[#7EB59E]">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Imported Policies</span>
            <IDoc size={18} className="text-[#559E7E]" />
          </div>
          <p className="text-2xl font-bold text-ink-1 font-serif mt-2">{branchPlans.length}</p>
          <div className="border-t border-dashed border-navy-4/50 my-2.5" />
          <p className="text-[10px] text-ink-2 font-medium">Total policies linked to agents</p>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Branch Profile Details */}
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IBuilding size={16} /> Branch Profile
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] text-ink-2">Branch Manager</span>
                <span className="font-semibold text-ink-1">{managerName}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Contact Number</span>
                <span className="font-semibold text-ink-1 font-mono">{b.contactNumber || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Email Address</span>
                <span className="font-semibold text-ink-1">{b.email || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">City & State</span>
                <span className="font-semibold text-ink-1">{b.city}, {b.state}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Branch Address</span>
                <span className="font-semibold text-ink-1 whitespace-pre-wrap">{b.address || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Created Date</span>
                <span className="font-semibold text-ink-1">{b.createdAt ? fmtDate(b.createdAt) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Rank Distribution widget */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Rank Distribution
            </h3>
            {rankDistribution.length ? (
              <div className="space-y-3">
                {rankDistribution.map((dist) => (
                  <div key={dist.rank} className="flex justify-between items-center text-xs">
                    <RankBadge rank={dist.rank} size="sm" showName />
                    <span className="font-mono font-bold text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                      {dist.count} {dist.count === 1 ? 'agent' : 'agents'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-2 text-center">No agents assigned to this branch.</p>
            )}
          </div>
        </div>

        {/* Right Column - Agents List Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Agents Assigned to Branch
            </h3>
            {branchAgents.length ? (
              <div className="border border-navy-4 rounded-card overflow-hidden">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th className="py-2">Agent ID</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Rank</th>
                      <th className="py-2">Phone</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchAgents.map((agent) => (
                      <tr key={agent.id}>
                        <td className="py-2 font-mono text-[10px] font-semibold text-ink-1">
                          <Link to={`/admin/members/${agent.id}`} className="hover:text-gold-1 hover:underline">
                            {agent.sponsorCode || '—'}
                          </Link>
                        </td>
                        <td className="py-2 font-medium text-ink-1">
                          <Link to={`/admin/members/${agent.id}`} className="hover:text-gold-1 hover:underline">
                            {agent.name}
                          </Link>
                          <div className="text-[10px] text-ink-2">{agent.email}</div>
                        </td>
                        <td className="py-2">
                          <RankBadge rank={agent.rank} size="sm" />
                        </td>
                        <td className="py-2 text-ink-2 font-mono">{agent.phone || '—'}</td>
                        <td className="py-2">
                          <StatusBadge status={agent.status || 'active'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-ink-2 italic bg-navy-2/30 p-4 rounded-card border border-navy-4/50 text-center">
                There are no agents registered under this branch office.
              </div>
            )}
          </div>

          {/* Premium Visual Placeholders for Imported Policies */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Premium Policies Log (Bank Import)
            </h3>
            <div className="rounded-card border border-dashed border-navy-4 bg-navy-2/30 p-6 text-center text-xs text-ink-2 space-y-3">
              <p>Premium policy accounts and deposits imported from the bank's daily transaction Excel sheets will list here.</p>
              <div className="flex justify-center gap-2">
                <span className="text-[10px] bg-gold-1/10 border border-gold-1/25 px-2.5 py-1 rounded text-gold-1">Transaction Ledger Placeholder</span>
                <span className="text-[10px] bg-navy-4/30 border border-navy-4 px-2.5 py-1 rounded text-ink-2 font-mono">Future Integration Area</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
