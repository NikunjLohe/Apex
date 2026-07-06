import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, subMonths, format } from 'date-fns'
import { where, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { useCollection, useDoc } from '../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../utils/format'
import RankBadge from '../components/ui/RankBadge'
import StatusBadge from '../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../components/ui/LoadingSkeleton'
import {
  IUsers, ICash, IAlert, ICalendar, IPlus, IDoc, IDashboard,
  IBuilding, INetwork, IClock, ITrophy
} from '../components/ui/icons'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts'
import MetricDetailModal from '../components/dashboard/MetricDetailModal'
import { useRanks } from '../contexts/RanksContext'

// ─── Super Admin Dashboard (unchanged) ───────────────────────────────────────
function SuperAdminDashboard() {
  const [activeMetricType, setActiveMetricType] = useState(null)
  const { data: summary, loading: summaryLoading } = useDoc('system_summaries/dashboard')
  const recentUsers    = useCollection('users',   [orderBy('createdAt',    'desc'), limit(5)], 'recent-users')
  const recentImports  = useCollection('imports', [orderBy('importDate',   'desc'), limit(3)], 'recent-imports')
  const recentPlans    = useCollection('plans',   [orderBy('createdAt',    'desc'), limit(5)], 'recent-plans')
  const recentPayouts  = useCollection('payouts', [orderBy('generatedDate','desc'), limit(5)], 'recent-payouts')
  const loading = summaryLoading || recentUsers.loading || recentImports.loading || recentPlans.loading || recentPayouts.loading
  const { profile } = useAuth()

  const stats = useMemo(() => ({
    totalBusiness:          summary?.totalBusiness         || 0,
    monthlyBusiness:        summary?.monthlyBusiness       || 0,
    activeAgents:           summary?.activeAgents          || 0,
    activePlans:            summary?.activePlans           || 0,
    totalCommission:        summary?.totalCommission       || 0,
    pendingPayouts:         summary?.pendingPayouts        || 0,
    promotionsCount:        summary?.promotionsCount       || 0,
    pendingImportErrors:    summary?.pendingImportErrors   || 0,
    topAgentsList:          summary?.topAgentsList         || [],
    branchPerformance:      summary?.branchPerformance     || [],
    growthData:             summary?.growthData            || [],
    recentImports:          recentImports.data             || [],
    recentPolicies:         recentPlans.data               || [],
    recentFinancial:        recentPayouts.data             || [],
  }), [summary, recentImports.data, recentPlans.data, recentPayouts.data])

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonStats count={3} />
      <SkeletonTable rows={5} cols={5} />
    </div>
  )

  const cards = [
    { type: 'total-business',    label: 'Total Business Volume',  value: formatINR(stats.totalBusiness),   icon: <ITrophy size={19} />, borderLeftClass: 'border-l-[4.5px] border-l-[#A3906B]', iconBgClass: 'bg-[#F9F7F3] border-[#EDE9E0] text-[#A3906B]', badge: 'LIFETIME' },
    { type: 'monthly-business',  label: 'MTD Monthly Business',   value: formatINR(stats.monthlyBusiness), icon: <ICash size={19} />,   borderLeftClass: 'border-l-[4.5px] border-l-[#8FA382]', iconBgClass: 'bg-[#F4F6F2] border-[#E8ECE5] text-[#7A8E6E]', badge: 'THIS MONTH' },
    { type: 'total-commissions', label: 'Total Paid Commissions', value: formatINR(stats.totalCommission), icon: <ICash size={19} />,   borderLeftClass: 'border-l-[4.5px] border-l-[#D29E6B]', iconBgClass: 'bg-[#FAF6F2] border-[#F2ECE5] text-[#BF8955]', badge: 'COMMISSIONS' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-navy-4/50">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">Branch Operations Portal Summary</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">{profile?.name || 'Super Admin'}</h2>
        </div>
        <div className="flex gap-2.5">
          <Link to="/admin/import" className="btn-gold py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5"><IDoc size={14} /> Import Center</Link>
          <Link to="/admin/payouts" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5"><ICash size={14} /> Payouts Engine</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div onClick={() => setActiveMetricType(c.type)} className={`card p-5 relative overflow-hidden flex flex-col justify-between h-36 cursor-pointer hover:bg-navy-2/30 hover:border-gold-1/30 hover:scale-[1.01] transition-all ${c.borderLeftClass}`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${c.iconBgClass}`}>{c.icon}</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded border border-navy-4 bg-navy-1 text-ink-2 font-mono uppercase">{c.badge}</span>
                </div>
                <p className="mt-4 text-xs font-semibold text-ink-2 tracking-wide">{c.label}</p>
                <p className="text-2xl font-bold font-serif text-ink-1 mt-1 leading-none">{c.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Monthly Business Growth</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#A3906B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#A3906B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="month" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={(v) => `₹${formatCompactINR(v)}`} />
                <Tooltip contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }} labelStyle={{ color: '#7A8E9E', fontWeight: 'bold' }} itemStyle={{ color: '#A3906B' }} />
                <Area type="monotone" dataKey="Business" stroke="#A3906B" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Branch Office Performance</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.branchPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="name" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={(v) => `₹${formatCompactINR(v)}`} />
                <Tooltip contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }} labelStyle={{ color: '#7A8E9E', fontWeight: 'bold' }} itemStyle={{ color: '#7A8E6E' }} />
                <Bar dataKey="Sales" fill="#7A8E6E" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[
          { type: 'active-agents',      label: 'Active Agents',       value: stats.activeAgents,        color: 'border-l-gold-1' },
          { type: 'active-policies',    label: 'Active Policies',     value: stats.activePlans,         color: 'border-l-ok' },
          { type: 'approved-promotions',label: 'Approved Promotions', value: stats.promotionsCount,     color: 'border-l-gold' },
          { type: 'import-errors',      label: 'Pending Import Errors',value: stats.pendingImportErrors,color: 'border-l-danger' },
        ].map((c) => (
          <div key={c.type} onClick={() => setActiveMetricType(c.type)} className={`card p-4 border-l-2 ${c.color} cursor-pointer hover:bg-navy-2/30 transition-all`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">{c.label}</span>
            <span className="text-xl font-bold font-serif text-ink-1 mt-1 block">{c.value}</span>
          </div>
        ))}
      </div>

      <MetricDetailModal open={activeMetricType !== null} metricType={activeMetricType} onClose={() => setActiveMetricType(null)} />
    </div>
  )
}

