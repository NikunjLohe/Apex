import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { useCollection } from '../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDate, fmtDateTime, toDate } from '../utils/format'
import RankBadge from '../components/ui/RankBadge'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../components/ui/LoadingSkeleton'
import { 
  IUsers, ICash, IAlert, ICalendar, IPlus, IDoc, IDashboard, IBuilding, INetwork, IClock, ISettings 
} from '../components/ui/icons'
import MyEarnings from './earnings/MyEarnings'
import { useRanks } from '../contexts/RanksContext'

export default function Dashboard() {
  const { profile, isSuperAdmin } = useAuth()
  const { can } = usePermission()
  const { getRank } = useRanks()

  // If the user is a normal agent (rank < 10), render MyEarnings dashboard
  if (!isSuperAdmin && (profile?.rank || 0) < 10) {
    return <MyEarnings />
  }

  // Load Firestore collections
  const customers = useCollection('customers')
  const plans = useCollection('plans')
  const payments = useCollection('payments')
  const users = useCollection('users')
  const branches = useCollection('branches')
  const imports = useCollection('imports')
  const payouts = useCollection('payouts')

  const loading = customers.loading || plans.loading || payments.loading || users.loading || branches.loading || imports.loading || payouts.loading

  // Admin and Super Admin Stats calculation
  const stats = useMemo(() => {
    if (loading) return {}
    const today0 = startOfDay(new Date())
    const month0 = startOfMonth(new Date())

    const todayCollection = payments.data
      .filter((p) => toDate(p.paidDate) >= today0)
      .reduce((s, p) => s + (p.amount || 0), 0)
    const monthCollection = payments.data
      .filter((p) => toDate(p.paidDate) >= month0)
      .reduce((s, p) => s + (p.amount || 0), 0)

    const activePlans = plans.data.filter((p) => p.status === 'active')
    const defaulters = activePlans.filter((p) => {
      const due = toDate(p.nextDueDate)
      return due && due < today0
    })
    const maturingThisMonth = plans.data.filter((p) => {
      const m = toDate(p.maturityDate)
      return m && m >= month0 && m <= new Date(month0.getFullYear(), month0.getMonth() + 1, 0)
    })

    // Branch metadata
    const activeBranches = branches.data.filter(b => b.status !== 'inactive').length
    const inactiveBranches = branches.data.filter(b => b.status === 'inactive').length

    // Rank counts
    const rankCounts = {}
    users.data.forEach((u) => {
      const r = u.rank || 1
      rankCounts[r] = (rankCounts[r] || 0) + 1
    })

    // Sorted agents distribution by rank
    const rankDistribution = Object.entries(rankCounts)
      .map(([rk, count]) => ({ rank: Number(rk), count }))
      .sort((a, b) => b.rank - a.rank)

    // Recently joined agents (5 newest)
    const recentlyJoined = [...users.data]
      .sort((a, b) => {
        const timeA = a.joinDate ? (a.joinDate.seconds ? a.joinDate.seconds * 1000 : new Date(a.joinDate).getTime()) : 0
        const timeB = b.joinDate ? (b.joinDate.seconds ? b.joinDate.seconds * 1000 : new Date(b.joinDate).getTime()) : 0
        return timeB - timeA
      })
      .slice(0, 5)

    // Phase 3 calculations
    // Today's imported policies
    const todayImportedPolicies = plans.data.filter((p) => toDate(p.createdAt) >= today0).length

    // Today's imported customers
    const todayImportedCustomers = customers.data.filter((c) => toDate(c.createdAt) >= today0).length

    // Total failed import rows
    const pendingImportErrors = imports.data.reduce((sum, imp) => sum + (imp.failedRows || 0), 0)

    // Recent imports (last 3 upload sessions)
    const recentImports = [...imports.data]
      .sort((a, b) => {
        const timeA = a.importDate ? (a.importDate.seconds ? a.importDate.seconds * 1000 : new Date(a.importDate).getTime()) : 0
        const timeB = b.importDate ? (b.importDate.seconds ? b.importDate.seconds * 1000 : new Date(b.importDate).getTime()) : 0
        return timeB - timeA
      })
      .slice(0, 3)

    // Recent policies (last 5)
    const recentPolicies = [...plans.data]
      .sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime()) : 0
        const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime()) : 0
        return timeB - timeA
      })
      .slice(0, 5)

    // Phase 4 calculations
    const currMonth = new Date().getMonth() + 1
    const currYear = new Date().getFullYear()

    const monthlyCommission = payouts.data
      .filter(p => p.month === currMonth && p.year === currYear)
      .reduce((sum, p) => sum + (p.totalPayable || 0), 0)

    const pendingPayouts = payouts.data
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + (p.totalPayable || 0), 0)

    const paidPayouts = payouts.data
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.totalPayable || 0), 0)

    // Highest earning agents: group payouts by agent sponsorCode and sum totalPayable
    const agentEarnings = {}
    payouts.data.forEach((p) => {
      const key = p.sponsorCode || '—'
      if (!agentEarnings[key]) {
        agentEarnings[key] = { name: p.agentName, code: p.sponsorCode, total: 0 }
      }
      agentEarnings[key].total += p.totalPayable || 0
    })

    const highestEarning = Object.values(agentEarnings)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    // Recent financial activity (latest 5 payouts generated)
    const recentFinancial = [...payouts.data]
      .sort((a, b) => {
        const timeA = a.generatedDate?.seconds ? a.generatedDate.seconds * 1000 : 0
        const timeB = b.generatedDate?.seconds ? b.generatedDate.seconds * 1000 : 0
        return timeB - timeA
      })
      .slice(0, 5)

    return {
      customers: customers.data.length,
      activePlans: activePlans.length,
      todayCollection,
      monthCollection,
      defaulters: defaulters.length,
      maturingThisMonth: maturingThisMonth.length,
      recent: [...payments.data].sort((a, b) => (toDate(b.paidDate) || 0) - (toDate(a.paidDate) || 0)).slice(0, 5),
      totalAgents: users.data.length,
      totalBranches: branches.data.length,
      activeBranches,
      inactiveBranches,
      rankDistribution,
      recentlyJoined,
      // Phase 3 stats
      todayImportedPolicies,
      todayImportedCustomers,
      pendingImportErrors,
      recentImports,
      recentPolicies,
      // Phase 4 stats
      monthlyCommission,
      pendingPayouts,
      paidPayouts,
      highestEarning,
      recentFinancial,
    }
  }, [customers.data, plans.data, payments.data, users.data, branches.data, imports.data, payouts.data, loading])

  // KPI configurations
  const cards = useMemo(() => {
    if (loading) return []
    return [
      {
        label: 'Total Agents Registered',
        value: stats.totalAgents,
        icon: <IUsers size={19} />,
        to: '/admin/members',
        borderLeftClass: 'border-l-[4.5px] border-l-[#A3906B]',
        iconBgClass: 'bg-[#F9F7F3] border-[#EDE9E0] text-[#A3906B]',
        badge: `No. ${String(stats.totalAgents).padStart(4, '0')}`,
        footerLeft: 'Active in system',
        footerRight: '—',
        footerRightColor: 'text-ink-2',
      },
      {
        label: 'Total Branch Offices',
        value: stats.totalBranches,
        icon: <IBuilding size={19} />,
        to: '/admin/branches',
        borderLeftClass: 'border-l-[4.5px] border-l-[#8FA382]',
        iconBgClass: 'bg-[#F4F6F2] border-[#E8ECE5] text-[#7A8E6E]',
        badge: `No. ${String(stats.totalBranches).padStart(4, '0')}`,
        footerLeft: `${stats.activeBranches} Active / ${stats.inactiveBranches} Inactive`,
        footerRight: '—',
        footerRightColor: 'text-ink-2',
      },
      {
        label: 'Month Collection (MTD)',
        value: formatCompactINR(stats.monthCollection),
        icon: <ICash size={19} />,
        to: '/reports/collections',
        borderLeftClass: 'border-l-[4.5px] border-l-[#D29E6B]',
        iconBgClass: 'bg-[#FAF6F2] border-[#F2ECE5] text-[#BF8955]',
        badge: 'MTD',
        footerLeft: "Premium sales totals",
        footerRight: 'Today: ' + formatINR(stats.todayCollection),
        footerRightColor: 'text-gold font-semibold',
      },
    ]
  }, [stats, loading])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <SkeletonStats count={3} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">Portal Operations Summary</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">
            {profile?.name || 'Super Admin'}
          </h2>
        </div>
        <div className="flex gap-2.5">
          <Link to="/admin/payouts" className="btn-gold py-2 text-sm font-semibold shadow-sm flex items-center gap-1.5">
            <ICash size={16} /> Payout Engine
          </Link>
          <Link to="/admin/import" className="btn-ghost py-2 text-sm font-semibold shadow-sm flex items-center gap-1.5">
            <IDoc size={16} /> Import Center
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={c.to} className={`card block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md relative overflow-hidden flex flex-col justify-between h-44 ${c.borderLeftClass}`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${c.iconBgClass}`}>
                    {c.icon}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-navy-4/80 bg-navy-1 text-ink-2 font-bold tracking-wide">
                    {c.badge}
                  </span>
                </div>
                <p className="mt-4 text-xs font-medium text-ink-2/80 tracking-wide">{c.label}</p>
                <p className="text-2xl font-bold font-serif text-ink-1 mt-1 leading-none">{c.value}</p>
              </div>
              <div>
                <div className="border-t border-dashed border-navy-4/80 my-2.5" />
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-2 font-medium">{c.footerLeft}</span>
                  <span className={c.footerRightColor}>{c.footerRight}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Phase 4 Financial KPIs widgets */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="card p-4 border-l-2 border-l-gold-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Monthly Commission</span>
          <span className="text-xl font-bold font-serif text-ink-1 mt-1 block">{formatINR(stats.monthlyCommission)}</span>
        </div>
        <div className="card p-4 border-l-2 border-l-ok">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Paid Payouts</span>
          <span className="text-xl font-bold font-serif text-ok mt-1 block">{formatINR(stats.paidPayouts)}</span>
        </div>
        <Link to="/admin/payouts" className="card p-4 border-l-2 border-l-danger hover:bg-navy-2/30 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Pending Payouts</span>
          <span className="text-xl font-bold font-serif text-danger mt-1 block">{formatINR(stats.pendingPayouts)}</span>
        </Link>
      </div>

      {/* Admin Grid Sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Left Column: Recent Upload History & Rank distribution */}
        <div className="space-y-6">
          {/* Highest Earning Agents list */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <INetwork size={16} /> Highest Earning Agents
            </h3>
            {stats.highestEarning.length ? (
              <div className="space-y-3">
                {stats.highestEarning.map((agent) => (
                  <div key={agent.code} className="flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold text-ink-1 block">{agent.name}</span>
                      <span className="text-[10px] text-ink-2 font-mono">{agent.code}</span>
                    </div>
                    <span className="font-mono font-bold text-gold bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                      {formatINR(agent.total)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-2 text-center">No payouts calculated yet.</p>
            )}
          </div>

          {/* Recent Imports list */}
          <div className="card p-5 space-y-4">
            <div className="flex justify-between items-center pb-1.5 border-b border-navy-4/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <IClock size={16} /> Recent Imports
              </h3>
              <Link to="/admin/import/history" className="text-xs font-bold text-gold hover:underline">
                History &rarr;
              </Link>
            </div>
            {stats.recentImports.length ? (
              <div className="space-y-3.5">
                {stats.recentImports.map((imp) => (
                  <div key={imp.id} className="text-xs space-y-1 bg-navy-2/40 border border-navy-4 p-3 rounded-card">
                    <div className="flex justify-between font-mono text-[10px] text-ink-2">
                      <span>{imp.importDate ? fmtDate(imp.importDate) : '—'}</span>
                      <span className={imp.failedRows > 0 ? 'text-danger font-semibold' : 'text-ok font-semibold'}>
                        {imp.failedRows > 0 ? `${imp.failedRows} failed` : 'All Success'}
                      </span>
                    </div>
                    <p className="font-semibold text-ink-1 font-mono truncate">{imp.fileName}</p>
                    <div className="text-[10px] text-ink-2 mt-1">
                      Success: {imp.successRows} / Total: {imp.totalRows}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-4">No import sessions executed yet.</p>
            )}
          </div>
        </div>

        {/* Right Column: Tables and logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Financial Activity ledger */}
          <div className="card p-5 space-y-4">
            <div className="flex justify-between items-center pb-1.5 border-b border-navy-4/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ICash size={16} /> Recent Payouts Activity
              </h3>
              <Link to="/admin/payouts" className="text-xs font-bold text-gold hover:underline">
                Payouts &rarr;
              </Link>
            </div>
            {stats.recentFinancial.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Month</th>
                      <th>Policies</th>
                      <th>Total Commission</th>
                      <th>Net Payable</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentFinancial.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{p.sponsorCode}</span>
                        </td>
                        <td className="font-medium text-ink-2">{p.month}/{p.year}</td>
                        <td className="font-mono text-ink-1 font-bold">{p.policiesCount}</td>
                        <td className="text-ink-1">{formatINR(p.totalCommission)}</td>
                        <td className="font-bold text-gold">{formatINR(p.totalPayable)}</td>
                        <td>
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-4">No payouts activity logged yet.</p>
            )}
          </div>

          {/* Recent Policies table */}
          <div className="card p-5 space-y-4">
            <div className="flex justify-between items-center pb-1.5 border-b border-navy-4/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <IDoc size={16} /> Recent Imported Policies
              </h3>
              <Link to="/admin/policies" className="text-xs font-bold text-gold hover:underline">
                Ledger &rarr;
              </Link>
            </div>
            {stats.recentPolicies.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy No.</th>
                      <th>Customer Name</th>
                      <th>Agent Name</th>
                      <th>Product</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentPolicies.map((p) => {
                      const isRDPlan = p.type?.toLowerCase().startsWith('rd')
                      return (
                        <tr key={p.id}>
                          <td className="font-mono text-gold font-semibold">
                            <Link to={`/admin/policies/${p.id}`} className="hover:underline">
                              {p.policyNumber || '—'}
                            </Link>
                          </td>
                          <td className="font-semibold text-ink-1">{p.customerName}</td>
                          <td className="text-ink-2 font-medium">{p.agentName || '—'}</td>
                          <td className="text-ink-2 font-semibold uppercase">{p.type || '—'}</td>
                          <td className="font-semibold text-ink-1">
                            {isRDPlan ? (
                              <span>{formatINR(p.monthlyAmount)} /mo</span>
                            ) : (
                              <span>{formatINR(p.fdAmount)} Total</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-4">No policies loaded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
