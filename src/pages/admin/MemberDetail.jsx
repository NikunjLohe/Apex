import { useMemo, useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  supabase,
  profilesAPI,
  policiesAPI,
  paymentsAPI,
  commissionsAPI,
  customersAPI,
  masterDataAPI,
  authAPI,
  normalizeProfile
} from '../../lib/supabase'
import { useRanks } from '../../contexts/RanksContext'
import { fmtDate, formatINR, formatCompactINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import {
  IUsers, ICash, ITrophy, IShield, INetwork, IClock, IDoc, IAlert, IMail, IDownload, ISearch, ICheck
} from '../../components/ui/icons'
import ChangeEmailModal from '../../components/ChangeEmailModal'
import GenealogyTree from '../../components/ui/GenealogyTree'
import { computeEarnings } from '../../lib/earnings'
import {
  buildHierarchyMap,
  calculatePolicyBusiness,
  calculateAgentBusinessMetrics,
  generateDownlineTable,
  generateRankSummary,
  exportAgentExcelReport
} from '../../lib/downlineAnalytics'
import toast from 'react-hot-toast'

export default function MemberDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { config, nextRank, getRank } = useRanks()
  const { startViewingAs, realProfile } = useAuth()

  // State
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'business' | 'hierarchy' | 'downline' | 'reports'
  const [m, setM] = useState(null)
  const [sponsor, setSponsor] = useState(null)
  const [branches, setBranches] = useState([])
  
  // Raw collections
  const [allProfiles, setAllProfiles] = useState([])
  const [allPolicies, setAllPolicies] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [allCommissions, setAllCommissions] = useState([])

  // Actions state
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [viewAsModalOpen, setViewAsModalOpen] = useState(false)
  const [changeEmailModalOpen, setChangeEmailModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Filters for Tab 2: Business History
  const [bizScope, setBizScope] = useState('all') // 'all' (network) | 'personal'
  const [bizPlanType, setBizPlanType] = useState('all') // 'all' | 'RD' | 'FD'
  const [bizPlanCode, setBizPlanCode] = useState('all')
  const [bizStatus, setBizStatus] = useState('all')
  const [bizAgentFilter, setBizAgentFilter] = useState('all')
  const [bizFromDate, setBizFromDate] = useState('')
  const [bizToDate, setBizToDate] = useState('')
  const [bizSearch, setBizSearch] = useState('')
  const [bizPage, setBizPage] = useState(1)
  const BIZ_PER_PAGE = 10

  // Filters for Tab 4: Downline Business Performance
  const [downlineSearch, setDownlineSearch] = useState('')
  const [downlineSortBy, setDownlineSortBy] = useState('networkBiz_desc')
  const [downlineRankFilter, setDownlineRankFilter] = useState('all')
  const [downlinePage, setDownlinePage] = useState(1)
  const DOWNLINE_PER_PAGE = 10

  // Load agent profile & all related datasets
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!id) return
      setLoading(true)

      try {
        let profile = null

        // 1. Try finding by UUID
        if (id.includes('-') && id.length === 36) {
          profile = await profilesAPI.getProfile(id).catch(() => null)
        }

        // 2. If not found or not a UUID, find by sponsor_code
        if (!profile) {
          const { data: byCode } = await supabase
            .from('profiles')
            .select('*')
            .ilike('sponsor_code', id)
            .maybeSingle()

          if (byCode) {
            profile = normalizeProfile(byCode)
          }
        }

        if (cancelled) return

        if (!profile) {
          setM(null)
          setLoading(false)
          return
        }

        setM(profile)

        // 3. Fetch all related collections in parallel
        const [branchList, profilesList, policiesList, custList, paymentsList, commList] = await Promise.all([
          masterDataAPI.listBranches().catch(() => []),
          profilesAPI.listProfiles().catch(() => []),
          policiesAPI.listPolicies().catch(() => []),
          customersAPI.listCustomers().catch(() => []),
          paymentsAPI.listPayments().catch(() => []),
          commissionsAPI.listCommissions().catch(() => [])
        ])

        if (cancelled) return

        setBranches(branchList || [])
        setAllProfiles(profilesList || [])
        setAllPolicies(policiesList || [])
        setAllCustomers(custList || [])
        setAllPayments(paymentsList || [])
        setAllCommissions(commList || [])

        // Resolve sponsor
        const sponsorId = profile.sponsorId || profile.sponsor_id || profile.referredBy
        if (sponsorId && sponsorId !== 'none') {
          const sp = (profilesList || []).find(p => p.id === sponsorId || p.sponsorCode === sponsorId)
          setSponsor(sp || null)
        } else {
          setSponsor(null)
        }

      } catch (err) {
        console.error('[MemberDetail] Load error:', err)
        toast.error('Failed to load agent profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [id])

  // Hierarchy Map
  const hierarchyMap = useMemo(() => {
    if (!allProfiles.length) return null
    return buildHierarchyMap(allProfiles)
  }, [allProfiles])

  // Agent Business Metrics Model
  const metrics = useMemo(() => {
    if (!m || !hierarchyMap) return null
    return calculateAgentBusinessMetrics({
      agentId: m.id,
      allProfiles,
      policies: allPolicies,
      payments: allPayments,
      commissions: allCommissions,
      customers: allCustomers,
      hierarchyMap
    })
  }, [m, hierarchyMap, allProfiles, allPolicies, allPayments, allCommissions, allCustomers])

  // Downline Table Model
  const downlineTable = useMemo(() => {
    if (!m || !hierarchyMap) return []
    return generateDownlineTable({
      rootAgentId: m.id,
      allProfiles,
      policies: allPolicies,
      customers: allCustomers,
      hierarchyMap
    })
  }, [m, hierarchyMap, allProfiles, allPolicies, allCustomers])

  // Rank-wise Summary
  const rankSummary = useMemo(() => {
    if (!downlineTable.length) return []
    return generateRankSummary(downlineTable)
  }, [downlineTable])

  // Unique plan codes for filter dropdown
  const availablePlanCodes = useMemo(() => {
    const set = new Set()
    allPolicies.forEach(p => {
      const c = p.planCode || p.plan_code
      if (c) set.add(c)
    })
    return Array.from(set).sort()
  }, [allPolicies])

  // Filtered Business History Rows
  const filteredBusinessHistory = useMemo(() => {
    if (!metrics) return []
    const baseList = bizScope === 'personal' ? metrics.personalPolicies : metrics.networkPolicies

    return baseList.filter(p => {
      const b = calculatePolicyBusiness(p)
      
      // Plan type filter
      if (bizPlanType === 'RD' && !b.isRD) return false
      if (bizPlanType === 'FD' && !b.isFD) return false

      // Plan code filter
      const pCode = p.planCode || p.plan_code
      if (bizPlanCode !== 'all' && pCode !== bizPlanCode) return false

      // Status filter
      if (bizStatus !== 'all' && (p.status || 'active').toLowerCase() !== bizStatus.toLowerCase()) return false

      // Agent filter
      const pAid = p.agentId || p.agent_id
      if (bizAgentFilter !== 'all' && pAid !== bizAgentFilter) return false

      // Date Range filter
      const pDate = p.startDate ? new Date(p.startDate) : null
      if (bizFromDate && pDate && pDate < new Date(bizFromDate)) return false
      if (bizToDate && pDate && pDate > new Date(bizToDate + 'T23:59:59')) return false

      // Search query
      if (bizSearch.trim()) {
        const q = bizSearch.toLowerCase().trim()
        const polNo = (p.policyNumber || p.policy_number || '').toLowerCase()
        const custName = (p.customerName || p.customers?.name || '').toLowerCase()
        const custAcc = (p.customerAccount || p.customerId || p.customer_id || '').toLowerCase()
        const agName = (p.agentName || p.profiles?.name || '').toLowerCase()
        if (!polNo.includes(q) && !custName.includes(q) && !custAcc.includes(q) && !agName.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [metrics, bizScope, bizPlanType, bizPlanCode, bizStatus, bizAgentFilter, bizFromDate, bizToDate, bizSearch])

  // Paginated Business History
  const paginatedBusinessHistory = useMemo(() => {
    const start = (bizPage - 1) * BIZ_PER_PAGE
    return filteredBusinessHistory.slice(start, start + BIZ_PER_PAGE)
  }, [filteredBusinessHistory, bizPage])

  const totalBizPages = Math.ceil(filteredBusinessHistory.length / BIZ_PER_PAGE) || 1

  // Filtered & Sorted Downline Table Rows
  const filteredDownlineTable = useMemo(() => {
    let list = [...downlineTable]

    // Search filter
    if (downlineSearch.trim()) {
      const q = downlineSearch.toLowerCase().trim()
      list = list.filter(r => 
        r.agentName.toLowerCase().includes(q) ||
        r.sponsorCode.toLowerCase().includes(q) ||
        r.agentId.toLowerCase().includes(q)
      )
    }

    // Rank filter
    if (downlineRankFilter !== 'all') {
      list = list.filter(r => String(r.rank) === String(downlineRankFilter))
    }

    // Sorting
    list.sort((a, b) => {
      switch (downlineSortBy) {
        case 'networkBiz_desc':
          return b.totalNetworkBusiness - a.totalNetworkBusiness
        case 'networkBiz_asc':
          return a.totalNetworkBusiness - b.totalNetworkBusiness
        case 'personalBiz_desc':
          return b.personalBusiness - a.personalBusiness
        case 'downlineBiz_desc':
          return b.directDownlineBusiness - a.directDownlineBusiness
        case 'directCount_desc':
          return b.directDownlineCount - a.directDownlineCount
        case 'rank_desc':
          return b.rank - a.rank
        case 'rank_asc':
          return a.rank - b.rank
        default:
          return b.totalNetworkBusiness - a.totalNetworkBusiness
      }
    })

    return list
  }, [downlineTable, downlineSearch, downlineRankFilter, downlineSortBy])

  const paginatedDownlineTable = useMemo(() => {
    const start = (downlinePage - 1) * DOWNLINE_PER_PAGE
    return filteredDownlineTable.slice(start, start + DOWNLINE_PER_PAGE)
  }, [filteredDownlineTable, downlinePage])

  const totalDownlinePages = Math.ceil(filteredDownlineTable.length / DOWNLINE_PER_PAGE) || 1

  // Branch Name helper
  const branchName = (branchId) => {
    if (!branchId || !branches.length) return '—'
    const b = branches.find(br => br.id === branchId || br.code === branchId)
    return b ? `${b.name} (${b.code})` : branchId
  }

  // Toggle agent active status
  const toggleStatus = async () => {
    if (!m) return
    setUpdatingStatus(true)
    const newStatus = m.status === 'inactive' ? 'active' : 'inactive'
    try {
      await profilesAPI.updateProfile(m.id, { status: newStatus })
      setM(prev => ({ ...prev, status: newStatus }))
      toast.success(`Agent marked as ${newStatus}`)
    } catch (err) {
      console.error('Error updating status:', err)
      toast.error('Failed to update agent status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Excel Export Handler
  const handleExportExcel = () => {
    if (!m || !metrics) {
      toast.error('No agent data available for export.')
      return
    }

    setExporting(true)
    const toastId = toast.loading('Generating comprehensive Excel report...')

    try {
      const fileName = exportAgentExcelReport({
        rootAgent: {
          ...m,
          branchName: branchName(m.branchId),
          sponsorName: sponsor?.name || null
        },
        metrics,
        downlineTable,
        policiesList: filteredBusinessHistory,
        rankSummary,
        isAgentScope: false
      })

      toast.success(`Report exported: ${fileName}`, { id: toastId })
    } catch (err) {
      console.error('Export error:', err)
      toast.error(`Export failed: ${err.message}`, { id: toastId })
    } finally {
      setExporting(false)
    }
  }

  // Rank Info
  const rank = m?.rank ? getRank(m.rank) : { code: 'AO', name: 'Administrative Officer' }
  const next = m?.rank ? nextRank(m.rank) : null

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={6} cols={6} />
      </div>
    )
  }

  if (!m) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Agent Not Found</h2>
        <p className="text-sm text-ink-2">This agent record does not exist in the system.</p>
        <Link to="/admin/members" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Members</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      
      {/* ── Top Header Card ──────────────────────────────────────────────── */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/5 blur-3xl" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-serif text-lg font-bold text-gold">
              {m.name?.slice(0, 2).toUpperCase() || 'AG'}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{m.name}</h1>
                <RankBadge rank={m.rank} />
                <StatusBadge status={m.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">
                Agent ID: <span className="font-bold text-ink-1">{m.id}</span> · Code: <span className="font-bold text-gold">{m.sponsorCode || '—'}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            {realProfile?.isSuperAdmin && (
              <button
                onClick={() => setViewAsModalOpen(true)}
                className="btn-dark py-2 px-3 text-xs font-bold uppercase tracking-wider border border-gold/40 text-gold hover:border-gold flex items-center gap-1.5"
              >
                View As Agent
              </button>
            )}
            <button
              onClick={() => setChangeEmailModalOpen(true)}
              className="btn-dark py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              Change Email
            </button>
            <button
              onClick={() => setResetModalOpen(true)}
              className="btn-dark py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              Reset Password
            </button>
            <button
              onClick={toggleStatus}
              disabled={updatingStatus}
              className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
                m.status === 'inactive'
                  ? 'bg-ok text-white hover:bg-ok-hover'
                  : 'bg-danger text-white hover:bg-danger-hover'
              }`}
            >
              {updatingStatus ? 'Updating...' : m.status === 'inactive' ? 'Activate Agent' : 'Deactivate Agent'}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="btn-gold py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <IDownload size={14} />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
            <Link to="/admin/members" className="btn-ghost py-2 px-3 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-navy-4/50 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        {[
          { key: 'overview', label: 'Overview', icon: IDoc },
          { key: 'business', label: `Business History (${filteredBusinessHistory.length})`, icon: ICash },
          { key: 'hierarchy', label: 'Downline Hierarchy', icon: INetwork },
          { key: 'downline', label: `Downline Business (${downlineTable.length})`, icon: IUsers },
          { key: 'reports', label: 'Reports & Exports', icon: IDownload },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                isActive
                  ? 'bg-gold text-navy-1 shadow-sm'
                  : 'bg-navy-3 text-ink-2 hover:text-ink-1 hover:bg-navy-2 border border-navy-4/60'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Section B: Agent Business Summary Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                Executive Business Summary
              </h3>
              <span className="text-[10px] text-ink-2">
                Guaranteed Single-Counted Network Rollup
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
              {/* Personal Business */}
              <div className="card p-4 bg-navy-3 border-l-2 border-gold flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Personal Business</span>
                <span className="font-serif text-lg font-bold text-gold mt-2">
                  {formatINR(metrics?.personalBusiness || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Directly Closed by {m.name?.split(' ')[0]}
                </span>
              </div>

              {/* Direct Downline Business */}
              <div className="card p-4 bg-navy-3 border-l-2 border-gold-tan flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Direct Team Business</span>
                <span className="font-serif text-lg font-bold text-ink-1 mt-2">
                  {formatINR(metrics?.directDownlineBusiness || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Closed by {metrics?.directDownlineCount || 0} Direct Agents
                </span>
              </div>

              {/* Total Network Business */}
              <div className="card p-4 bg-navy-3 border-l-2 border-ok flex flex-col justify-between ring-1 ring-ok/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ok">Total Network Business</span>
                <span className="font-serif text-xl font-extrabold text-ok mt-2">
                  {formatINR(metrics?.totalNetworkBusiness || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Personal + {metrics?.networkDownlineCount || 0} Downline Agents
                </span>
              </div>

              {/* RD Business */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Total RD Volume</span>
                <span className="font-serif text-base font-bold text-ink-1 mt-2">
                  {formatINR(metrics?.networkRDBusiness || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Personal RD: {formatINR(metrics?.personalRDBusiness || 0)}
                </span>
              </div>

              {/* FD Business */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Total FD Volume</span>
                <span className="font-serif text-base font-bold text-ink-1 mt-2">
                  {formatINR(metrics?.networkFDBusiness || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Personal FD: {formatINR(metrics?.personalFDBusiness || 0)}
                </span>
              </div>

              {/* Policies */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Network Policies</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="font-serif text-lg font-bold text-ink-1">{metrics?.totalPolicies || 0}</span>
                  <span className="text-[10px] text-ok font-semibold">({metrics?.activePolicies || 0} Active)</span>
                </div>
                <span className="text-[10px] text-ink-2 mt-1">
                  Personal: {metrics?.personalPoliciesCount || 0}
                </span>
              </div>

              {/* Customers */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Total Network CIFs</span>
                <span className="font-serif text-lg font-bold text-ink-1 mt-2">
                  {metrics?.totalCustomers || 0}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Personal Enrolled: {metrics?.personalCustomersCount || 0}
                </span>
              </div>

              {/* Collections */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Total Collections</span>
                <span className="font-serif text-lg font-bold text-ink-1 mt-2">
                  {formatINR(metrics?.totalCollections || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Collected Payments
                </span>
              </div>

              {/* Total Commission Generated */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Commissions Accrued</span>
                <span className="font-serif text-lg font-bold text-gold mt-2">
                  {formatINR(metrics?.totalCommissionGenerated || 0)}
                </span>
                <span className="text-[10px] text-ink-2 mt-1">
                  Earned by Agent
                </span>
              </div>

              {/* Team Size */}
              <div className="card p-4 bg-navy-3 border-navy-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Downline Team Size</span>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className="font-serif text-lg font-bold text-ink-1">{metrics?.networkDownlineCount || 0}</span>
                  <span className="text-[10px] text-ink-2">Total</span>
                </div>
                <span className="text-[10px] text-gold font-semibold mt-1">
                  {metrics?.directDownlineCount || 0} Direct Frontline
                </span>
              </div>
            </div>
          </div>

          {/* Section A: Agent Basic Information & Bank Cards */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Basic Info */}
            <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <IUsers size={16} /> Agent Basic Information
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="block text-[10px] text-ink-2">Full Legal Name</span>
                  <span className="font-semibold text-ink-1 text-sm">{m.name || '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-ink-2">Agent ID</span>
                    <span className="font-semibold text-ink-1 font-mono text-[11px] truncate block" title={m.id}>{m.id}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Sponsor Code</span>
                    <span className="font-semibold text-gold font-mono">{m.sponsorCode || '—'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-ink-2">Mobile Number</span>
                    <span className="font-semibold text-ink-1 font-mono">{m.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Current Status</span>
                    <span className="font-semibold text-ink-1 capitalize">{m.status || 'active'}</span>
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Email Address</span>
                  <span className="font-semibold text-ink-1">{m.email || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Direct Sponsor</span>
                  {sponsor ? (
                    <Link to={`/admin/members/${sponsor.id}`} className="font-semibold text-gold hover:underline">
                      {sponsor.name} ({sponsor.sponsorCode || '—'})
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink-2">None (Root Leader)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-ink-2">Operating Branch</span>
                    <span className="font-semibold text-ink-1">{branchName(m.branchId)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Joining Date</span>
                    <span className="font-semibold text-ink-1">{m.createdAt ? fmtDate(m.createdAt) : '—'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-navy-4/50">
                  <div>
                    <span className="block text-[10px] text-ink-2">Direct Downline</span>
                    <span className="font-bold text-ink-1 text-sm">{metrics?.directDownlineCount || 0} Agents</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Total Network</span>
                    <span className="font-bold text-gold text-sm">{metrics?.networkDownlineCount || 0} Agents</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank & Identity Profile */}
            <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <IDoc size={16} /> Bank & Identity Profile
              </h3>
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-ink-2">PAN Card</span>
                    <span className="font-semibold text-ink-1 font-mono uppercase">{m.panNumber || m.pan || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Aadhaar</span>
                    <span className="font-semibold text-ink-1 font-mono">{m.aadhaar || '—'}</span>
                  </div>
                </div>
                <div className="border-t border-navy-4/50 my-2" />
                {m.bankDetails && (m.bankDetails.bankName || m.bankDetails.accountNumber) ? (
                  <div className="space-y-2.5">
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Holder Name</span>
                      <span className="font-semibold text-ink-1">{m.bankDetails.accountHolderName || m.name || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">Bank & Branch</span>
                      <span className="font-semibold text-ink-1">{m.bankDetails.bankName} {m.bankDetails.branch ? `(${m.bankDetails.branch})` : ''}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Number</span>
                      <span className="font-semibold text-ink-1 font-mono">{m.bankDetails.accountNumber}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">IFSC Code</span>
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m.bankDetails.ifscCode}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center border border-dashed border-navy-4 rounded bg-navy-2/50 text-ink-2 text-xs italic">
                    Bank details not registered yet.
                  </div>
                )}
              </div>
            </div>

            {/* Rank Target Progress */}
            <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center justify-between">
                <span className="flex items-center gap-2"><ITrophy size={16} /> Promotion Target</span>
                <span className="text-[10px] font-bold text-gold">{rank.code} (Rank {m.rank})</span>
              </h3>
              {next ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between items-center mb-1 text-ink-2">
                      <span>Target: <strong>{next.code} ({next.name})</strong></span>
                      <span className="font-mono">{formatINR(metrics?.totalNetworkBusiness || 0)} / {formatINR(next.promoTarget || 0)}</span>
                    </div>
                    <div className="h-2 w-full bg-navy-4 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold transition-all duration-500"
                        style={{
                          width: `${Math.min(100, next.promoTarget ? ((metrics?.totalNetworkBusiness || 0) / next.promoTarget) * 100 : 100)}%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-navy-2/60 rounded border border-navy-4 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-ink-2">Current Rank Rate:</span>
                      <span className="font-bold text-ink-1">{rank.rd1yRate || 4.0}% MDA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-2">Next Rank Rate:</span>
                      <span className="font-bold text-gold">{next.rd1yRate || 5.0}% MDA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-2">Promotional Gap:</span>
                      <span className="font-mono font-bold text-ok">
                        {formatINR(Math.max(0, (next.promoTarget || 0) - (metrics?.totalNetworkBusiness || 0)))} remaining
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-ink-2 text-xs italic">
                  Agent is at the pinnacle rank: {rank.code} ({rank.name}).
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: BUSINESS HISTORY
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'business' && (
        <div className="card p-6 bg-navy-3 border border-navy-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4/50 pb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
                Business Transaction Ledger
              </h3>
              <p className="text-xs text-ink-2">
                All policies closed by {m.name} and their downline network.
              </p>
            </div>

            {/* Scope selector */}
            <div className="flex items-center gap-1 bg-navy-2 p-1 rounded border border-navy-4 text-xs font-semibold">
              <button
                onClick={() => { setBizScope('all'); setBizPage(1) }}
                className={`px-3 py-1.5 rounded transition-all ${bizScope === 'all' ? 'bg-gold text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
              >
                Entire Network Downline ({metrics?.networkPolicies.length || 0})
              </button>
              <button
                onClick={() => { setBizScope('personal'); setBizPage(1) }}
                className={`px-3 py-1.5 rounded transition-all ${bizScope === 'personal' ? 'bg-gold text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
              >
                Personal Only ({metrics?.personalPolicies.length || 0})
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 text-xs">
            {/* Search */}
            <div>
              <label className="label">Search Policy / CIF</label>
              <input
                type="text"
                placeholder="Policy #, Client..."
                className="field text-xs font-semibold py-1.5"
                value={bizSearch}
                onChange={e => { setBizSearch(e.target.value); setBizPage(1) }}
              />
            </div>

            {/* Plan Type */}
            <div>
              <label className="label">Plan Type</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={bizPlanType}
                onChange={e => { setBizPlanType(e.target.value); setBizPage(1) }}
              >
                <option value="all">All Types</option>
                <option value="RD">RD (Recurring)</option>
                <option value="FD">FD / Pension</option>
              </select>
            </div>

            {/* Plan Code */}
            <div>
              <label className="label">Plan Code</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={bizPlanCode}
                onChange={e => { setBizPlanCode(e.target.value); setBizPage(1) }}
              >
                <option value="all">All Plan Codes</option>
                {availablePlanCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="label">Policy Status</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={bizStatus}
                onChange={e => { setBizStatus(e.target.value); setBizPage(1) }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="matured">Matured</option>
                <option value="lapsed">Lapsed</option>
              </select>
            </div>

            {/* Agent Filter (if viewing entire network) */}
            <div>
              <label className="label">Selling Agent</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={bizAgentFilter}
                onChange={e => { setBizAgentFilter(e.target.value); setBizPage(1) }}
                disabled={bizScope === 'personal'}
              >
                <option value="all">All Team Agents</option>
                <option value={m.id}>{m.name} (Personal)</option>
                {(downlineTable || []).filter(a => a.agentId !== m.id).map(a => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.agentName} ({a.sponsorCode})
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="label">From Date</label>
              <input
                type="date"
                className="field text-xs font-semibold py-1.5"
                value={bizFromDate}
                onChange={e => { setBizFromDate(e.target.value); setBizPage(1) }}
              />
            </div>
          </div>

          {/* Table */}
          {paginatedBusinessHistory.length === 0 ? (
            <div className="py-12 text-center text-ink-2 italic text-xs">
              No business policies match the selected filters.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Policy / Account #</th>
                    <th>Customer Name</th>
                    <th>CIF ID</th>
                    <th>Plan</th>
                    <th>Amount (₹)</th>
                    <th>Selling Agent</th>
                    <th>Business Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBusinessHistory.map(p => {
                    const b = calculatePolicyBusiness(p)
                    return (
                      <tr key={p.id}>
                        <td className="font-mono font-bold text-gold">
                          <Link to={`/admin/policies/${p.id}`} className="hover:underline">
                            {p.policyNumber || p.policy_number || '—'}
                          </Link>
                        </td>
                        <td className="font-semibold text-ink-1">
                          {p.customerName || p.customers?.name || '—'}
                        </td>
                        <td className="font-mono text-ink-2 text-[11px]">
                          {p.customerAccount || p.customerId || p.customer_id || '—'}
                        </td>
                        <td>
                          <span className="font-semibold uppercase text-ink-1">{p.planCode || p.plan_code || '—'}</span>
                          <span className="block text-[10px] text-ink-2">{b.isRD ? 'Recurring' : 'Fixed Deposit'}</span>
                        </td>
                        <td className="font-bold text-ink-1 font-mono">
                          {formatINR(b.businessAmount)}
                        </td>
                        <td>
                          <span className="font-semibold text-ink-1 block">
                            {p.agentName || p.profiles?.name || (p.agentId === m.id ? m.name : '—')}
                          </span>
                          <span className="font-mono text-[10px] text-ink-2">
                            {p.agentId === m.id ? (m.sponsorCode || 'Self') : 'Downline Agent'}
                          </span>
                        </td>
                        <td className="text-ink-2 font-mono">
                          {p.startDate ? fmtDate(p.startDate) : '—'}
                        </td>
                        <td>
                          <StatusBadge status={p.status || 'active'} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          {totalBizPages > 1 && (
            <div className="flex justify-between items-center pt-2 text-xs border-t border-navy-4/50">
              <span className="text-ink-2 text-[11px]">
                Showing {((bizPage - 1) * BIZ_PER_PAGE) + 1} to {Math.min(bizPage * BIZ_PER_PAGE, filteredBusinessHistory.length)} of {filteredBusinessHistory.length} policies
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setBizPage(p => Math.max(1, p - 1))}
                  disabled={bizPage === 1}
                  className="btn-dark py-1 px-3 text-xs font-bold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-3 py-1 font-bold text-ink-1 flex items-center">
                  Page {bizPage} of {totalBizPages}
                </span>
                <button
                  onClick={() => setBizPage(p => Math.min(totalBizPages, p + 1))}
                  disabled={bizPage === totalBizPages}
                  className="btn-dark py-1 px-3 text-xs font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: DOWNLINE HIERARCHY
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-4">
          <div className="card p-4 bg-navy-3 border border-navy-4 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
                Genealogy Tree Structure
              </h3>
              <p className="text-xs text-ink-2">
                Click any agent in the tree to navigate to their profile, or use [+] / [-] to expand branches.
              </p>
            </div>
            <span className="px-3 py-1 bg-gold/10 text-gold text-xs font-bold rounded border border-gold/30">
              Root: {m.name} ({m.sponsorCode || '—'})
            </span>
          </div>

          <GenealogyTree
            rootId={m.id}
            onSelectAgent={(selected) => {
              if (selected && selected.id !== m.id) {
                navigate(`/admin/members/${selected.id}`)
              }
            }}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: DOWNLINE BUSINESS PERFORMANCE
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'downline' && (
        <div className="card p-6 bg-navy-3 border border-navy-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4/50 pb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
                Downline Network Performance Breakdown ({downlineTable.length} Agents)
              </h3>
              <p className="text-xs text-ink-2">
                Comprehensive performance metrics for every direct and indirect downline team member.
              </p>
            </div>

            {/* Quick stats pill */}
            <div className="flex gap-2 text-xs">
              <span className="px-3 py-1 bg-navy-2 border border-navy-4 rounded text-ink-2">
                Network Volume: <strong className="text-ok font-mono">{formatINR(metrics?.totalNetworkBusiness || 0)}</strong>
              </span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            {/* Search */}
            <div>
              <label className="label">Search Agent</label>
              <input
                type="text"
                placeholder="Agent Name, Code, ID..."
                className="field text-xs font-semibold py-1.5"
                value={downlineSearch}
                onChange={e => { setDownlineSearch(e.target.value); setDownlinePage(1) }}
              />
            </div>

            {/* Rank Filter */}
            <div>
              <label className="label">Filter by Rank</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={downlineRankFilter}
                onChange={e => { setDownlineRankFilter(e.target.value); setDownlinePage(1) }}
              >
                <option value="all">All Ranks</option>
                {Array.from({ length: 18 }, (_, i) => 18 - i).map(rk => (
                  <option key={rk} value={rk}>Rank {rk} ({getRank(rk).code})</option>
                ))}
              </select>
            </div>

            {/* Sorting */}
            <div>
              <label className="label">Sort By</label>
              <select
                className="field text-xs font-semibold py-1.5"
                value={downlineSortBy}
                onChange={e => setDownlineSortBy(e.target.value)}
              >
                <option value="networkBiz_desc">Highest Network Business</option>
                <option value="networkBiz_asc">Lowest Network Business</option>
                <option value="personalBiz_desc">Highest Personal Business</option>
                <option value="downlineBiz_desc">Highest Direct Team Business</option>
                <option value="directCount_desc">Highest Direct Downline Count</option>
                <option value="rank_desc">Highest Rank</option>
                <option value="rank_asc">Lowest Rank</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {paginatedDownlineTable.length === 0 ? (
            <div className="py-12 text-center text-ink-2 italic text-xs">
              No downline members match the search criteria.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th>Code / ID</th>
                    <th>Rank</th>
                    <th>Direct Sponsor</th>
                    <th>Level</th>
                    <th className="text-right">Personal Biz</th>
                    <th className="text-right">Direct Downline</th>
                    <th className="text-right text-gold">Total Network</th>
                    <th className="text-center">Team (Dir/Net)</th>
                    <th className="text-center">Policies</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDownlineTable.map(row => (
                    <tr key={row.agentId} className={row.agentId === m.id ? 'bg-gold/5 font-semibold' : ''}>
                      <td>
                        <span className="font-semibold text-ink-1 block">{row.agentName}</span>
                        {row.agentId === m.id && (
                          <span className="text-[10px] text-gold font-bold uppercase tracking-wider block">Selected Root</span>
                        )}
                      </td>
                      <td className="font-mono text-ink-2 text-[11px]">
                        <span className="text-gold font-bold">{row.sponsorCode}</span>
                      </td>
                      <td>
                        <RankBadge rank={row.rank} />
                      </td>
                      <td className="text-ink-2">
                        {row.directSponsorName}
                      </td>
                      <td className="font-mono text-[11px] text-ink-2">
                        {row.hierarchyLevel}
                      </td>
                      <td className="text-right font-mono font-bold text-ink-1">
                        {formatINR(row.personalBusiness)}
                      </td>
                      <td className="text-right font-mono text-ink-2">
                        {formatINR(row.directDownlineBusiness)}
                      </td>
                      <td className="text-right font-mono font-bold text-ok text-[13px]">
                        {formatINR(row.totalNetworkBusiness)}
                      </td>
                      <td className="text-center font-mono text-[11px]">
                        <span className="text-ink-1 font-bold">{row.directDownlineCount}</span> / <span className="text-ink-2">{row.networkDownlineCount}</span>
                      </td>
                      <td className="text-center font-mono font-bold text-ink-1">
                        {row.totalPolicies}
                      </td>
                      <td className="text-right">
                        {row.agentId !== m.id ? (
                          <Link
                            to={`/admin/members/${row.agentId}`}
                            className="btn-dark py-1 px-2.5 text-[10px] uppercase font-bold"
                          >
                            Drill Down &rarr;
                          </Link>
                        ) : (
                          <span className="text-[10px] text-ink-2 italic">Current</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          {totalDownlinePages > 1 && (
            <div className="flex justify-between items-center pt-2 text-xs border-t border-navy-4/50">
              <span className="text-ink-2 text-[11px]">
                Showing {((downlinePage - 1) * DOWNLINE_PER_PAGE) + 1} to {Math.min(downlinePage * DOWNLINE_PER_PAGE, filteredDownlineTable.length)} of {filteredDownlineTable.length} agents
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setDownlinePage(p => Math.max(1, p - 1))}
                  disabled={downlinePage === 1}
                  className="btn-dark py-1 px-3 text-xs font-bold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-3 py-1 font-bold text-ink-1 flex items-center">
                  Page {downlinePage} of {totalDownlinePages}
                </span>
                <button
                  onClick={() => setDownlinePage(p => Math.min(totalDownlinePages, p + 1))}
                  disabled={downlinePage === totalDownlinePages}
                  className="btn-dark py-1 px-3 text-xs font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 5: REPORTS & EXPORTS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Export CTA card */}
          <div className="card p-6 bg-navy-3 border-2 border-gold/40 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h3 className="font-serif text-lg font-bold text-gold tracking-tight">
                Export Complete Agent Report (.xlsx)
              </h3>
              <p className="text-xs text-ink-2 mt-1 max-w-xl">
                Downloads a professional 5-sheet Excel workbook containing Agent Profile, Complete Downline Genealogy, Policy Business Details, Agent-wise Summaries, and Rank-wise Performance Analytics.
              </p>
              <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-semibold text-ink-2">
                <span className="px-2 py-0.5 bg-navy-2 border border-navy-4 rounded">Sheet 1: Profile</span>
                <span className="px-2 py-0.5 bg-navy-2 border border-navy-4 rounded">Sheet 2: Downline ({downlineTable.length})</span>
                <span className="px-2 py-0.5 bg-navy-2 border border-navy-4 rounded">Sheet 3: Policies ({filteredBusinessHistory.length})</span>
                <span className="px-2 py-0.5 bg-navy-2 border border-navy-4 rounded">Sheet 4: Agent Summaries</span>
                <span className="px-2 py-0.5 bg-navy-2 border border-navy-4 rounded">Sheet 5: Rank Breakdown</span>
              </div>
            </div>

            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="btn-gold py-3 px-6 text-xs uppercase font-extrabold tracking-wider flex items-center gap-2 shadow-lg"
            >
              <IDownload size={18} />
              {exporting ? 'Generating Report...' : 'Download Complete Report (.xlsx)'}
            </button>
          </div>

          {/* Rank-wise Summary Table (Sheet 5 preview) */}
          <div className="card p-6 bg-navy-3 border border-navy-4 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Rank-wise Business Performance Summary
            </h3>
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Rank Level</th>
                    <th>Designation</th>
                    <th className="text-center">Agent Count</th>
                    <th className="text-center">Policies Closed</th>
                    <th className="text-right">Personal Business (₹)</th>
                    <th className="text-right text-gold">Network Business (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rankSummary.map(r => {
                    const rInfo = getRank(r.rank)
                    return (
                      <tr key={r.rank}>
                        <td className="font-bold text-ink-1">Rank {r.rank}</td>
                        <td>
                          <RankBadge rank={r.rank} />
                        </td>
                        <td className="text-center font-mono font-bold text-ink-1">{r.agentCount}</td>
                        <td className="text-center font-mono text-ink-1">{r.totalPolicies}</td>
                        <td className="text-right font-mono font-bold text-ink-1">{formatINR(r.personalBusiness)}</td>
                        <td className="text-right font-mono font-bold text-ok">{formatINR(r.totalNetworkBusiness)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {changeEmailModalOpen && (
        <ChangeEmailModal
          agentId={m.id}
          currentEmail={m.email}
          agentName={m.name}
          onClose={() => setChangeEmailModalOpen(false)}
          onSuccess={(newEmail) => {
            setM(prev => ({ ...prev, email: newEmail }))
            setChangeEmailModalOpen(false)
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-6 bg-navy-3 border border-navy-4 space-y-4">
            <h3 className="font-serif text-lg font-bold text-ink-1">Reset Agent Password</h3>
            <p className="text-xs text-ink-2">
              Send password reset instructions to <strong>{m.email}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setResetModalOpen(false)} className="btn-dark py-1.5 px-3 text-xs">
                Cancel
              </button>
              <button
                disabled={resetting}
                onClick={async () => {
                  setResetting(true)
                  try {
                    await authAPI.resetPasswordForEmail(m.email)
                    toast.success('Password reset email sent!')
                    setResetModalOpen(false)
                  } catch (e) {
                    toast.error(e.message || 'Failed to send reset email')
                  } finally {
                    setResetting(false)
                  }
                }}
                className="btn-gold py-1.5 px-4 text-xs font-bold"
              >
                {resetting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View As Agent Modal */}
      {viewAsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6 bg-navy-3 border border-navy-4 space-y-4">
            <h3 className="font-serif text-lg font-bold text-gold">Initiate View As Agent Session</h3>
            <p className="text-xs text-ink-2">
              You are about to view the portal as <strong>{m.name}</strong> ({m.sponsorCode || '—'}).
              This mode is strictly <strong>READ-ONLY</strong>. Financial updates and destructive operations are disabled.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setViewAsModalOpen(false)} className="btn-dark py-1.5 px-3 text-xs">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await startViewingAs(m)
                    toast.success(`Now viewing as ${m.name}`)
                    setViewAsModalOpen(false)
                    navigate('/portal/overview')
                  } catch (err) {
                    toast.error(`Failed to start session: ${err.message}`)
                  }
                }}
                className="btn-gold py-1.5 px-4 text-xs font-bold"
              >
                Confirm View As Agent
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