// ─── Progress Bar Component ───────────────────────────────────────────────────
function ProgressBar({ value, max, color = '#A3906B', label, current, target, suffix = '' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const remaining = Math.max(0, max - value)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-1">{label}</span>
        <span className="font-mono text-ink-2 text-[10px]">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-navy-4 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-ink-2">
        <span>Current: <span className="text-ink-1 font-semibold">{typeof current === 'number' ? formatINR(current) : current}{suffix}</span></span>
        <span>Target: <span className="text-ink-1 font-semibold">{typeof target === 'number' ? formatINR(target) : target}{suffix}</span></span>
      </div>
      {remaining > 0 && (
        <p className="text-[10px] text-gold-tan">Remaining: <span className="font-semibold">{typeof remaining === 'number' && max > 1000 ? formatINR(remaining) : remaining}{suffix}</span></p>
      )}
    </div>
  )
}

// ─── KPI Card Component ───────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accentColor = '#A3906B', badge, subtext }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 flex flex-col gap-2"
      style={{ borderLeftColor: accentColor, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg" style={{ backgroundColor: accentColor + '20' }}>
          <span style={{ color: accentColor }}>{icon}</span>
        </div>
        {badge && <span className="text-[9px] font-bold px-2 py-0.5 rounded border border-navy-4 bg-navy-1 text-ink-2 font-mono uppercase">{badge}</span>}
      </div>
      <p className="text-[10px] font-semibold text-ink-2 uppercase tracking-wider mt-1">{label}</p>
      <p className="text-xl font-bold font-serif text-ink-1 leading-none">{value}</p>
      {subtext && <p className="text-[10px] text-ink-2">{subtext}</p>}
    </motion.div>
  )
}

