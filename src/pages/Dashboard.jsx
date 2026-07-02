import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, startOfDay, subMonths, format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { useCollection } from '../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../utils/format'
import RankBadge from '../components/ui/RankBadge'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../components/ui/LoadingSkeleton'
import { 
  IUsers, ICash, IAlert, ICalendar, IPlus, IDoc, IDashboard, IBuilding, INetwork, IClock, ITrophy 
} from '../components/ui/icons'
import MyEarnings from './earnings/MyEarnings'
import { useRanks } from '../contexts/RanksContext'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

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
  const promotions = useCollection('promotions_history')

  const loading = customers.loading || plans.loading || payments.loading || users.loading || branches.loading || imports.loading || payouts.loading || promotions.loading

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
    
    // Total Business Volume (sum of RD monthly amounts * 12 + FD lump sums)
    const totalBusiness = plans.data.reduce((sum, p) => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
    }, 0)

    // Monthly MTD Business Volume
    const monthlyBusiness = plans.data
      .filter(p => toDate(p.startDate) >= month0)
      .reduce((sum, p) => {
        const isRD = p.type?.toLowerCase().startsWith('rd')
        return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
      }, 0)

    const activeAgents = users.data.filter(u => u.status === 'active').length

    // Dynamic Monthly Growth Chart Data (last 6 months)
    const growthData = Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(new Date(), 5 - i)
      const monthLabel = format(date, 'MMM yy')
      const targetMonth = date.getMonth() + 1
      const targetYear = date.getFullYear()
      
      const sales = plans.data
        .filter(p => {
          const sd = toDate(p.startDate)
          return sd && sd.getMonth() + 1 === targetMonth && sd.getFullYear() === targetYear
        })
        .reduce((sum, p) => {
          const isRD = p.type?.toLowerCase().startsWith('rd')
          return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
        }, 0)

      return { month: monthLabel, Business: sales }
    })

    // Branch Performance Metrics
    const branchPerformance = branches.data.map(b => {
      const bPlans = plans.data.filter(p => p.branchId === b.id)
      const sales = bPlans.reduce((sum, p) => {
        const isRD = p.type?.toLowerCase().startsWith('rd')
        return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
      }, 0)
      return { name: b.name, Sales: sales }
    }).sort((a, b) => b.Sales - a.Sales).slice(0, 5)

    // Top Performing Agents
    const topAgentsList = users.data
      .map(u => ({
        id: u.id,
        name: u.name,
        code: u.sponsorCode || '—',
        rank: u.rank || 1,
        volume: u.businessVolume || 0
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5)

    // Phase 3 calculations
    const todayImportedPolicies = plans.data.filter((p) => toDate(p.createdAt) >= today0).length
    const todayImportedCustomers = customers.data.filter((c) => toDate(c.createdAt) >= today0).length
    const pendingImportErrors = imports.data.reduce((sum, imp) => sum + (imp.failedRows || 0), 0)

    const recentImports = [...imports.data]
      .sort((a, b) => (toDate(b.importDate) || 0) - (toDate(a.importDate) || 0))
      .slice(0, 3)

    const recentPolicies = [...plans.data]
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
      .slice(0, 5)

    // Phase 4 calculations
    const totalCommission = payouts.data.reduce((sum, p) => sum + (p.totalCommission || 0), 0)
    const pendingPayouts = payouts.data
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + (p.totalPayable || 0), 0)

    // Recent activities feed
    const recentFinancial = [...payouts.data]
      .sort((a, b) => (toDate(b.generatedDate) || 0) - (toDate(a.generatedDate) || 0))
      .slice(0, 5)

    return {
      totalBusiness,
      monthlyBusiness,
      activeAgents,
      activePlans: activePlans.length,
      todayCollection,
      monthCollection,
      totalCommission,
      pendingPayouts,
      defaulters: defaulters.length,
      recentlyJoined: users.data.slice(0, 5),
      totalAgents: users.data.length,
      totalBranches: branches.data.length,
      todayImportedPolicies,
      todayImportedCustomers,
      pendingImportErrors,
      recentImports,
      recentPolicies,
      growthData,
      branchPerformance,
      topAgentsList,
      recentFinancial,
      promotionsCount: promotions.data.length,
    }
  }, [customers.data, plans.data, payments.data, users.data, branches.data, imports.data, payouts.data, promotions.data, loading])

  // KPI Configurations
  const cards = useMemo(() => {
    if (loading) return []
    return [
      {
        label: 'Total Business Volume',
        value: formatINR(stats.totalBusiness),
        icon: <ITrophy size={19} />,
        borderLeftClass: 'border-l-[4.5px] border-l-[#A3906B]',
        iconBgClass: 'bg-[#F9F7F3] border-[#EDE9E0] text-[#A3906B]',
        badge: 'LIFETIME',
        footerLeft: 'Total premium sales',
      },
      {
        label: 'MTD Monthly Business',
        value: formatINR(stats.monthlyBusiness),
        icon: <ICash size={19} />,
        borderLeftClass: 'border-l-[4.5px] border-l-[#8FA382]',
        iconBgClass: 'bg-[#F4F6F2] border-[#E8ECE5] text-[#7A8E6E]',
        badge: 'CURRENT MONTH',
        footerLeft: 'Monthly targets metrics',
      },
      {
        label: 'Total Paid Commissions',
        value: formatINR(stats.totalCommission),
        icon: <ICash size={19} />,
        borderLeftClass: 'border-l-[4.5px] border-l-[#D29E6B]',
        iconBgClass: 'bg-[#FAF6F2] border-[#F2ECE5] text-[#BF8955]',
        badge: 'COMMISSIONS',
        footerLeft: 'Ledger payout credits',
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
      {/* Greeting Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-navy-4/50">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">Branch Operations Portal Summary</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">
            {profile?.name || 'Super Admin'}
          </h2>
        </div>
        <div className="flex gap-2.5">
          <Link to="/admin/import" className="btn-gold py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5">
            <IDoc size={14} /> Import Center
          </Link>
          <Link to="/admin/payouts" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5">
            <ICash size={14} /> Payouts Engine
          </Link>
        </div>
      </div>

      {/* KPI stats section */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className={`card p-5 relative overflow-hidden flex flex-col justify-between h-36 ${c.borderLeftClass}`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${c.iconBgClass}`}>
                    {c.icon}
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded border border-navy-4 bg-navy-1 text-ink-2 font-mono uppercase">
                    {c.badge}
                  </span>
                </div>
                <p className="mt-4 text-xs font-semibold text-ink-2 tracking-wide">{c.label}</p>
                <p className="text-2xl font-bold font-serif text-ink-1 mt-1 leading-none">{c.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Dynamic Visual Growth Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business growth line area chart */}
        <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Monthly Business Growth (6-Month Sales Volume)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A3906B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#A3906B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="month" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={(val) => `₹${formatCompactINR(val)}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }}
                  labelStyle={{ color: '#7A8E9E', fontWeight: 'bold' }}
                  itemStyle={{ color: '#A3906B' }}
                />
                <Area type="monotone" dataKey="Business" stroke="#A3906B" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Branch performance Bar Chart */}
        <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Branch Office Performance (Sales Rankings)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.branchPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="name" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={(val) => `₹${formatCompactINR(val)}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }}
                  labelStyle={{ color: '#7A8E9E', fontWeight: 'bold' }}
                  itemStyle={{ color: '#7A8E6E' }}
                />
                <Bar dataKey="Sales" fill="#7A8E6E" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Today's Import validations grid info */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="card p-4 border-l-2 border-l-gold-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Active Agents</span>
          <span className="text-xl font-bold font-serif text-ink-1 mt-1 block">{stats.activeAgents}</span>
        </div>
        <div className="card p-4 border-l-2 border-l-ok">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Active Policies</span>
          <span className="text-xl font-bold font-serif text-ok mt-1 block">{stats.activePlans}</span>
        </div>
        <div className="card p-4 border-l-2 border-l-gold">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Approved Promotions</span>
          <span className="text-xl font-bold font-serif text-gold-1 mt-1 block">{stats.promotionsCount}</span>
        </div>
        <Link to="/admin/import/history" className="card p-4 border-l-2 border-l-danger hover:bg-navy-2/30 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">Pending Import Errors</span>
          <span className="text-xl font-bold font-serif text-danger mt-1 block">{stats.pendingImportErrors}</span>
        </Link>
      </div>

      {/* Grid distributions panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Left Column: Top Performers lists */}
        <div className="space-y-6">
          {/* Top performing agents ranking */}
          <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Top Performing Agents
            </h3>
            {stats.topAgentsList.length > 0 ? (
              <div className="space-y-3">
                {stats.topAgentsList.map((agent, i) => (
                  <div key={agent.id} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink-2 font-mono w-4">{i + 1}.</span>
                      <div>
                        <span className="font-semibold text-ink-1 block">{agent.name}</span>
                        <span className="text-[9px] text-ink-2 font-mono uppercase">{agent.code}</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-gold bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                      {formatINR(agent.volume)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-4">No agent records found.</p>
            )}
          </div>

          {/* Recent upload history files */}
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
          {/* Recent Payouts approvals activity logs */}
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
                      <th>Period</th>
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

          {/* Recent Policies table list */}
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
