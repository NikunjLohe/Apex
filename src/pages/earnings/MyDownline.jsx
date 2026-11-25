import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission, CAP } from '../../hooks/usePermission'
import { useRanks } from '../../contexts/RanksContext'
import {
  profilesAPI,
  policiesAPI,
  customersAPI,
  paymentsAPI,
  commissionsAPI,
  masterDataAPI
} from '../../lib/supabase'
import { formatINR, fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import {
  INetwork,
  IPlus,
  ITrophy,
  IDashboard,
  IUsers,
  IDownload,
  ISearch,
  ICash,
  IDoc,
  IShield,
  IAlert,
  ICheck,
  IClock
} from '../../components/ui/icons'
import GenealogyTree from '../../components/ui/GenealogyTree'
import MemberModal from '../../components/MemberModal'
import {
  buildHierarchyMap,
  calculatePolicyBusiness,
  calculateAgentBusinessMetrics,
  generateDownlineTable,
  generateRankSummary,
  exportAgentExcelReport
} from '../../lib/downlineAnalytics'

export default function MyDownline() {
  const [searchParams] = useSearchParams()
  const { profile, isViewingAs } = useAuth()
  const uid = profile?.uid || profile?.id
  const { can } = usePermission()
  const { config: ranksConfig, getRank, nextRank } = useRanks()

  // Tab State: 'dashboard' | 'list' | 'tree' | 'reports'
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showRecruit, setShowRecruit] = useState(false)

  // Raw Datasets
  const [allProfiles, setAllProfiles] = useState([])
  const [allPolicies, setAllPolicies] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [allCommissions, setAllCommissions] = useState([])
  const [branches, setBranches] = useState([])

  // Modal State for Downline Agent Drilldown
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false)

  // Filters for Tab B: My Downline List
  const [listSearch, setListSearch] = useState('')
  const [listRankFilter, setListRankFilter] = useState('all')
  const [listStatusFilter, setListStatusFilter] = useState(searchParams.get('status') || 'all')
  const [listSortBy, setListSortBy] = useState('networkBiz_desc')
  const [listFromDate, setListFromDate] = useState('')
  const [listToDate, setListToDate] = useState('')
  const [listPage, setListPage] = useState(1)
  const LIST_PER_PAGE = 10

  // Filters for Tab D: Team Business Details
  const [bizSearch, setBizSearch] = useState('')
  const [bizScope, setBizScope] = useState('all') // 'all' (team) | 'personal'
  const [bizPlanType, setBizPlanType] = useState('all') // 'all' | 'RD' | 'FD'
  const [bizStatus, setBizStatus] = useState('all')
  const [bizAgentFilter, setBizAgentFilter] = useState('all')
  const [bizFromDate, setBizFromDate] = useState('')
  const [bizToDate, setBizToDate] = useState('')
  const [bizPage, setBizPage] = useState(1)
  const BIZ_PER_PAGE = 10

  // Load all required datasets securely
  useEffect(() => {
    let mounted = true
    if (!uid) return

    setLoading(true)
    Promise.all([
      profilesAPI.listProfiles().catch(() => []),
      policiesAPI.listPolicies().catch(() => []),
      customersAPI.listCustomers().catch(() => []),
      paymentsAPI.listPayments().catch(() => []),
      commissionsAPI.listCommissions().catch(() => []),
      masterDataAPI.listBranches().catch(() => [])
    ]).then(([profs, pols, custs, pays, comms, brs]) => {
      if (!mounted) return
      setAllProfiles(profs || [])
      setAllPolicies(pols || [])
      setAllCustomers(custs || [])
      setAllPayments(pays || [])
      setAllCommissions(comms || [])
      setBranches(brs || [])
      setLoading(false)
    }).catch(err => {
      console.error('Error loading team downline data:', err)
      if (mounted) setLoading(false)
    })

    return () => { mounted = false }
  }, [uid])

  // 1. Build hierarchy map from all profiles
  const hierarchyMap = useMemo(() => {
    return buildHierarchyMap(allProfiles)
  }, [allProfiles])

  // 2. Strict authorization scoping: Agent only accesses their own subtree
  const { authorizedAgentIds, authorizedDescendants, directDownlineAgents } = useMemo(() => {
    if (!uid || !hierarchyMap) {
      return { authorizedAgentIds: new Set(), authorizedDescendants: [], directDownlineAgents: [] }
    }
    const descendants = hierarchyMap.getAllDescendants(uid)
    const direct = hierarchyMap.getDirectChildren(uid)
    const idSet = new Set([uid, ...descendants.map(d => d.id)])
    return {
      authorizedAgentIds: idSet,
      authorizedDescendants: descendants,
      directDownlineAgents: direct
    }
  }, [uid, hierarchyMap])

  // 3. Authorized policies & customers
  const authorizedPolicies = useMemo(() => {
    return allPolicies.filter(p => authorizedAgentIds.has(p.agentId || p.agent_id))
  }, [allPolicies, authorizedAgentIds])

  const authorizedCustomers = useMemo(() => {
    return allCustomers.filter(c => {
      const aId = c.agentId || c.agent_id || c.referredBy
      return authorizedAgentIds.has(aId)
    })
  }, [allCustomers, authorizedAgentIds])

  // 4. Calculate business metrics for the logged-in agent (Root of their network)
  const metrics = useMemo(() => {
    if (!uid) return null
    return calculateAgentBusinessMetrics({
      agentId: uid,
      allProfiles,
      policies: authorizedPolicies,
      payments: allPayments,
      commissions: allCommissions,
      customers: authorizedCustomers,
      hierarchyMap
    })
  }, [uid, allProfiles, authorizedPolicies, allPayments, allCommissions, authorizedCustomers, hierarchyMap])

  // 5. Build downline table rows for all agents under the logged-in agent
  const downlineTable = useMemo(() => {
    if (!uid) return []
    return generateDownlineTable({
      rootId: uid,
      allProfiles,
      policies: authorizedPolicies,
      hierarchyMap
    })
  }, [uid, allProfiles, authorizedPolicies, hierarchyMap])

  // 6. Rank summary for downline
  const rankSummary = useMemo(() => {
    if (!downlineTable.length) return []
    return generateRankSummary(downlineTable)
  }, [downlineTable])

  // 7. Rank promotion progress calculation
  const promoProgress = useMemo(() => {
    const currentRank = profile?.rank || 1
    const nextRankObj = nextRank(currentRank)
    if (!nextRankObj) return null

    const targetBv = nextRankObj.promoTarget || 0
    const personalAchieved = metrics?.personalBusiness || 0

    // Downline requirements (including alternate paths like ADM: 2 pro AM or 6 pro AO)
    const reqCode = nextRankObj.requiredPromotedRank || ''
    const reqCount = nextRankObj.requiredPromotedCount || 0
    const reqRankNum = ranksConfig?.RANKS?.find(r => r.code === reqCode)?.rank || 0

    const altReqCode = nextRankObj.altRequiredPromotedRank || ''
    const altReqCount = nextRankObj.altRequiredPromotedCount || 0
    const altReqRankNum = ranksConfig?.RANKS?.find(r => r.code === altReqCode)?.rank || 0

    const qualifiedDownlineCount = reqRankNum > 0
      ? directDownlineAgents.filter(a => (Number(a.rank) || 0) >= reqRankNum).length
      : 0

    const altQualifiedDownlineCount = altReqRankNum > 0
      ? directDownlineAgents.filter(a => (Number(a.rank) || 0) >= altReqRankNum).length
      : 0

    const businessQualified = personalAchieved >= targetBv
    const primaryDownlineMet = reqCount > 0 ? qualifiedDownlineCount >= reqCount : true
    const altDownlineMet = altReqCount > 0 ? altQualifiedDownlineCount >= altReqCount : false
    const downlineQualified = reqCount > 0 ? (primaryDownlineMet || altDownlineMet) : true

    return {
      nextRankObj,
      targetBv,
      personalAchieved,
      businessQualified,
      reqCode,
      reqCount,
      qualifiedDownlineCount,
      altReqCode,
      altReqCount,
      altQualifiedDownlineCount,
      downlineQualified,
      isFullyQualified: businessQualified && downlineQualified
    }
  }, [profile, nextRank, ranksConfig, metrics, directDownlineAgents])

  // ───────────────────────────────────────────────────────────────────────────
  // Filtered Downline Table (Tab B)
  // ───────────────────────────────────────────────────────────────────────────
  const filteredDownline = useMemo(() => {
    let list = [...downlineTable]

    // Search query
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase().trim()
      list = list.filter(r =>
        r.agentName?.toLowerCase().includes(q) ||
        r.agentId?.toLowerCase().includes(q) ||
        r.sponsorCode?.toLowerCase().includes(q) ||
        r.directSponsorName?.toLowerCase().includes(q)
      )
    }

    // Rank filter
    if (listRankFilter !== 'all') {
      list = list.filter(r => String(r.rank) === String(listRankFilter))
    }

    // Status filter
    if (listStatusFilter !== 'all') {
      list = list.filter(r => (r.status || 'active').toLowerCase() === listStatusFilter.toLowerCase())
    }

    // Date range filter
    if (listFromDate) {
      list = list.filter(r => r.joiningDate && r.joiningDate >= listFromDate)
    }
    if (listToDate) {
      list = list.filter(r => r.joiningDate && r.joiningDate <= listToDate + 'T23:59:59')
    }

    // Sorting
    list.sort((a, b) => {
      switch (listSortBy) {
        case 'networkBiz_asc':
          return a.totalNetworkBusiness - b.totalNetworkBusiness
        case 'personalBiz_desc':
          return b.personalBusiness - a.personalBusiness
        case 'personalBiz_asc':
          return a.personalBusiness - b.personalBusiness
        case 'downlineBiz_desc':
          return b.directDownlineBusiness - a.directDownlineBusiness
        case 'directCount_desc':
          return b.directDownlineCount - a.directDownlineCount
        case 'rank_desc':
          return b.rank - a.rank
        case 'rank_asc':
          return a.rank - b.rank
        case 'networkBiz_desc':
        default:
          return b.totalNetworkBusiness - a.totalNetworkBusiness
      }
    })

    return list
  }, [downlineTable, listSearch, listRankFilter, listStatusFilter, listSortBy, listFromDate, listToDate])

  const totalDownlinePages = Math.max(1, Math.ceil(filteredDownline.length / LIST_PER_PAGE))
  const paginatedDownline = useMemo(() => {
    const start = (listPage - 1) * LIST_PER_PAGE
    return filteredDownline.slice(start, start + LIST_PER_PAGE)
  }, [filteredDownline, listPage])

  // Reset page when filters change
  useEffect(() => {
    setListPage(1)
  }, [listSearch, listRankFilter, listStatusFilter, listSortBy, listFromDate, listToDate])

  // ───────────────────────────────────────────────────────────────────────────
  // Filtered Business Policies (Tab D)
  // ───────────────────────────────────────────────────────────────────────────
  const filteredPolicies = useMemo(() => {
    let list = [...authorizedPolicies]

    // Scope filter (Team vs Personal)
    if (bizScope === 'personal') {
      list = list.filter(p => (p.agentId || p.agent_id) === uid)
    }

    // Plan Type
    if (bizPlanType !== 'all') {
      list = list.filter(p => {
        const b = calculatePolicyBusiness(p)
        return bizPlanType === 'RD' ? b.isRD : b.isFD
      })
    }

    // Status
    if (bizStatus !== 'all') {
      list = list.filter(p => (p.status || 'active').toLowerCase() === bizStatus.toLowerCase())
    }

    // Agent filter
    if (bizAgentFilter !== 'all') {
      list = list.filter(p => (p.agentId || p.agent_id) === bizAgentFilter)
    }

    // Date range
    if (bizFromDate) {
      list = list.filter(p => (p.startDate || p.created_at || '') >= bizFromDate)
    }
    if (bizToDate) {
      list = list.filter(p => (p.startDate || p.created_at || '') <= bizToDate + 'T23:59:59')
    }

    // Search query
    if (bizSearch.trim()) {
      const q = bizSearch.toLowerCase().trim()
      list = list.filter(p =>
        p.policyNumber?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.agentName?.toLowerCase().includes(q) ||
        p.planCode?.toLowerCase().includes(q)
      )
    }

    return list
  }, [authorizedPolicies, bizScope, bizPlanType, bizStatus, bizAgentFilter, bizFromDate, bizToDate, bizSearch, uid])

  const totalBizPages = Math.max(1, Math.ceil(filteredPolicies.length / BIZ_PER_PAGE))
  const paginatedPolicies = useMemo(() => {
    const start = (bizPage - 1) * BIZ_PER_PAGE
    return filteredPolicies.slice(start, start + BIZ_PER_PAGE)
  }, [filteredPolicies, bizPage])

  useEffect(() => {
    setBizPage(1)
  }, [bizSearch, bizScope, bizPlanType, bizStatus, bizAgentFilter, bizFromDate, bizToDate])

  // ───────────────────────────────────────────────────────────────────────────
  // Excel Export Handler
  // ───────────────────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!profile) return toast.error('Profile not loaded')
    setExporting(true)
    try {
      exportAgentExcelReport({
        rootAgent: profile,
        metrics,
        downlineTable,
        policiesList: authorizedPolicies,
        rankSummary,
        isAgentScope: true // Strictly authorized team data only
      })
      toast.success('Downloaded My Team Business Report (.xlsx)')
    } catch (err) {
      console.error('Failed to export Excel report:', err)
      toast.error('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Downline Member Drilldown Details
  // ───────────────────────────────────────────────────────────────────────────
  const selectedAgentDetails = useMemo(() => {
    if (!selectedAgentId) return null
    // Security check: Must be in authorized subtree
    if (!authorizedAgentIds.has(selectedAgentId)) return null

    const agent = allProfiles.find(p => p.id === selectedAgentId)
    if (!agent) return null

    const memberMetrics = calculateAgentBusinessMetrics({
      agentId: selectedAgentId,
      allProfiles,
      policies: authorizedPolicies,
      payments: allPayments,
      commissions: allCommissions,
      customers: authorizedCustomers,
      hierarchyMap
    })

    const directChildren = hierarchyMap.getDirectChildren(selectedAgentId)
    const directSponsor = agent.sponsorId ? allProfiles.find(p => p.id === agent.sponsorId) : null

    return {
      agent,
      metrics: memberMetrics,
      directChildren,
      directSponsor
    }
  }, [selectedAgentId, authorizedAgentIds, allProfiles, authorizedPolicies, allPayments, allCommissions, authorizedCustomers, hierarchyMap])

  const openDrilldown = (agentId) => {
    if (!authorizedAgentIds.has(agentId)) {
      toast.error('You are not authorized to view agents outside your downline.')
      return
    }
    setSelectedAgentId(agentId)
    setDrilldownModalOpen(true)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-navy-4/50">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">
              My Downline & Team Business
            </h2>
            <RankBadge rank={profile?.rank || 1} size="md" showName />
          </div>
          <p className="text-xs text-ink-2 mt-0.5">
            Monitor your direct and network downline team, track business performance, and export certified team reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can(CAP.RECRUIT) && profile?.rank > 1 && !isViewingAs && (
            <button
              type="button"
              onClick={() => setShowRecruit(true)}
              className="btn-gold py-2 text-xs px-4 flex items-center gap-1.5 uppercase font-bold tracking-wider"
            >
              <IPlus size={14} /> Recruit Agent
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="btn-dark py-2 px-4 text-xs font-bold flex items-center gap-2 border border-gold-1/30 hover:border-gold text-gold"
            title="Download full 5-sheet team business workbook"
          >
            <IDownload size={14} />
            {exporting ? 'Generating Excel...' : 'Download My Team Business Report (.xlsx)'}
          </button>
        </div>
      </div>

      {/* ── Main Navigation Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-navy-4">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'dashboard'
              ? 'border-gold text-gold-1'
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          <IDashboard size={14} /> My Team Overview
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'list'
              ? 'border-gold text-gold-1'
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          <IUsers size={14} /> My Downline List ({downlineTable.length})
        </button>

        <button
          onClick={() => setActiveTab('tree')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'tree'
              ? 'border-gold text-gold-1'
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          <INetwork size={14} /> My Genealogy Tree
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'reports'
              ? 'border-gold text-gold-1'
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          <IDoc size={14} /> Team Business & Excel Export
        </button>
      </div>

      {/* ── TAB 1: MY TEAM DASHBOARD ──────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {loading ? (
            <SkeletonStats count={9} />
          ) : (
            <>
              {/* 9 Core KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {/* 1. Direct Downline */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Direct Downline</span>
                    <span className="p-1 rounded bg-gold-1/10 text-gold"><IUsers size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{metrics?.directDownlineCount || 0}</p>
                  <p className="text-[10px] text-ink-2">Directly sponsored agents</p>
                </div>

                {/* 2. Network Downline */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Network Downline</span>
                    <span className="p-1 rounded bg-blue-500/10 text-blue-400"><INetwork size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{metrics?.networkDownlineCount || 0}</p>
                  <p className="text-[10px] text-ink-2">Total team across all levels</p>
                </div>

                {/* 3. Personal Business */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Personal Business</span>
                    <span className="p-1 rounded bg-emerald-500/10 text-emerald-400"><ICash size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{formatINR(metrics?.personalBusiness || 0)}</p>
                  <p className="text-[10px] text-ink-2">Closed directly by you</p>
                </div>

                {/* 4. Direct Team Business */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Direct Team Business</span>
                    <span className="p-1 rounded bg-purple-500/10 text-purple-400"><ITrophy size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{formatINR(metrics?.directDownlineBusiness || 0)}</p>
                  <p className="text-[10px] text-ink-2">By frontline agents</p>
                </div>

                {/* 5. Total Network Business */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-gold-1/30 bg-gold-1/5 col-span-2 md:col-span-1">
                  <div className="flex items-center justify-between text-gold text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total Network Business</span>
                    <span className="p-1 rounded bg-gold/20 text-gold"><IShield size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-gold-1">{formatINR(metrics?.totalNetworkBusiness || 0)}</p>
                  <p className="text-[10px] text-ink-2">Personal + All Descendants</p>
                </div>

                {/* 6. Total RD Business */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total RD Business</span>
                    <span className="p-1 rounded bg-amber-500/10 text-amber-400"><IDoc size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{formatINR(metrics?.networkRDBusiness || 0)}</p>
                  <p className="text-[10px] text-ink-2">Annualized contract value</p>
                </div>

                {/* 7. Total FD Business */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total FD Business</span>
                    <span className="p-1 rounded bg-cyan-500/10 text-cyan-400"><ICash size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{formatINR(metrics?.networkFDBusiness || 0)}</p>
                  <p className="text-[10px] text-ink-2">FD & Pension deposits</p>
                </div>

                {/* 8. Total Policies */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total Policies</span>
                    <span className="p-1 rounded bg-indigo-500/10 text-indigo-400"><IDoc size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{metrics?.totalPolicies || 0}</p>
                  <p className="text-[10px] text-ink-2">{metrics?.activePolicies || 0} active</p>
                </div>

                {/* 9. Total Customers */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total Customers</span>
                    <span className="p-1 rounded bg-teal-500/10 text-teal-400"><IUsers size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{metrics?.totalCustomers || 0}</p>
                  <p className="text-[10px] text-ink-2">CIF client network</p>
                </div>

                {/* Collections / Commissions Overview */}
                <div className="card p-4 space-y-1 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between text-ink-2 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Total Collections</span>
                    <span className="p-1 rounded bg-emerald-500/10 text-emerald-400"><ICash size={14} /></span>
                  </div>
                  <p className="text-xl font-bold font-serif text-ink-1">{formatINR(metrics?.totalCollections || 0)}</p>
                  <p className="text-[10px] text-ink-2">Realized ledger cash</p>
                </div>
              </div>

              {/* Rank Promotion Tracker & Network Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Promotion Tracker */}
                <div className="card p-5 space-y-4 lg:col-span-2 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between pb-2 border-b border-navy-4">
                    <div className="flex items-center gap-2">
                      <ITrophy size={16} className="text-gold" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                        Next Rank Promotion Qualification Tracker
                      </h3>
                    </div>
                    {promoProgress?.nextRankObj && (
                      <span className="text-[10px] text-ink-2 font-mono">
                        Target: <strong className="text-gold-1">{promoProgress.nextRankObj.name} ({promoProgress.nextRankObj.code})</strong>
                      </span>
                    )}
                  </div>

                  {promoProgress ? (
                    <div className="space-y-4 text-xs">
                      {/* Personal Business Target */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between font-semibold">
                          <span className="text-ink-2">1. Personal Lifetime Business Volume</span>
                          <span className="text-ink-1 font-mono">
                            {formatINR(promoProgress.personalAchieved)} / {formatINR(promoProgress.targetBv)}
                          </span>
                        </div>
                        <div className="w-full bg-navy-2 rounded-full h-2.5 overflow-hidden border border-navy-4">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-300 ${
                              promoProgress.businessQualified ? 'bg-emerald-500' : 'bg-gold'
                            }`}
                            style={{
                              width: `${Math.min(100, Math.round((promoProgress.personalAchieved / (promoProgress.targetBv || 1)) * 100))}%`
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-ink-2">
                            Completion: {Math.min(100, Math.round((promoProgress.personalAchieved / (promoProgress.targetBv || 1)) * 100))}%
                          </span>
                          <span className={promoProgress.businessQualified ? 'text-emerald-400 font-bold' : 'text-gold font-bold'}>
                            {promoProgress.businessQualified ? 'Requirement Met' : 'In Progress'}
                          </span>
                        </div>
                      </div>

                      {/* Downline Promotee Target */}
                      {promoProgress.reqCount > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-navy-4/50">
                          <div className="flex justify-between font-semibold">
                            <span className="text-ink-2">
                              2. Direct Downline Promotion ({promoProgress.reqCode}{promoProgress.altReqCount > 0 && promoProgress.altReqCode ? ` or ${promoProgress.altReqCount} ${promoProgress.altReqCode}` : ''})
                            </span>
                            <span className="text-ink-1 font-mono">
                              {promoProgress.qualifiedDownlineCount} / {promoProgress.reqCount} {promoProgress.reqCode}
                              {promoProgress.altReqCount > 0 && promoProgress.altReqCode ? ` · ${promoProgress.altQualifiedDownlineCount} / ${promoProgress.altReqCount} ${promoProgress.altReqCode}` : ''}
                            </span>
                          </div>
                          <div className="w-full bg-navy-2 rounded-full h-2.5 overflow-hidden border border-navy-4">
                            <div
                              className={`h-2.5 rounded-full transition-all duration-300 ${
                                promoProgress.downlineQualified ? 'bg-emerald-500' : 'bg-gold'
                              }`}
                              style={{
                                width: `${Math.min(100, Math.round(Math.max(
                                  promoProgress.qualifiedDownlineCount / promoProgress.reqCount,
                                  promoProgress.altReqCount > 0 ? promoProgress.altQualifiedDownlineCount / promoProgress.altReqCount : 0
                                ) * 100))}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-ink-2">
                              Required: {promoProgress.reqCount} {promoProgress.reqCode}
                              {promoProgress.altReqCount > 0 && promoProgress.altReqCode ? ` or ${promoProgress.altReqCount} ${promoProgress.altReqCode}` : ''}
                            </span>
                            <span className={promoProgress.downlineQualified ? 'text-emerald-400 font-bold' : 'text-gold font-bold'}>
                              {promoProgress.downlineQualified ? 'Requirement Met' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="pt-3 border-t border-navy-4 flex justify-between items-center">
                        <span className="text-ink-2 font-medium">Promotion Status:</span>
                        <span
                          className={`px-3 py-1 rounded text-[10px] uppercase font-extrabold tracking-wider border ${
                            promoProgress.isFullyQualified
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-gold-1/10 text-gold border-gold-1/25'
                          }`}
                        >
                          {promoProgress.isFullyQualified ? 'Eligible for Next Rank Promotion' : 'Qualification In Progress'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-ink-2">
                      <p className="font-semibold text-gold">Highest Rank Achieved</p>
                      <p className="text-[11px] mt-1">You hold the highest leadership tier in the APEX hierarchy.</p>
                    </div>
                  )}
                </div>

                {/* Team Rank Distribution */}
                <div className="card p-5 space-y-4 bg-navy-3 border border-navy-4">
                  <div className="flex items-center justify-between pb-2 border-b border-navy-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                      Team Rank Breakdown
                    </h3>
                    <span className="text-[10px] text-ink-2 font-mono">{downlineTable.length} total</span>
                  </div>

                  {rankSummary.length > 0 ? (
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {rankSummary.map(r => {
                        const rankInfo = getRank(r.rank)
                        const pct = Math.round((r.agentCount / (downlineTable.length || 1)) * 100)
                        return (
                          <div key={r.rank} className="flex justify-between items-center text-xs p-2 rounded bg-navy-2 border border-navy-4/50">
                            <div className="flex items-center gap-2">
                              <RankBadge rank={r.rank} size="sm" showName />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-ink-2 text-[10px]">{pct}%</span>
                              <span className="font-mono font-bold text-ink-1 px-2 py-0.5 rounded bg-navy-3 border border-navy-4">
                                {r.agentCount}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-2 italic text-center py-6">No sponsored downline registered yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: MY DOWNLINE LIST ────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="card p-4 space-y-4 bg-navy-3 border border-navy-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="label">Search Downline Team</label>
                <div className="relative">
                  <input
                    type="text"
                    className="field text-xs pl-8"
                    placeholder="Search agent name, ID, or sponsor code..."
                    value={listSearch}
                    onChange={e => setListSearch(e.target.value)}
                  />
                  <ISearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
                </div>
              </div>

              {/* Rank Filter */}
              <div>
                <label className="label">Rank Level</label>
                <select
                  className="field text-xs"
                  value={listRankFilter}
                  onChange={e => setListRankFilter(e.target.value)}
                >
                  <option value="all">All Ranks (1–18)</option>
                  {ranksConfig?.RANKS?.map(r => (
                    <option key={r.rank} value={r.rank}>
                      Rank {r.rank} — {r.code} ({r.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="label">Agent Status</label>
                <select
                  className="field text-xs"
                  value={listStatusFilter}
                  onChange={e => setListStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="lg:col-span-2">
                <label className="label">Sort Agents By</label>
                <select
                  className="field text-xs"
                  value={listSortBy}
                  onChange={e => setListSortBy(e.target.value)}
                >
                  <option value="networkBiz_desc">Highest Network Business</option>
                  <option value="networkBiz_asc">Lowest Network Business</option>
                  <option value="personalBiz_desc">Highest Personal Business</option>
                  <option value="personalBiz_asc">Lowest Personal Business</option>
                  <option value="downlineBiz_desc">Highest Direct Downline Business</option>
                  <option value="directCount_desc">Most Direct Downline Agents</option>
                  <option value="rank_desc">Highest Rank Level</option>
                  <option value="rank_asc">Lowest Rank Level</option>
                </select>
              </div>
            </div>

            {/* Joining Date Range */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-navy-4/50 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-ink-2 text-[11px] font-semibold">Joining Date:</span>
                <input
                  type="date"
                  className="field text-xs py-1 px-2 w-36"
                  value={listFromDate}
                  onChange={e => setListFromDate(e.target.value)}
                />
                <span className="text-ink-2">to</span>
                <input
                  type="date"
                  className="field text-xs py-1 px-2 w-36"
                  value={listToDate}
                  onChange={e => setListToDate(e.target.value)}
                />
                {(listFromDate || listToDate) && (
                  <button
                    onClick={() => { setListFromDate(''); setListToDate('') }}
                    className="text-[10px] text-gold hover:underline ml-1"
                  >
                    Clear dates
                  </button>
                )}
              </div>

              <div className="text-ink-2 text-xs">
                Showing <strong>{filteredDownline.length}</strong> downline members
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <SkeletonTable rows={8} cols={10} />
          ) : filteredDownline.length === 0 ? (
            <EmptyState
              icon={<INetwork size={28} />}
              title="No downline members found"
              message="No agents match your filter criteria or you have not sponsored any downline members yet."
            />
          ) : (
            <div className="card overflow-hidden bg-navy-3 border border-navy-4">
              <div className="table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name & Code</th>
                      <th>Agent ID</th>
                      <th>Rank</th>
                      <th>Joining Date</th>
                      <th className="text-center">Direct Downline</th>
                      <th className="text-right">Personal Business</th>
                      <th className="text-right">Total Network Business</th>
                      <th className="text-right">RD Business</th>
                      <th className="text-right">FD Business</th>
                      <th className="text-center">Policies</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDownline.map((row) => (
                      <tr
                        key={row.agentId}
                        className="hover:bg-navy-2/60 transition-colors"
                      >
                        <td>
                          <div className="flex flex-col">
                            <span className="font-semibold text-ink-1">{row.agentName}</span>
                            <span className="text-[10px] text-ink-2 font-mono">
                              Code: {row.sponsorCode || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-[11px] text-ink-2">
                          {row.agentId ? `${row.agentId.slice(0, 8)}...` : '—'}
                        </td>
                        <td>
                          <RankBadge rank={row.rank} size="sm" showName />
                        </td>
                        <td className="text-ink-2 text-[11px]">
                          {row.joiningDate ? fmtDate(row.joiningDate) : '—'}
                        </td>
                        <td className="text-center font-mono font-bold text-ink-1">
                          {row.directDownlineCount}
                        </td>
                        <td className="text-right font-mono font-semibold text-ink-1">
                          {formatINR(row.personalBusiness)}
                        </td>
                        <td className="text-right font-mono font-bold text-gold-1">
                          {formatINR(row.totalNetworkBusiness)}
                        </td>
                        <td className="text-right font-mono text-ink-2">
                          {formatINR(row.rdBusiness)}
                        </td>
                        <td className="text-right font-mono text-ink-2">
                          {formatINR(row.fdBusiness)}
                        </td>
                        <td className="text-center font-mono font-semibold text-ink-1">
                          {row.totalPolicies}
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => openDrilldown(row.agentId)}
                            className="btn-dark py-1 px-2.5 text-[11px] font-bold text-gold border border-gold-1/30 hover:border-gold hover:bg-gold-1/10 rounded"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalDownlinePages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-navy-4 text-xs">
                  <span className="text-ink-2">
                    Page <strong>{listPage}</strong> of <strong>{totalDownlinePages}</strong>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={listPage <= 1}
                      onClick={() => setListPage(p => Math.max(1, p - 1))}
                      className="btn-dark py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalDownlinePages }, (_, i) => i + 1).slice(
                      Math.max(0, listPage - 3),
                      Math.min(totalDownlinePages, listPage + 2)
                    ).map(p => (
                      <button
                        key={p}
                        onClick={() => setListPage(p)}
                        className={`py-1 px-2.5 rounded text-xs font-bold transition-all ${
                          p === listPage
                            ? 'bg-gold text-navy-1'
                            : 'bg-navy-2 text-ink-2 hover:text-ink-1'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      disabled={listPage >= totalDownlinePages}
                      onClick={() => setListPage(p => Math.min(totalDownlinePages, p + 1))}
                      className="btn-dark py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: MY GENEALOGY TREE ──────────────────────────────────────── */}
      {activeTab === 'tree' && (
        <div className="space-y-4">
          <div className="card p-4 bg-navy-3 border border-navy-4 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-sm font-bold text-ink-1">Interactive Network Genealogy Tree</h3>
              <p className="text-xs text-ink-2">
                Click on any node to inspect that agent&apos;s credentials and business drilldown.
              </p>
            </div>
            <span className="text-xs text-gold font-bold bg-navy-2 px-3 py-1 rounded border border-navy-4">
              Root: {profile?.name} ({profile?.sponsorCode || 'Self'})
            </span>
          </div>

          <GenealogyTree
            rootId={uid}
            onSelectAgent={(agent) => {
              if (agent?.id) openDrilldown(agent.id)
            }}
          />
        </div>
      )}

      {/* ── TAB 4: TEAM BUSINESS & EXCEL EXPORT ────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Header Banner & Excel Export Button */}
          <div className="card p-5 bg-navy-3 border border-gold-1/30 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-gold">Download Certified Team Business Report</h3>
              <p className="text-xs text-ink-2 mt-1">
                Generates a multi-sheet formatted Excel workbook (.xlsx) with Agent Profile, Complete Downline Hierarchy,
                Detailed Business Contracts, Agent-wise Totals, and Rank-wise Summaries.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="btn-gold py-2.5 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:scale-[1.02] transition-transform"
            >
              <IDownload size={15} />
              {exporting ? 'Generating Excel Workbook...' : 'Download My Team Business Report (.xlsx)'}
            </button>
          </div>

          {/* Filters for Policies */}
          <div className="card p-4 space-y-3 bg-navy-3 border border-navy-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="label">Search Business Contracts</label>
                <div className="relative">
                  <input
                    type="text"
                    className="field text-xs pl-8"
                    placeholder="Search policy #, client name, plan code, agent..."
                    value={bizSearch}
                    onChange={e => setBizSearch(e.target.value)}
                  />
                  <ISearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="label">Business Scope</label>
                <select
                  className="field text-xs"
                  value={bizScope}
                  onChange={e => setBizScope(e.target.value)}
                >
                  <option value="all">Entire Team Downline</option>
                  <option value="personal">My Personal Business Only</option>
                </select>
              </div>

              {/* Plan Type */}
              <div>
                <label className="label">Plan Category</label>
                <select
                  className="field text-xs"
                  value={bizPlanType}
                  onChange={e => setBizPlanType(e.target.value)}
                >
                  <option value="all">All Plans (RD & FD)</option>
                  <option value="RD">Recurring Deposit (RD)</option>
                  <option value="FD">Fixed Deposit (FD)</option>
                </select>
              </div>

              {/* Selling Agent */}
              <div>
                <label className="label">Selling Agent</label>
                <select
                  className="field text-xs"
                  value={bizAgentFilter}
                  onChange={e => setBizAgentFilter(e.target.value)}
                >
                  <option value="all">All Downline Agents</option>
                  <option value={uid}>You ({profile?.name})</option>
                  {downlineTable.map(a => (
                    <option key={a.agentId} value={a.agentId}>
                      {a.agentName} ({a.sponsorCode})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range & Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-navy-4/50 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-ink-2 text-[11px] font-semibold">Date Range:</span>
                <input
                  type="date"
                  className="field text-xs py-1 px-2 w-36"
                  value={bizFromDate}
                  onChange={e => setBizFromDate(e.target.value)}
                />
                <span className="text-ink-2">to</span>
                <input
                  type="date"
                  className="field text-xs py-1 px-2 w-36"
                  value={bizToDate}
                  onChange={e => setBizToDate(e.target.value)}
                />
                {(bizFromDate || bizToDate) && (
                  <button
                    onClick={() => { setBizFromDate(''); setBizToDate('') }}
                    className="text-[10px] text-gold hover:underline ml-1"
                  >
                    Clear dates
                  </button>
                )}
              </div>

              <div className="text-ink-2 text-xs">
                Found <strong>{filteredPolicies.length}</strong> matching contracts
              </div>
            </div>
          </div>

          {/* Business Details Table */}
          {loading ? (
            <SkeletonTable rows={8} cols={9} />
          ) : filteredPolicies.length === 0 ? (
            <EmptyState
              icon={<IDoc size={28} />}
              title="No business contracts found"
              message="No policies matched the selected filter criteria."
            />
          ) : (
            <div className="card overflow-hidden bg-navy-3 border border-navy-4">
              <div className="table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Customer ID</th>
                      <th>Customer Name</th>
                      <th>Policy / Account #</th>
                      <th>Plan Type</th>
                      <th>Plan Code</th>
                      <th className="text-right">Business Amount</th>
                      <th>Agent ID</th>
                      <th>Agent Name</th>
                      <th>Business Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPolicies.map((p, idx) => {
                      const b = calculatePolicyBusiness(p)
                      return (
                        <tr key={p.id || idx} className="hover:bg-navy-2/60 transition-colors">
                          <td className="font-mono text-[11px] text-ink-2">
                            {p.customerId || p.customer_id || p.customerAccount || '—'}
                          </td>
                          <td className="font-semibold text-ink-1">
                            {p.customerName || p.customers?.name || '—'}
                          </td>
                          <td className="font-mono font-semibold text-gold-1">
                            {p.policyNumber || p.policy_number || '—'}
                          </td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                b.isRD
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              }`}
                            >
                              {b.isRD ? 'RD' : 'FD'}
                            </span>
                          </td>
                          <td className="font-mono text-ink-2">
                            {p.planCode || p.plan_code || '—'}
                          </td>
                          <td className="text-right font-mono font-bold text-ink-1">
                            {formatINR(b.businessAmount)}
                          </td>
                          <td className="font-mono text-[11px] text-ink-2">
                            {p.agentId ? `${p.agentId.slice(0, 8)}...` : '—'}
                          </td>
                          <td className="text-ink-1">
                            {p.agentName || p.profiles?.name || '—'}
                          </td>
                          <td className="text-ink-2 text-[11px]">
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

              {/* Pagination */}
              {totalBizPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-navy-4 text-xs">
                  <span className="text-ink-2">
                    Page <strong>{bizPage}</strong> of <strong>{totalBizPages}</strong>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={bizPage <= 1}
                      onClick={() => setBizPage(p => Math.max(1, p - 1))}
                      className="btn-dark py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalBizPages }, (_, i) => i + 1).slice(
                      Math.max(0, bizPage - 3),
                      Math.min(totalBizPages, bizPage + 2)
                    ).map(p => (
                      <button
                        key={p}
                        onClick={() => setBizPage(p)}
                        className={`py-1 px-2.5 rounded text-xs font-bold transition-all ${
                          p === bizPage
                            ? 'bg-gold text-navy-1'
                            : 'bg-navy-2 text-ink-2 hover:text-ink-1'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      disabled={bizPage >= totalBizPages}
                      onClick={() => setBizPage(p => Math.min(totalBizPages, p + 1))}
                      className="btn-dark py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── DRILLDOWN MODAL FOR DOWNLINE AGENT ────────────────────────────── */}
      {drilldownModalOpen && selectedAgentDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 bg-navy-3 border border-gold-1/40 space-y-5 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-navy-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-serif text-xl font-bold text-ink-1">
                    {selectedAgentDetails.agent.name}
                  </h3>
                  <RankBadge rank={selectedAgentDetails.agent.rank || 1} size="sm" showName />
                  <StatusBadge status={selectedAgentDetails.agent.status || 'active'} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2 font-mono">
                  <span>Code: <strong className="text-gold-1">{selectedAgentDetails.agent.sponsorCode || '—'}</strong></span>
                  <span>•</span>
                  <span>ID: {selectedAgentDetails.agent.id}</span>
                  <span>•</span>
                  <span>Joined: {fmtDate(selectedAgentDetails.agent.createdAt)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownModalOpen(false)}
                className="text-ink-2 hover:text-ink-1 p-1 rounded hover:bg-navy-4 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Performance Metric Cards */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan mb-3">
                Agent Performance Metrics
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">Personal Business</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {formatINR(selectedAgentDetails.metrics?.personalBusiness || 0)}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">Direct Downline Business</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {formatINR(selectedAgentDetails.metrics?.directDownlineBusiness || 0)}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-gold-1/30 space-y-1">
                  <span className="text-[10px] text-gold uppercase font-semibold">Total Network Business</span>
                  <p className="text-base font-bold font-serif text-gold-1">
                    {formatINR(selectedAgentDetails.metrics?.totalNetworkBusiness || 0)}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">Total Policies</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {selectedAgentDetails.metrics?.totalPolicies || 0}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">RD Business</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {formatINR(selectedAgentDetails.metrics?.networkRDBusiness || 0)}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">FD Business</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {formatINR(selectedAgentDetails.metrics?.networkFDBusiness || 0)}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">Network Customers</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {selectedAgentDetails.metrics?.totalCustomers || 0}
                  </p>
                </div>
                <div className="p-3 rounded bg-navy-2 border border-navy-4 space-y-1">
                  <span className="text-[10px] text-ink-2 uppercase font-semibold">Direct Team Size</span>
                  <p className="text-base font-bold font-serif text-ink-1">
                    {selectedAgentDetails.directChildren.length} agents
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Downline Members */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                Direct Downline of {selectedAgentDetails.agent.name} ({selectedAgentDetails.directChildren.length})
              </h4>
              {selectedAgentDetails.directChildren.length > 0 ? (
                <div className="card overflow-hidden bg-navy-2 border border-navy-4">
                  <div className="table-wrap max-h-48 overflow-y-auto">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>Agent Name</th>
                          <th>Agent Code</th>
                          <th>Rank</th>
                          <th>Status</th>
                          <th className="text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAgentDetails.directChildren.map(child => (
                          <tr key={child.id} className="hover:bg-navy-3/60">
                            <td className="font-semibold text-ink-1">{child.name}</td>
                            <td className="font-mono text-ink-2">{child.sponsorCode || '—'}</td>
                            <td><RankBadge rank={child.rank || 1} size="sm" showName /></td>
                            <td><StatusBadge status={child.status || 'active'} /></td>
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() => openDrilldown(child.id)}
                                className="text-[10px] text-gold hover:underline font-bold"
                              >
                                Drill down &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic p-3 bg-navy-2 rounded border border-navy-4 text-center">
                  This agent has no direct downline recruits yet.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 pt-3 border-t border-navy-4">
              <button
                type="button"
                onClick={() => setDrilldownModalOpen(false)}
                className="btn-dark py-1.5 px-4 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recruit Modal ────────────────────────────────────────────────── */}
      {showRecruit && (
        <MemberModal
          modal={{ mode: 'new' }}
          branches={branches || []}
          members={allProfiles || []}
          onClose={() => setShowRecruit(false)}
        />
      )}
    </div>
  )
}
