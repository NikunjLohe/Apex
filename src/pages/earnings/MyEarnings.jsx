import { useEffect, useMemo, useState } from 'react'
import { where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useFirestore'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate, toDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ICash, IShield, IClock, IDoc, IUsers, ICheck } from '../../components/ui/icons'

export default function MyEarnings() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const sponsorCode = profile?.sponsorCode || ''

  // Load Firestore collections dynamically
  const ownPlans = useCollection('plans', uid ? [where('agentId', '==', uid)] : null)
  const commissions = useCollection('commissions', uid ? [where('agentId', '==', uid)] : null)
  const payouts = useCollection('payouts', uid ? [where('agentId', '==', uid)] : null)
  const ledger = useCollection('income_ledger', sponsorCode ? [where('sponsorCode', '==', sponsorCode)] : null)
  const allUsers = useCollection('users')
  const enrolledCustomers = useCollection('customers', uid ? [where('enrolledBy', '==', uid)] : null)

  const { getRank, nextRank, config } = useRanks()

  // Selected payout detail view state
  const [selectedPayout, setSelectedPayout] = useState(null)

  const loading = ownPlans.loading || commissions.loading || payouts.loading || ledger.loading || allUsers.loading || enrolledCustomers.loading

  // Calculations
  const stats = useMemo(() => {
    if (loading) return {}

    const unpaidComms = commissions.data.filter(c => c.status === 'unpaid')
    const paidComms = commissions.data.filter(c => c.status === 'paid')

    const pendingAmount = unpaidComms.reduce((sum, c) => sum + (c.amount || 0), 0)
    const paidAmount = paidComms.reduce((sum, c) => sum + (c.amount || 0), 0)

    // Calculate current month volume sold
    const currMonth = new Date().getMonth() + 1
    const currYear = new Date().getFullYear()

    const monthPlans = ownPlans.data.filter(p => {
      const start = p.startDate?.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
      if (isNaN(start.getTime())) return false
      return (start.getMonth() + 1 === currMonth) && (start.getFullYear() === currYear)
    })

    const monthlyBusinessVolume = monthPlans.reduce((sum, p) => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
    }, 0)

    // Current Month Commissions Income
    const currentMonthIncome = commissions.data
      .filter(c => c.month === currMonth && c.year === currYear)
      .reduce((sum, c) => sum + (c.amount || 0), 0)

    // Sort payouts by date descending
    const sortedPayouts = [...payouts.data].sort((a, b) => {
      const timeA = a.generatedDate?.seconds ? a.generatedDate.seconds * 1000 : 0
      const timeB = b.generatedDate?.seconds ? b.generatedDate.seconds * 1000 : 0
      return timeB - timeA
    })

    const lastPayout = sortedPayouts.find(p => p.status === 'paid')

    // Sum of all-time business volume
    const lifetimeBusinessVolume = ownPlans.data.reduce((sum, p) => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
    }, 0)

    // Calculate MLM Team business volume recursively
    const visited = new Set()
    const getDownlineVolume = (parentId) => {
      let vol = 0
      allUsers.data.forEach(u => {
        if (u.referredBy === parentId && !visited.has(u.id)) {
          visited.add(u.id)
          vol += (u.businessVolume || 0) + getDownlineVolume(u.id)
        }
      })
      return vol
    }
    const teamBusiness = getDownlineVolume(uid)

    // Rank properties
    const rankIdx = (Number(profile?.rank) || 1) - 1
    const mfaTarget = config.MFA_TARGET?.[rankIdx] || 0
    const mfaAmount = config.MFA?.[rankIdx] || 0
    const pbTarget = config.PB_TARGET?.[rankIdx] || 0
    const pbAmount = config.PB_AMOUNT?.[rankIdx] || 0

    // Targets checks progress
    const mfaPct = mfaTarget > 0 ? Math.min(100, (monthlyBusinessVolume / mfaTarget) * 100) : 0
    const pbPct = pbTarget > 0 ? Math.min(100, (monthlyBusinessVolume / pbTarget) * 100) : 0

    // Recent Policies sold
    const recentPolicies = [...ownPlans.data]
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
      .slice(0, 5)

    // Recent Enrolled Customers
    const recentCustomers = [...enrolledCustomers.data]
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
      .slice(0, 5)

    return {
      pendingAmount,
      paidAmount,
      monthlyBusinessVolume,
      currentMonthIncome,
      lifetimeBusinessVolume,
      teamBusiness,
      lastPayout,
      sortedPayouts,
      mfaTarget,
      mfaAmount,
      pbTarget,
      pbAmount,
      mfaPct,
      pbPct,
      recentPolicies,
      recentCustomers,
    }
  }, [commissions.data, payouts.data, ownPlans.data, allUsers.data, enrolledCustomers.data, loading, profile?.rank, config, uid])

  const rank = getRank(profile?.rank)
  const next = nextRank(profile?.rank)

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Rank overview and summary */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink-1 font-serif">{profile?.name}</h2>
              <RankBadge rank={profile?.rank} />
            </div>
            <p className="mt-0.5 text-xs text-ink-2 font-mono">Rank Level: {rank.name} ({rank.code})</p>
          </div>
          <div className="text-right">
            <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Personal Business Volume</span>
            <span className="text-2xl font-extrabold text-gold font-serif mt-0.5 block">
              {formatINR(stats.lifetimeBusinessVolume)}
            </span>
          </div>
        </div>

        {next && (
          <div className="relative mt-5 pt-4 border-t border-navy-4/50">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-ink-2">Next Promotion Target: {next.code}</span>
              <span className="text-ink-1 font-mono">
                {formatINR(stats.lifetimeBusinessVolume)} / {formatINR(next.promoTarget || 50000)}
              </span>
            </div>
            <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
              <div 
                className="bg-gold h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, (stats.lifetimeBusinessVolume / (next.promoTarget || 50000)) * 100)}%` }} 
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-gold-1/10 text-gold-1 border border-gold-1/25">
            <ICash size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Pending commissions</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.pendingAmount)}</p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-ok/10 text-ok border border-ok/25">
            <ICheck size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Current Month Income</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.currentMonthIncome)}</p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-4 text-gold-1 border border-navy-4">
            <ITrophy size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Team Business Volume</p>
          <p className="text-lg font-bold text-ink-1 font-serif">
            {formatINR(stats.teamBusiness)}
          </p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-[#8FA382]/10 text-[#7A8E6E] border border-[#8FA382]/25">
            <IShield size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Monthly BV (Current)</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.monthlyBusinessVolume)}</p>
        </div>
      </div>

      {/* Target qualification check indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MFA Card */}
        <div className="card p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Monthly Field Allowance (MFA) Target
          </h3>
          {stats.mfaTarget > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-2">Target Volume: {formatINR(stats.mfaTarget)}</span>
                <span className="text-ink-1 font-semibold">Reward: {formatINR(stats.mfaAmount)}</span>
              </div>
              <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                <div className="bg-gold h-2 rounded-full transition-all duration-300" style={{ width: `${stats.mfaPct}%` }} />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-ink-2">Progress: {Math.round(stats.mfaPct)}%</span>
                <span className={stats.mfaPct >= 100 ? 'text-ok font-bold' : 'text-gold font-bold'}>
                  {stats.mfaPct >= 100 ? 'Qualified' : 'In Progress'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic">No field allowance target configured at this rank tier.</p>
          )}
        </div>

        {/* PB Card */}
        <div className="card p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Performance Bonus (PB) Target
          </h3>
          {stats.pbTarget > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-2">Target Volume: {formatINR(stats.pbTarget)}</span>
                <span className="text-ink-1 font-semibold">Reward: {formatINR(stats.pbAmount)}</span>
              </div>
              <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                <div className="bg-ok h-2 rounded-full transition-all duration-300" style={{ width: `${stats.pbPct}%` }} />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-ink-2">Progress: {Math.round(stats.pbPct)}%</span>
                <span className={stats.pbPct >= 100 ? 'text-ok font-bold' : 'text-gold font-bold'}>
                  {stats.pbPct >= 100 ? 'Achieved' : 'In Progress'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic">No performance bonus target configured at this rank tier.</p>
          )}
        </div>
      </div>

      {/* Recent Policies and Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Recent Policies list */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Recent Policies Sold
          </h3>
          {stats.recentPolicies.length ? (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Policy No.</th>
                    <th>Client Name</th>
                    <th>Product</th>
                    <th>Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPolicies.map(p => {
                    const isRD = p.type?.toLowerCase().startsWith('rd')
                    return (
                      <tr key={p.id}>
                        <td className="font-mono text-gold font-semibold">{p.policyNumber}</td>
                        <td className="font-semibold text-ink-1">{p.customerName}</td>
                        <td className="uppercase font-semibold text-ink-2">{p.type}</td>
                        <td className="font-mono font-bold text-ink-1">
                          {isRD ? `${formatINR(p.monthlyAmount)}/mo` : formatINR(p.fdAmount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No recent policies logged.</p>
          )}
        </div>

        {/* Recent Onboarded Customers */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Recently Onboarded Customers
          </h3>
          {stats.recentCustomers.length ? (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Client Name</th>
                    <th>Phone</th>
                    <th>Plans Count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="font-mono font-semibold text-gold">{c.customerId}</td>
                      <td className="font-semibold text-ink-1">{c.name}</td>
                      <td className="font-mono text-ink-2">{c.phone || '—'}</td>
                      <td className="font-bold text-ink-1">{c.plansCount || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No customer profiles onboarded yet.</p>
          )}
        </div>
      </div>

      {/* Payout statement and income breakdown history */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Payout Statements List */}
        <div className="card p-5 space-y-4 md:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Monthly Payout History
          </h3>
          {stats.sortedPayouts.length ? (
            <div className="space-y-3">
              {stats.sortedPayouts.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedPayout(p)}
                  className={`p-3 rounded-card border cursor-pointer transition-all ${
                    selectedPayout?.id === p.id 
                      ? 'border-gold-1 bg-gold-1/5' 
                      : 'border-navy-4 bg-navy-2/30 hover:bg-navy-2/60'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-ink-1">
                      {p.month}/{p.year}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-ink-2 mt-1">
                    <span>Policies: {p.policiesCount}</span>
                    <span className="font-bold text-ink-1 font-mono">{formatINR(p.totalPayable)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No payouts generated yet.</p>
          )}
        </div>

        {/* Income Breakdown detail view */}
        <div className="card p-5 space-y-4 md:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            {selectedPayout 
              ? `Statement Detail: ${selectedPayout.month}/${selectedPayout.year}` 
              : 'Statement Detail Preview'
            }
          </h3>
          {selectedPayout ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-navy-2/30 p-4 rounded-card border border-navy-4/50">
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Total Commission (MDA)</span>
                    <span className="text-sm font-bold text-ink-1">{formatINR(selectedPayout.totalCommission)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Field Allowance (MFA)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.mfa > 0 ? formatINR(selectedPayout.mfa) : '₹0'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Performance Bonus (PB)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.pb > 0 ? formatINR(selectedPayout.pb) : '₹0'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Travel Allowance (TA)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.ta > 0 ? formatINR(selectedPayout.ta) : '₹0'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-navy-4 pt-3">
                <span className="text-sm font-bold text-ink-1 font-serif">Total Net Payable</span>
                <span className="text-lg font-bold text-gold font-serif">{formatINR(selectedPayout.totalPayable)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-ink-2">
              <ICash size={24} className="mx-auto text-ink-2 mb-2" />
              Select a payout month from the history panel to audit your full breakdown statement.
            </div>
          )}
        </div>
      </div>

      {/* Income ledger audits */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
          Personal Income Ledger
        </h3>
        {ledger.data.length ? (
          <div className="table-wrap">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Credit Date</th>
                  <th>Policy No.</th>
                  <th>Customer</th>
                  <th>Plan Product</th>
                  <th>Payout Type</th>
                  <th>Percentage</th>
                  <th className="text-right">Credit Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.map(log => (
                  <tr key={log.id}>
                    <td className="font-mono text-ink-2">{log.createdAt ? fmtDate(log.createdAt) : '—'}</td>
                    <td className="font-mono text-ink-1 font-semibold">{log.policyNumber || '—'}</td>
                    <td className="font-semibold text-ink-1">{log.customerName || '—'}</td>
                    <td className="text-ink-2 font-semibold uppercase">{log.planCode || '—'}</td>
                    <td>
                      <span className="font-semibold text-ink-2 uppercase text-[10px] bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                        {log.type}
                      </span>
                    </td>
                    <td className="text-ink-2 font-mono">{log.percentage ? `${log.percentage}%` : '—'}</td>
                    <td className="text-right font-bold text-gold">{formatINR(log.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-2 italic py-4 text-center">No ledger logs recorded under this sponsor account yet.</p>
        )}
      </div>

    </div>
  )
}
