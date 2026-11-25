import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, subMonths, format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../utils/format'
import RankBadge from '../components/ui/RankBadge'
import StatusBadge from '../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../components/ui/LoadingSkeleton'
import {
  IUsers, ICash, IAlert, ICalendar, IPlus, IDoc, IDashboard,
  IBuilding, INetwork, IClock, ITrophy, ISettings, IShield
} from '../components/ui/icons'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts'
import { useRanks } from '../contexts/RanksContext'
import { policiesAPI, paymentsAPI, commissionsAPI, profilesAPI, masterDataAPI, customersAPI, payoutsAPI, mfaAPI } from '../lib/supabase'
import { evaluatePromotionEligibility, getMfaStatusMessage, calculateMonthlyMfaForAgent } from '../lib/mfa'
import { getPayoutNet } from '../utils/payoutHelpers'

// ─── Super Admin Dashboard ───────────────────────────────────────────────────
function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [policies, setPolicies] = useState([])
  const [payments, setPayments] = useState([])
  const [commissions, setCommissions] = useState([])
  const [profiles, setProfiles] = useState([])
  const [branches, setBranches] = useState([])
  const { profile } = useAuth()

  useEffect(() => {
    let cancelled = false
    async function loadDashboard() {
      setLoading(true)
      try {
        const [polList, payList, commList, profList, branchList] = await Promise.all([
          policiesAPI.listPolicies().catch(() => []),
          paymentsAPI.listPayments().catch(() => []),
          commissionsAPI.listCommissionLedger().catch(() => []),
          profilesAPI.listProfiles().catch(() => []),
          masterDataAPI.listBranches().catch(() => []),
        ])
        if (!cancelled) {
          setPolicies(polList || [])
          setPayments(payList || [])
          setCommissions(commList || [])
          setProfiles(profList || [])
          setBranches(branchList || [])
        }
      } catch (err) {
        console.error('[Dashboard] Error loading data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDashboard()
    return () => { cancelled = true }
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const month0 = startOfMonth(now)

    // Total business volume = sum of (12 * monthlyAmount for RD, or fdAmount / totalPaid for FD/Pension)
    const totalBusiness = (policies || []).reduce((sum, p) => {
      const isRD = String(p.planType || p.type || '').toUpperCase() === 'RD' || String(p.planCode || '').toUpperCase().startsWith('RD')
      const amt = isRD ? ((Number(p.monthlyAmount) || 0) * 12) : (Number(p.fdAmount) || Number(p.totalPaid) || 0)
      return sum + amt
    }, 0)

    // Monthly business = sum of payments collected this month
    const monthlyBusiness = (payments || []).filter(p => toDate(p.paidDate) >= month0).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    // Total commissions
    const totalCommission = (commissions || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)

    const activeAgents = (profiles || []).filter(p => p.status === 'active' && p.role !== 'admin' && !p.isSuperAdmin).length
    const activePlans = (policies || []).filter(p => p.status === 'active').length

    // Monthly Business Growth data (past 6 months)
    const growthData = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      const start = startOfMonth(d)
      const nextM = startOfMonth(subMonths(d, -1))
      const monthBiz = (payments || [])
        .filter(p => { const pd = toDate(p.paidDate); return pd && pd >= start && pd < nextM })
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      return {
        month: format(d, 'MMM yyyy'),
        Business: monthBiz
      }
    })

    // Branch Office Performance
    let branchPerformance = []
    if (branches && branches.length > 0) {
      branchPerformance = branches.map(b => {
        const sales = (policies || []).filter(p => p.branchId === b.id).reduce((sum, p) => {
          const isRD = String(p.planType || '').toUpperCase() === 'RD' || String(p.planCode || '').toUpperCase().startsWith('RD')
          return sum + (isRD ? ((Number(p.monthlyAmount) || 0) * 12) : (Number(p.fdAmount) || Number(p.totalPaid) || 0))
        }, 0)
        return { name: b.name || b.code, Sales: sales }
      })
    } else {
      const rdTotal = (policies || []).filter(p => String(p.planType || p.planCode || '').toUpperCase().includes('RD')).reduce((sum, p) => sum + ((Number(p.monthlyAmount) || 0) * 12), 0)
      const fdTotal = (policies || []).filter(p => !String(p.planType || p.planCode || '').toUpperCase().includes('RD')).reduce((sum, p) => sum + (Number(p.fdAmount) || Number(p.totalPaid) || 0), 0)
      branchPerformance = [
        { name: 'Head Office', Sales: totalBusiness },
        { name: 'RD Plans', Sales: rdTotal },
        { name: 'FD / Pension', Sales: fdTotal },
      ]
    }

    return {
      totalBusiness,
      monthlyBusiness,
      totalCommission,
      activeAgents,
      activePlans,
      promotionsCount: 0,
      pendingImportErrors: 0,
      growthData,
      branchPerformance,
    }
  }, [policies, payments, commissions, profiles, branches])

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonStats count={3} />
      <SkeletonTable rows={5} cols={5} />
    </div>
  )

  const mtdFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  
  const cards = [
    { type: 'total-business',    label: 'Total Business Volume',  value: formatINR(stats.totalBusiness),   icon: <ITrophy size={19} />, borderLeftClass: 'border-l-[4.5px] border-l-[#A3906B]', iconBgClass: 'bg-[#F9F7F3] border-[#EDE9E0] text-[#A3906B]', badge: 'LIFETIME', link: '/admin/all-reports?tab=business' },
    { type: 'monthly-business',  label: 'MTD Monthly Business',   value: formatINR(stats.monthlyBusiness), icon: <ICash size={19} />,   borderLeftClass: 'border-l-[4.5px] border-l-[#8FA382]', iconBgClass: 'bg-[#F4F6F2] border-[#E8ECE5] text-[#7A8E6E]', badge: 'THIS MONTH', link: `/admin/all-reports?tab=business&from=${mtdFrom}` },
    { type: 'total-commissions', label: 'Total Paid Commissions', value: formatINR(stats.totalCommission), icon: <ICash size={19} />,   borderLeftClass: 'border-l-[4.5px] border-l-[#D29E6B]', iconBgClass: 'bg-[#FAF6F2] border-[#F2ECE5] text-[#BF8955]', badge: 'COMMISSIONS', link: '/admin/all-reports?tab=payouts&status=paid' },
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
          <Link to="/admin/mfa" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5"><IShield size={14} /> MFA Management</Link>
          <Link to="/admin/payouts" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 text-xs uppercase font-bold tracking-wider px-4 flex items-center gap-1.5"><ICash size={14} /> Payouts Engine</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={c.link} className={`card p-5 relative overflow-hidden flex flex-col justify-between h-36 cursor-pointer hover:bg-navy-2/30 hover:border-gold-1/30 hover:scale-[1.01] transition-all block ${c.borderLeftClass}`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${c.iconBgClass}`}>{c.icon}</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded border border-navy-4 bg-navy-1 text-ink-2 font-mono uppercase">{c.badge}</span>
                </div>
                <p className="mt-4 text-xs font-semibold text-ink-2 tracking-wide">{c.label}</p>
                <p className="text-2xl font-bold font-serif text-ink-1 mt-1 leading-none">{c.value}</p>
              </div>
            </Link>
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
          { type: 'active-agents',      label: 'Active Agents',       value: stats.activeAgents,        color: 'border-l-gold-1', link: '/admin/members?status=active' },
          { type: 'active-policies',    label: 'Active Policies',     value: stats.activePlans,         color: 'border-l-ok', link: '/admin/policies?status=active' },
          { type: 'approved-promotions',label: 'Approved Promotions', value: stats.promotionsCount,     color: 'border-l-gold', link: '/admin/promotions?status=approved' },
          { type: 'import-errors',      label: 'Pending Import Errors',value: stats.pendingImportErrors,color: 'border-l-danger', link: '/admin/import/history' },
        ].map((c) => (
          <Link to={c.link} key={c.type} className={`card p-4 border-l-2 ${c.color} cursor-pointer hover:bg-navy-2/30 transition-all block`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">{c.label}</span>
            <span className="text-xl font-bold font-serif text-ink-1 mt-1 block">{c.value}</span>
          </Link>
        ))}
      </div>
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

  const myId = profile?.id || profile?.uid || ''
  const myRank = Number(profile?.rank) || 1
  const rankObj = getRank(myRank)
  const nextRankObj = nextRank(myRank)
  const sponsorId = profile?.sponsorId || profile?.referredBy || ''
  const agentCode = profile?.sponsorCode || ''

  const [agentData, setAgentData] = useState({
    loading: true,
    policies: [],
    customers: [],
    commissions: [],
    profiles: [],
    payouts: [],
    promotionRules: null,
    mfaRecord: null,
  })

  useEffect(() => {
    if (!myId) return
    let active = true
    const curDate = new Date()
    Promise.all([
      policiesAPI.listPolicies({ agentId: myId }).catch(() => []),
      customersAPI.listCustomers({ enrolledBy: myId }).catch(() => []),
      commissionsAPI.listCommissionLedger({ agentId: myId }).catch(() => []),
      profilesAPI.listProfiles().catch(() => []),
      payoutsAPI.listPayouts({ agentId: myId }).catch(() => []),
      masterDataAPI.getPromotionRules().catch(() => null),
      mfaAPI.getAgentMfaDashboardData({
        agentProfile: profile,
        month: curDate.getMonth() + 1,
        year: curDate.getFullYear(),
        autoSync: true,
      }).catch(() => null),
    ]).then(([policies, customers, commissions, profiles, payouts, promotionRules, mfaRes]) => {
      if (!active) return
      setAgentData({
        loading: false,
        policies: policies || [],
        customers: customers || [],
        commissions: (commissions || []).filter(c => c.status !== 'reversed'),
        profiles: profiles || [],
        payouts: payouts || [],
        promotionRules,
        mfaRecord: mfaRes?.currentRecord || null,
      })
    })
    return () => { active = false }
  }, [myId, profile])

  const sponsorData = useMemo(() => (
    sponsorId ? agentData.profiles.find(p => p.id === sponsorId || p.sponsorCode === sponsorId) || null : null
  ), [agentData.profiles, sponsorId])

  const directTeamList = useMemo(() => (
    agentData.profiles.filter(u => (u.sponsorId || u.referredBy) === myId)
  ), [agentData.profiles, myId])

  const totalTeamList = useMemo(() => {
    const descendants = []
    const visited = new Set([myId])
    const queue = [myId]
    while (queue.length) {
      const curr = queue.shift()
      for (const u of agentData.profiles) {
        if (!visited.has(u.id) && (u.sponsorId || u.referredBy) === curr) {
          visited.add(u.id)
          descendants.push(u)
          queue.push(u.id)
        }
      }
    }
    return descendants
  }, [agentData.profiles, myId])

  const myPolicies = useMemo(() => ({
    data: [...agentData.policies].sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt)).slice(0, 5),
  }), [agentData.policies])
  const myCommissions = useMemo(() => ({
    data: [...agentData.commissions].sort((a, b) => toDate(b.calculationDate) - toDate(a.calculationDate)).slice(0, 5),
  }), [agentData.commissions])

  const allMyPolicies = useMemo(() => ({ data: agentData.policies }), [agentData.policies])
  const allMyCustomers = useMemo(() => ({ data: agentData.customers }), [agentData.customers])
  const allMyCommissions = useMemo(() => ({ data: agentData.commissions }), [agentData.commissions])
  const directTeam = useMemo(() => ({ data: directTeamList }), [directTeamList])
  const totalTeam = useMemo(() => ({ data: totalTeamList }), [totalTeamList])
  const myPayouts = useMemo(() => ({
    data: [...agentData.payouts].sort((a, b) => toDate(b.generatedDate || b.createdAt) - toDate(a.generatedDate || a.createdAt)).slice(0, 5),
  }), [agentData.payouts])
  const pendingPayouts = useMemo(() => ({
    data: agentData.payouts.filter(p => p.status === 'pending' || p.status === 'generated' || p.status === 'approved'),
  }), [agentData.payouts])

  const now = new Date()
  const monthStart  = startOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd   = new Date(monthStart.getTime() - 1)

  const loading = agentData.loading

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
    const personalBusiness  = policies.reduce((s, p) => {
      const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
      const vol = p.totalAmount || p.businessVolume || (isRD ? (p.monthlyAmount * 12) : p.fdAmount) || 0
      return s + vol
    }, 0)
    const monthBusiness     = policies
      .filter(p => toDate(p.startDate || p.date || p.createdAt) >= monthStart)
      .reduce((s, p) => {
        const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
        const vol = p.totalAmount || p.businessVolume || (isRD ? (p.monthlyAmount * 12) : p.fdAmount) || 0
        return s + vol
      }, 0)

    const pendingPayout = (pendingPayouts.data || []).reduce((s, p) => s + getPayoutNet(p), 0)
    const lastPaidPayout = (myPayouts.data || []).find(p => p.status === 'paid')
    const totalPaid = (myPayouts.data || []).filter(p => p.status === 'paid').reduce((s, p) => s + getPayoutNet(p), 0)

    // Monthly chart data — last 6 months
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      const mo = startOfMonth(d)
      const moEnd = startOfMonth(subMonths(d, -1))
      const biz = policies
        .filter(p => { const cd = toDate(p.startDate || p.date || p.createdAt); return cd >= mo && cd < moEnd })
        .reduce((s, p) => {
          const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
          const vol = p.totalAmount || p.businessVolume || (isRD ? (p.monthlyAmount * 12) : p.fdAmount) || 0
          return s + vol
        }, 0)
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

  // ── Monthly Field Allowance (MFA) Progress (Standalone System) ────────────
  const mfaProgress = useMemo(() => {
    if (!profile) return null
    if (agentData.mfaRecord) return agentData.mfaRecord
    const currNow = new Date()
    return calculateMonthlyMfaForAgent({
      agent: profile,
      policies: agentData.policies,
      month: currNow.getMonth() + 1,
      year: currNow.getFullYear(),
      ranksList: config?.RANKS,
    })
  }, [profile, agentData.mfaRecord, agentData.policies, config])

  // ── Promotion Progress ────────────────────────────────────────────────────
  const promoProgress = useMemo(() => {
    if (!nextRankObj || !profile) return null
    const evalRes = evaluatePromotionEligibility({
      agent: { ...profile, businessVolume: metrics.personalBusiness },
      policies: agentData.policies,
      allProfiles: agentData.profiles,
      promotionRules: agentData.promotionRules,
      ranksList: config?.RANKS,
    })
    if (!evalRes) return null
    const bizTarget = evalRes.businessTarget || 0
    const bizCurrent = Math.max(metrics.personalBusiness, evalRes.businessAchieved)
    const bizPct = bizTarget > 0 ? Math.min(100, (bizCurrent / bizTarget) * 100) : 100

    return {
      rule: evalRes.rule,
      bizTarget,
      bizCurrent,
      bizPct,
      reqRank: evalRes.reqRank,
      reqCount: evalRes.reqCount,
      primaryAchievedCount: evalRes.primaryAchievedCount,
      altRank: evalRes.altRank,
      altCount: evalRes.altCount,
      altAchievedCount: evalRes.altAchievedCount,
      promoteeMet: evalRes.promoteeMet,
      eligible: bizCurrent >= bizTarget && evalRes.promoteeMet,
    }
  }, [profile, metrics.personalBusiness, agentData.policies, agentData.profiles, agentData.promotionRules, nextRankObj, config])

  // Construct unified recent activity
  const recentActivity = useMemo(() => {
    const list = []
    
    // 1. Policies
    ;(myPolicies.data || []).forEach(p => {
      list.push({
        id: `policy-${p.id}`,
        type: 'policy',
        title: 'New Policy Generated',
        desc: `Policy #${p.policyNumber} for ${p.customerName || 'Customer'}`,
        date: p.startDate || p.date || p.createdAt,
        badge: '🟢 Active'
      })
    })

    // 2. Commissions
    ;(myCommissions.data || []).forEach(c => {
      list.push({
        id: `comm-${c.id}`,
        type: 'commission',
        title: 'Commission Credited',
        desc: `Earned ${c.percentage?.toFixed(2)}% (${formatINR(c.amount)}) for Policy #${c.policyNumber}`,
        date: c.calculationDate,
        badge: '🔵 Paid'
      })
    })

    // 3. Team members
    ;(directTeam.data || []).forEach(m => {
      list.push({
        id: `team-${m.id}`,
        type: 'member',
        title: 'New Team Member Joined',
        desc: `${m.name} (${m.sponsorCode}) joined your downline`,
        date: m.createdAt,
        badge: '🟣 Promoted'
      })
    })

    // Sort descending by date
    return list.sort((a, b) => toDate(b.date) - toDate(a.date)).slice(0, 6)
  }, [myPolicies.data, myCommissions.data, directTeam.data])

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonStats count={4} />
      <SkeletonTable rows={4} cols={4} />
    </div>
  )

  const getGreeting = () => {
    const hr = new Date().getHours()
    if (hr < 12) return 'Good Morning'
    if (hr < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  const currentDateStr = format(new Date(), 'EEEE, MMMM d, yyyy')
  const currentTimeStr = format(new Date(), 'hh:mm a')

  const getRelativeTime = (dateInput) => {
    if (!dateInput) return '—'
    const d = toDate(dateInput)
    const diffMs = new Date() - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just Now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays === 1) return 'Yesterday'
    return format(d, 'MMM d, yyyy')
  }

  const canRecruit = can(CAP.RECRUIT)

  return (
    <div className="mx-auto max-w-6xl space-y-6">

      {/* ── Welcome Section ────────────────────────────────────────── */}
      <div className="card p-6 bg-navy-3 border border-navy-4 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold-1/5 blur-2xl" />
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-serif text-2xl md:text-3xl font-extrabold text-ink-1 tracking-tight">
                {getGreeting()}, {profile?.name || 'Agent'} 👋
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
              </span>
            </div>
            <p className="text-xs text-ink-2">Welcome back to Apex Multisolutions Branch Operations Portal.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[11px] text-ink-2 border-t border-navy-4/50 pt-4 lg:border-0 lg:pt-0">
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-ink-3">Current Rank</span>
              <span className="font-semibold text-ink-1 uppercase font-mono">{rankObj?.name || 'AO'}</span>
            </div>
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-ink-3">Agent Code</span>
              <span className="font-semibold text-gold-tan font-mono">{agentCode}</span>
            </div>
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-ink-3">Branch</span>
              <span className="font-semibold text-ink-1">{profile?.branchName || profile?.branch || '—'}</span>
            </div>
            {sponsorData && (
              <div>
                <span className="block text-[9px] uppercase tracking-wider text-ink-3">Sponsor</span>
                <span className="font-semibold text-ink-1">{sponsorData.name} ({sponsorData.sponsorCode})</span>
              </div>
            )}
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-ink-3">Current Date</span>
              <span className="font-semibold text-ink-1">{currentDateStr}</span>
            </div>
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-ink-3">Last Login</span>
              <span className="font-semibold text-ink-1 font-mono">{profile?.lastLogin ? fmtDate(profile.lastLogin) : 'Just Now'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's Summary Row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Personal Business', value: formatINR(metrics.personalBusiness), color: 'border-t-gold-1', link: '/reports/collections' },
          { label: 'Team Business', value: formatINR(profile?.teamBusiness || profile?.stats?.teamBusiness || 0), color: 'border-t-emerald-500', link: '/my-downline' },
          { label: 'MTD Commissions', value: formatINR(metrics.monthEarnings), color: 'border-t-cyan-500', link: '/my-earnings' },
          { label: 'Lifetime Commissions', value: formatINR(metrics.lifetimeEarnings), color: 'border-t-violet-500', link: '/my-earnings' },
          { label: 'Active Customers', value: metrics.activeCustomers, color: 'border-t-amber-500', link: '/customers' },
          { label: 'Active Team Members', value: totalTeam.data?.length || 0, color: 'border-t-rose-500', link: '/my-downline?status=active' }
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={c.link} className={`card p-4 border-t-4 ${c.color} bg-navy-3 flex flex-col justify-between h-24 hover:bg-navy-2/50 transition-all block`}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-2 block leading-snug">{c.label}</span>
              <span className="text-lg font-bold font-serif text-ink-1 block mt-2">{c.value}</span>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Quick Actions Card ───────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-1.5">
          <ISettings size={13} /> Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          {canRecruit && profile?.rank > 1 && (
            <Link to="/my-downline" className="btn-gold py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <IPlus size={14} /> Add Member
            </Link>
          )}
          <Link to="/my-downline" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <INetwork size={14} /> My Downline
          </Link>
          <Link to="/my-earnings" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <ITrophy size={14} /> My Earnings
          </Link>
          <Link to="/my-mfa" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <IShield size={14} /> Monthly MFA
          </Link>
          <Link to="/my-downline" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <IUsers size={14} /> Genealogy Tree
          </Link>
          <Link to="/reports/collections" className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <IDoc size={14} /> My Reports
          </Link>
        </div>
      </div>

      {/* ── Monthly Field Allowance (MFA) ───────────────────────────── */}
      {mfaProgress && mfaProgress.applicable && (
        <div className="card p-5 space-y-4 border-l-4 border-gold-1">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-navy-4/50">
            <div className="flex items-center gap-2">
              <IShield size={16} className="text-gold" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold">
                  Monthly MFA &ndash; {format(new Date(), 'MMMM yyyy')}
                </h3>
                <p className="text-[11px] text-ink-2">
                  Rank: <strong className="text-ink-1">{mfaProgress.rankCodeSnapshot || rankObj?.code}</strong> &middot; Target: <strong className="text-ink-1">{formatINR(mfaProgress.mfaTarget)}</strong> &middot; Reward: <strong className="text-gold">{formatINR(mfaProgress.mfaReward)}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2.5 py-1 rounded-full font-bold border ${
                mfaProgress.status === 'achieved'
                  ? 'bg-ok/15 border-ok/30 text-ok'
                  : 'bg-gold-1/15 border-gold-1/30 text-gold-tan'
              }`}>
                {mfaProgress.status === 'achieved' ? 'Achieved' : 'In Progress'}
              </span>
              <Link to="/my-mfa" className="text-xs font-bold text-gold hover:underline">
                Breakdown &amp; History &rarr;
              </Link>
            </div>
          </div>

          <ProgressBar
            label={`MFA Credit (${Number(mfaProgress.achievementPct || 0).toFixed(0)}% Achieved)`}
            value={mfaProgress.totalMfaCredit}
            max={mfaProgress.mfaTarget}
            color={mfaProgress.isQualified ? '#10B981' : '#A3906B'}
            current={mfaProgress.totalMfaCredit}
            target={mfaProgress.mfaTarget}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
            <span>{getMfaStatusMessage({
              status: mfaProgress.status,
              remainingAmount: mfaProgress.remainingAmount,
              rewardAmount: mfaProgress.mfaReward,
              mfaTarget: mfaProgress.mfaTarget,
            })}</span>
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <ProgressBar label="Business Target" value={promoProgress.bizCurrent} max={promoProgress.bizTarget} color="#A3906B" current={promoProgress.bizCurrent} target={promoProgress.bizTarget} />
              {promoProgress.reqCount > 0 && (
                <ProgressBar
                  label={`Promotees (${promoProgress.reqRank}${promoProgress.altCount > 0 && promoProgress.altRank ? ` or ${promoProgress.altCount} ${promoProgress.altRank}` : ''})`}
                  value={promoProgress.primaryAchievedCount}
                  max={promoProgress.reqCount}
                  color="#60A5FA"
                  current={promoProgress.primaryAchievedCount}
                  target={promoProgress.reqCount}
                />
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

      {/* ── Recent Activity Feed ──────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-1.5 border-b border-navy-4/50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan flex items-center gap-1.5">
            <IClock size={13} /> Recent Activity Feed
          </h3>
        </div>
        {(recentActivity || []).length > 0 ? (
          <div className="divide-y divide-navy-4">
            {recentActivity.map((act) => (
              <div key={act.id} className="py-3 flex items-center justify-between text-xs hover:bg-navy-2/20 px-2 rounded transition-all">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-1">{act.title}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-navy-2 border border-navy-4 text-ink-2">
                      {act.badge}
                    </span>
                  </div>
                  <p className="text-ink-2">{act.desc}</p>
                </div>
                <span className="text-[10px] text-ink-3 font-mono">{getRelativeTime(act.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 space-y-2 border border-dashed border-navy-4 rounded bg-navy-2/10">
            <p className="text-xs text-ink-2 italic">No recent activity yet.</p>
            <p className="text-[10px] text-ink-3">Once new policies or commissions are generated they will appear here.</p>
          </div>
        )}
      </div>

      {/* ── Dashboard Footer ────────────────────────────────────────── */}
      <div className="border-t border-navy-4/50 pt-5 mt-8 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-ink-3">
        <span className="font-semibold">Apex Multisolutions Branch Operations Portal</span>
        <span>Version 1.0</span>
        <span>Last Updated: {currentDateStr} at {currentTimeStr}</span>
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
