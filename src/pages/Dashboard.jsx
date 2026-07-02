import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { useCollection } from '../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../utils/format'
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

  // Load Firestore data
  const customers = useCollection('customers')
  const plans = useCollection('plans')
  const payments = useCollection('payments')
  const users = useCollection('users')
  const branches = useCollection('branches')

  const loading = customers.loading || plans.loading || payments.loading || users.loading || branches.loading

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
    }
  }, [customers.data, plans.data, payments.data, users.data, branches.data, loading])

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
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">Portal Administrator Overview</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">
            {profile?.name || 'Super Admin'}
          </h2>
        </div>
        <div className="flex gap-2.5">
          {can(CAP.ADMIN) && (
            <Link to="/admin/members" className="btn-ghost py-2 text-sm font-semibold shadow-sm flex items-center gap-1.5">
              <IUsers size={16} /> Manage Members
            </Link>
          )}
          {can(CAP.ADMIN) && (
            <Link to="/admin/branches" className="btn-ghost py-2 text-sm font-semibold shadow-sm flex items-center gap-1.5">
              <IBuilding size={16} /> Manage Branches
            </Link>
          )}
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

      {/* Admin Grid Sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Ranks and quick distributions */}
        <div className="space-y-6">
          {/* Rank Distribution Card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <INetwork size={16} /> Agents by Rank
            </h3>
            {stats.rankDistribution.length ? (
              <div className="space-y-3">
                {stats.rankDistribution.map((dist) => (
                  <div key={dist.rank} className="flex justify-between items-center text-xs">
                    <RankBadge rank={dist.rank} size="sm" showName />
                    <span className="font-mono font-bold text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                      {dist.count} {dist.count === 1 ? 'agent' : 'agents'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-2 text-center">No agents registered in system.</p>
            )}
          </div>

          {/* Quick System Settings overview */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <ISettings size={16} /> Master Operations Status
            </h3>
            <div className="space-y-2 text-xs text-ink-2">
              <div className="flex justify-between py-1 border-b border-navy-4/20">
                <span>Direct Customers</span>
                <span className="font-mono font-semibold text-ink-1">{stats.customers}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-navy-4/20">
                <span>Active Plans</span>
                <span className="font-mono font-semibold text-ink-1">{stats.activePlans}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Maturing Plans (Month)</span>
                <span className="font-mono font-semibold text-ink-1">{stats.maturingThisMonth}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Tables and logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recently Joined Agents */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IClock size={16} /> Recently Joined Agents
            </h3>
            {stats.recentlyJoined.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent ID</th>
                      <th>Name</th>
                      <th>Rank</th>
                      <th>Contact</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentlyJoined.map((m) => (
                      <tr key={m.id}>
                        <td className="font-mono font-semibold text-ink-1">
                          <Link to={`/admin/members/${m.id}`} className="hover:text-gold-1 hover:underline">
                            {m.sponsorCode || '—'}
                          </Link>
                        </td>
                        <td className="font-semibold text-ink-1">
                          <Link to={`/admin/members/${m.id}`} className="hover:text-gold-1 hover:underline">
                            {m.name}
                          </Link>
                          <div className="text-[10px] text-ink-2">{m.email}</div>
                        </td>
                        <td><RankBadge rank={m.rank} size="sm" /></td>
                        <td className="text-ink-2 font-mono">{m.phone || '—'}</td>
                        <td className="text-ink-2">{m.joinDate ? fmtDate(m.joinDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-2 text-center">No agents registered recently.</p>
            )}
          </div>

          {/* Recent Payments collections */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between pb-1.5 border-b border-navy-4/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ICash size={16} /> Recent Premium Receipts (Direct Log)
              </h3>
              <Link to="/reports/collections" className="text-xs font-bold text-gold hover:underline">
                View all &rarr;
              </Link>
            </div>
            {stats.recent.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Paid Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-ink-2">{p.receiptNumber}</td>
                        <td className="font-medium text-ink-1">{p.customerName || '—'}</td>
                        <td className="font-semibold text-ink-1">{formatINR(p.amount)}</td>
                        <td className="uppercase text-ink-2 font-semibold">{p.paymentMode}</td>
                        <td className="text-ink-2">{fmtDate(p.paidDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<ICash size={20} />} title="No collections recorded" message="Payments logged will show here." />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