// ─── Professional Agent Dashboard ─────────────────────────────────────────────
function AgentDashboard() {
  const { profile } = useAuth()
  const { can } = usePermission()
  const { config, getRank, nextRank } = useRanks()
  const { data: promotionsConfig } = useDoc('config/promotions')

  const myId = profile?.uid || profile?.id || ''
  const myRank = Number(profile?.rank) || 1
  const rankObj = getRank(myRank)
  const nextRankObj = nextRank(myRank)

  // Sponsor data
  const sponsorId = profile?.referredBy || ''
  const { data: sponsorData } = useDoc(sponsorId ? `users/${sponsorId}` : null)

  // My customers and policies (keyed by agentCode or agentId)
  const agentCode = profile?.sponsorCode || ''
  const myPolicies  = useCollection('plans',    [where('agentCode', '==', agentCode), orderBy('createdAt', 'desc'), limit(5)],   'my-plans')
  const myCustomers = useCollection('customers', [where('agentCode', '==', agentCode), orderBy('createdAt', 'desc'), limit(5)],  'my-customers')
  const myCommissions = useCollection('commission_ledger', [where('agentId', '==', myId), orderBy('calculationDate', 'desc'), limit(5)], 'my-comm')

  // All my policies (for counts)
  const allMyPolicies  = useCollection('plans',     [where('agentCode', '==', agentCode)], 'all-my-plans')
  const allMyCustomers = useCollection('customers',  [where('agentCode', '==', agentCode)], 'all-my-customers')

  // All policies keyed by agent (for team business)
  const allMyCommissions = useCollection('commission_ledger', [where('agentId', '==', myId)], 'all-my-comm')

  // Downline — all users where referredBy == myId
  const directTeam = useCollection('users', [where('referredBy', '==', myId)], 'direct-team')
  const totalTeam  = useCollection('users', [where('uplineIds', 'array-contains', myId)], 'total-team')

  // Payouts
  const myPayouts = useCollection('payouts', [where('agentId', '==', myId), orderBy('generatedDate', 'desc'), limit(5)], 'my-payouts')
  const pendingPayouts = useCollection('payouts', [where('agentId', '==', myId), where('status', '==', 'pending')], 'pending-payouts')

  const now = new Date()
  const monthStart  = startOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd   = new Date(monthStart.getTime() - 1)

  const loading = allMyPolicies.loading || allMyCommissions.loading

  // ── Computed Metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const commissions = allMyCommissions.data || []
    const policies    = allMyPolicies.data || []
    const customers   = allMyCustomers.data || []

    const lifetimeEarnings = commissions.reduce((s, c) => s + (c.amount || 0), 0)
    const monthEarnings    = commissions
      .filter(c => toDate(c.calculationDate) >= monthStart)
      .reduce((s, c) => s + (c.amount || 0), 0)
    const lastMonthEarnings = commissions
      .filter(c => { const d = toDate(c.calculationDate); return d >= lastMonthStart && d <= lastMonthEnd })
      .reduce((s, c) => s + (c.amount || 0), 0)
    const todayEarnings = commissions
      .filter(c => toDate(c.calculationDate) >= startOfMonth(now))
      .reduce((s, c) => s + (c.amount || 0), 0)

    const activePolicies  = policies.filter(p => p.status === 'active').length
    const totalPolicies   = policies.length
    const activeCustomers = customers.length

    // Personal business = sum of totalAmount from all my sold policies
    const personalBusiness  = policies.reduce((s, p) => s + (p.totalAmount || p.businessVolume || 0), 0)
    const monthBusiness     = policies
      .filter(p => toDate(p.createdAt) >= monthStart)
      .reduce((s, p) => s + (p.totalAmount || p.businessVolume || 0), 0)

    const pendingPayout = (pendingPayouts.data || []).reduce((s, p) => s + (p.totalPayable || 0), 0)
    const lastPaidPayout = (myPayouts.data || []).find(p => p.status === 'paid')
    const totalPaid = (myPayouts.data || []).filter(p => p.status === 'paid').reduce((s, p) => s + (p.totalPayable || 0), 0)

    // Monthly chart data — last 6 months
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      const mo = startOfMonth(d)
      const moEnd = startOfMonth(subMonths(d, -1))
      const biz = policies
        .filter(p => { const cd = toDate(p.createdAt); return cd >= mo && cd < moEnd })
        .reduce((s, p) => s + (p.totalAmount || p.businessVolume || 0), 0)
      const earn = commissions
        .filter(c => { const cd = toDate(c.calculationDate); return cd >= mo && cd < moEnd })
        .reduce((s, c) => s + (c.amount || 0), 0)
      return { month: format(d, 'MMM'), Business: biz, Earnings: earn }
    })

    return {
      lifetimeEarnings, monthEarnings, lastMonthEarnings, todayEarnings,
      activePolicies, totalPolicies, activeCustomers,
      personalBusiness, monthBusiness,
      pendingPayout, totalPaid,
      lastPaidPayout,
      monthlyChart: months,
    }
  }, [allMyCommissions.data, allMyPolicies.data, allMyCustomers.data, pendingPayouts.data, myPayouts.data])

  // ── Promotion Progress ────────────────────────────────────────────────────
  const promoProgress = useMemo(() => {
    if (!nextRankObj || !promotionsConfig?.rules) return null
    const rule = promotionsConfig.rules[nextRankObj.code]
    if (!rule) return null

    // Find rank-level config for MFA, PB, TA
    const ranks = config?.RANKS || []
    const myRankIdx = myRank - 1
    const nextRankIdx = (nextRankObj.rank || 2) - 1

    const bizTarget   = rule.businessTarget || 0
    const mfaTarget   = rule.mfaTarget || 0
    const pbTarget    = rule.pbTarget || 0
    const taTarget    = rule.taTarget || 0
    const mfaAmt      = rule.mfa || 0
    const pbAmt       = rule.pb || 0
    const taAmt       = rule.ta || 0

    const bizCurrent  = metrics.personalBusiness
    const mfaCurrent  = metrics.monthBusiness
    const pbCurrent   = metrics.monthBusiness

    const bizPct = bizTarget > 0 ? Math.min(100, (bizCurrent / bizTarget) * 100) : 0
    const eligible = bizPct >= 100

    return {
      rule, bizTarget, bizCurrent, bizPct,
      mfaTarget, mfaAmt, mfaCurrent,
      pbTarget, pbAmt, pbCurrent,
      taTarget, taAmt,
      eligible,
    }
  }, [promotionsConfig, metrics, nextRankObj, myRank, config])

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonStats count={4} />
      <SkeletonTable rows={4} cols={4} />
    </div>
  )

  const canRecruit = can(CAP.RECRUIT)

  return (
    <div className="mx-auto max-w-6xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-navy-4/50">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">APEX Performance Portal</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">
            {profile?.name || 'Agent'}
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            <span className="font-mono text-gold-tan font-semibold">{agentCode}</span>
            {' · '}
            <span className="font-semibold text-ink-1">{rankObj?.name || 'Rank ' + myRank}</span>
          </p>
        </div>
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Link to="/customers/new" className="btn-gold py-2 text-xs uppercase font-bold tracking-wider px-3 flex items-center gap-1.5"><IPlus size={13} /> Add Customer</Link>
          <Link to="/payments/collect" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-3 flex items-center gap-1.5"><ICash size={13} /> Collect Payment</Link>
          <Link to="/my-downline" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-3 flex items-center gap-1.5"><INetwork size={13} /> My Downline</Link>
          <Link to="/my-earnings" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-3 flex items-center gap-1.5"><ITrophy size={13} /> My Earnings</Link>
          {canRecruit && (
            <Link to="/my-downline" className="btn-ghost border border-gold-1/30 text-gold-tan hover:border-gold-1 py-2 text-xs uppercase font-bold tracking-wider px-3 flex items-center gap-1.5"><IUsers size={13} /> Add Member</Link>
          )}
        </div>
      </div>

      {/* ── Profile + Business Summary ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">

        {/* Profile Card */}
        <div className="card p-5 space-y-3 lg:col-span-1">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-1.5"><IUsers size={13} /> My Profile</h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gold-1/20 flex items-center justify-center text-gold-tan font-bold text-lg border border-gold-1/30">
                {(profile?.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-ink-1 text-sm">{profile?.name}</p>
                <p className="font-mono text-gold-tan text-[10px]">{agentCode}</p>
              </div>
            </div>
            {[
              { label: 'Sponsor', value: sponsorData?.name || '—', sub: sponsorData?.sponsorCode },
              { label: 'Current Rank', value: rankObj?.name },
              { label: 'Next Rank', value: nextRankObj?.name || 'Top Rank ✓' },
              { label: 'Branch', value: profile?.branchName || profile?.branch || '—' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-start gap-2">
                <span className="text-ink-2 shrink-0">{r.label}</span>
                <div className="text-right">
                  <span className="font-semibold text-ink-1 block">{r.value}</span>
                  {r.sub && <span className="font-mono text-[9px] text-gold-tan">{r.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Business + Team + Earnings KPIs */}
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Personal Business"  value={formatINR(metrics.personalBusiness)}   icon={<IBuilding size={16} />} accentColor="#A3906B" badge="TOTAL" />
            <KpiCard label="Monthly Business"   value={formatINR(metrics.monthBusiness)}       icon={<ICalendar size={16} />} accentColor="#7A8E6E" badge="MTD" />
            <KpiCard label="Active Customers"   value={metrics.activeCustomers}                icon={<IUsers size={16} />}   accentColor="#60A5FA" badge="ACTIVE" />
            <KpiCard label="Active Policies"    value={metrics.activePolicies}                 icon={<IDoc size={16} />}     accentColor="#F59E0B" badge="LIVE" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Month Earnings"     value={formatINR(metrics.monthEarnings)}       icon={<ICash size={16} />}    accentColor="#10B981" badge="THIS MONTH" />
            <KpiCard label="Last Month Earnings" value={formatINR(metrics.lastMonthEarnings)}  icon={<ICash size={16} />}    accentColor="#8B5CF6" badge="LAST MONTH" />
            <KpiCard label="Pending Payout"     value={formatINR(metrics.pendingPayout)}        icon={<IClock size={16} />}   accentColor="#EF4444" badge="PENDING" />
            <KpiCard label="Lifetime Earnings"  value={formatINR(metrics.lifetimeEarnings)}    icon={<ITrophy size={16} />}  accentColor="#A3906B" badge="LIFETIME" />
          </div>
        </div>
      </div>

      {/* ── Team Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Direct Team Members', value: directTeam.data?.length || 0, color: '#60A5FA' },
          { label: 'Total Team Members',  value: totalTeam.data?.length  || 0, color: '#A3906B' },
          { label: 'Active Customers',    value: metrics.activeCustomers,       color: '#10B981' },
          { label: 'Active Policies',     value: metrics.activePolicies,        color: '#F59E0B' },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}
            className="card p-4 text-center" style={{ borderTopColor: c.color, borderTopWidth: 3 }}>
            <p className="text-2xl font-bold font-serif text-ink-1">{c.value}</p>
            <p className="text-[10px] font-semibold text-ink-2 uppercase tracking-wider mt-1">{c.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── My Next Promotion ────────────────────────────────────────── */}
      {nextRankObj && (
        <div className="card p-5 space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
            <div className="flex items-center gap-2">
              <ITrophy size={16} className="text-gold-tan" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">My Next Promotion</h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 bg-navy-4/50 rounded-full font-semibold text-ink-1">{rankObj?.name}</span>
              <span className="text-gold-tan">→</span>
              <span className="px-2.5 py-1 bg-gold-1/20 border border-gold-1/30 rounded-full font-bold text-gold-tan">{nextRankObj.name}</span>
            </div>
          </div>

          {promoProgress ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <ProgressBar label="Business Target" value={promoProgress.bizCurrent} max={promoProgress.bizTarget} color="#A3906B" current={promoProgress.bizCurrent} target={promoProgress.bizTarget} />
              {promoProgress.mfaTarget > 0 && (
                <ProgressBar label="MFA Target" value={promoProgress.mfaCurrent} max={promoProgress.mfaTarget} color="#60A5FA" current={promoProgress.mfaCurrent} target={promoProgress.mfaTarget} />
              )}
              {promoProgress.pbTarget > 0 && (
                <ProgressBar label="PB Target" value={promoProgress.pbCurrent} max={promoProgress.pbTarget} color="#10B981" current={promoProgress.pbCurrent} target={promoProgress.pbTarget} />
              )}
              {promoProgress.taTarget > 0 && (
                <ProgressBar label="TA Target" value={0} max={promoProgress.taTarget} color="#F59E0B" current={0} target={promoProgress.taTarget} suffix="" />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <ProgressBar label="Business Target" value={metrics.personalBusiness} max={100000} color="#A3906B" current={metrics.personalBusiness} target={100000} />
              <p className="text-[11px] text-ink-2 italic">Configure Promotion Master in Settings to see full targets.</p>
            </div>
          )}

          {promoProgress?.eligible && (
            <div className="flex items-center gap-2 bg-ok/10 border border-ok/30 rounded-card p-3">
              <span className="text-ok text-lg">✅</span>
              <p className="text-sm font-bold text-ok">Eligible For Promotion to {nextRankObj.name}!</p>
            </div>
          )}
        </div>
      )}

      {/* ── My Performance Charts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-3 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Monthly Business (6 Months)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.monthlyChart} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="bizGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#A3906B" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#A3906B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="month" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={v => `₹${formatCompactINR(v)}`} />
                <Tooltip contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }} itemStyle={{ color: '#A3906B' }} />
                <Area type="monotone" dataKey="Business" stroke="#A3906B" fill="url(#bizGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5 space-y-3 bg-navy-3 border border-navy-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Monthly Earnings (6 Months)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.monthlyChart} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                <XAxis dataKey="month" stroke="#7A8E9E" fontSize={10} />
                <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={v => `₹${formatCompactINR(v)}`} />
                <Tooltip contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }} itemStyle={{ color: '#10B981' }} />
                <Bar dataKey="Earnings" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Recent Activity Feeds ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Latest Customers */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-navy-4/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan flex items-center gap-1.5"><IUsers size={13} /> Latest Customers</h3>
            <Link to="/customers" className="text-[10px] font-bold text-gold hover:underline">All →</Link>
          </div>
          {(myCustomers.data || []).length > 0 ? (
            <div className="space-y-2.5">
              {myCustomers.data.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-ink-1">{c.name}</p>
                    <p className="text-[9px] text-ink-2 font-mono">{c.customerId || c.pan}</p>
                  </div>
                  <span className="text-[10px] text-ink-2">{c.createdAt ? fmtDate(c.createdAt) : '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic text-center py-3">No customers yet.</p>
          )}
        </div>

        {/* Latest Policies */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-navy-4/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan flex items-center gap-1.5"><IDoc size={13} /> Latest Policies</h3>
            <Link to="/reports/collections" className="text-[10px] font-bold text-gold hover:underline">All →</Link>
          </div>
          {(myPolicies.data || []).length > 0 ? (
            <div className="space-y-2.5">
              {myPolicies.data.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-ink-1 font-mono">{p.policyNumber || '—'}</p>
                    <p className="text-[9px] text-ink-2">{p.customerName}</p>
                  </div>
                  <span className="font-semibold text-gold-tan">{formatINR(p.totalAmount || p.businessVolume || 0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic text-center py-3">No policies yet.</p>
          )}
        </div>

        {/* Latest Commissions */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-navy-4/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan flex items-center gap-1.5"><ICash size={13} /> Latest Commissions</h3>
            <Link to="/my-earnings" className="text-[10px] font-bold text-gold hover:underline">All →</Link>
          </div>
          {(myCommissions.data || []).length > 0 ? (
            <div className="space-y-2.5">
              {myCommissions.data.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-ink-1">{c.policyNumber || '—'}</p>
                    <p className="text-[9px] text-ink-2 font-mono">{c.planCode} · {c.month}/{c.year}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-ok">{formatINR(c.amount)}</span>
                    <p className="text-[9px] text-ink-2">{c.percentage?.toFixed(2)}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic text-center py-3">No commissions yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { isSuperAdmin } = useAuth()
  if (isSuperAdmin) return <SuperAdminDashboard />
  return <AgentDashboard />
}
