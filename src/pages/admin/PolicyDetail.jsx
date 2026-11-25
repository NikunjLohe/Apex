import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  supabase,
  policiesAPI,
  profilesAPI,
  masterDataAPI,
  commissionsAPI
} from '../../lib/supabase'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IDoc, IUsers, ICash, ISettings, IAlert, ISearch } from '../../components/ui/icons'
import { addYears } from 'date-fns'
import { isPension, getPensionPolicyYear, planYears, getActivePolicyYear, getPolicyTermYears } from '../../data/compensation'
import { useRanks } from '../../contexts/RanksContext'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission } from '../../hooks/usePermission'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

export default function PolicyDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const { can, CAP, isSuperAdmin } = usePermission()
  const canEdit = isSuperAdmin || can(CAP.ADMIN)

  const [loading, setLoading] = useState(true)
  const [p, setP] = useState(null)
  const [usersList, setUsersList] = useState([])
  const [branchesList, setBranchesList] = useState([])
  const [ledgerData, setLedgerData] = useState([])
  const [selectedLedgerInst, setSelectedLedgerInst] = useState('all')
  const [commViewMode, setCommViewMode] = useState('recipients') // 'recipients' | 'all_ranks'
  const [commSearch, setCommSearch] = useState('')
  const [commRankFilter, setCommRankFilter] = useState('all')
  const [commStatusFilter, setCommStatusFilter] = useState('all')
  const [commSort, setCommSort] = useState('rank_asc')

  const { ranksList, getRank } = useRanks()
  const [explainOpen, setExplainOpen] = useState(false)

  // Edit / Correction State
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    policyNumber: '',
    planCode: '',
    monthlyAmount: 0,
    totalAmount: 0,
    startDate: '',
    agentCode: ''
  })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Load Policy and related data from Supabase
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!id) return
      setLoading(true)

      try {
        const [policyObj, uList, bList] = await Promise.all([
          policiesAPI.getPolicy(id).catch(() => null),
          profilesAPI.listProfiles().catch(() => []),
          masterDataAPI.listBranches().catch(() => []),
        ])

        if (cancelled) return

        if (!policyObj) {
          setP(null)
          setLoading(false)
          return
        }

        setP(policyObj)
        setUsersList(uList || [])
        setBranchesList(bList || [])

        // Fetch commissions from ledger
        const comms = await commissionsAPI.listCommissionLedger({ policyId: policyObj.id }).catch(() => [])
        if (!cancelled) {
          setLedgerData(comms || [])
          setLoading(false)
        }
      } catch (err) {
        console.error('[PolicyDetail] Load error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [id])

  // Agent profile from usersList or joined profile
  const agent = useMemo(() => {
    if (!p) return null
    if (p.agentId) {
      const found = usersList.find(u => u.id === p.agentId)
      if (found) return found
    }
    if (p.profiles) return p.profiles
    return null
  }, [p, usersList])

  // Check commission and payout safety
  const hasPaidCommission = useMemo(() => {
    return Boolean(ledgerData && ledgerData.some(c => c.status === 'paid'))
  }, [ledgerData])

  const hasUnpaidCommissions = useMemo(() => {
    return Boolean(ledgerData && ledgerData.some(c => c.status === 'unpaid' || c.status === 'generated' || c.status === 'allocated'))
  }, [ledgerData])

  // Pre-fill edit form when modal opens
  useEffect(() => {
    if (p) {
      let startStr = ''
      if (p.startDate) {
        const d = new Date(p.startDate)
        startStr = !isNaN(d) ? d.toISOString().split('T')[0] : String(p.startDate).split('T')[0]
      }
      setEditForm({
        policyNumber: p.policyNumber || '',
        planCode: p.type || p.planCode || '',
        monthlyAmount: p.monthlyAmount || p.installmentAmount || 0,
        totalAmount: p.fdAmount || 0,
        startDate: startStr,
        agentCode: agent?.sponsorCode || p.sponsorCode || ''
      })
      setReason('')
    }
  }, [p, agent, editOpen])

  // Calculate live diff preview
  const diffs = useMemo(() => {
    if (!p) return []
    const list = []
    const newPolNum = editForm.policyNumber.trim()
    const newPlanCode = editForm.planCode.trim().toUpperCase()
    const newMonthly = Number(editForm.monthlyAmount) || 0
    const newTotal = Number(editForm.totalAmount) || 0
    const newStartDate = editForm.startDate.trim()
    const newAgentCode = editForm.agentCode.trim().toUpperCase()

    if (newPolNum && newPolNum !== (p.policyNumber || '')) {
      list.push({ field: 'Policy Number', oldVal: p.policyNumber || '—', newVal: newPolNum })
    }
    if (newPlanCode && newPlanCode !== ((p.type || p.planCode || '').toUpperCase())) {
      list.push({ field: 'Plan Code', oldVal: p.type || p.planCode || '—', newVal: newPlanCode })
    }
    if (newMonthly !== (p.monthlyAmount || 0)) {
      list.push({ field: 'Monthly Amount', oldVal: `${formatINR(p.monthlyAmount || 0)}`, newVal: `${formatINR(newMonthly)}` })
    }
    if (newTotal !== (p.fdAmount || 0)) {
      list.push({ field: 'Total Amount', oldVal: `${formatINR(p.fdAmount || 0)}`, newVal: `${formatINR(newTotal)}` })
    }
    if (newStartDate && newStartDate !== (p.startDate ? String(p.startDate).split('T')[0] : '')) {
      list.push({ field: 'Start Date', oldVal: p.startDate ? fmtDate(p.startDate) : '—', newVal: newStartDate })
    }
    if (newAgentCode && newAgentCode !== (agent?.sponsorCode || '').toUpperCase()) {
      list.push({ field: 'Agent Code', oldVal: agent?.sponsorCode || '—', newVal: newAgentCode })
    }
    return list
  }, [p, agent, editForm])

  // Save Policy Correction Handler
  const handleSaveCorrection = async () => {
    if (!reason.trim()) {
      toast.error('Reason for correction is mandatory.')
      return
    }

    if (diffs.length === 0) {
      toast.error('No values were changed.')
      return
    }

    // Check financial edit safety on PAID transactions
    const financialChanged = diffs.some(d => ['Policy Number', 'Plan Code', 'Monthly Amount', 'Total Amount', 'Agent Code'].includes(d.field))
    if (hasPaidCommission && financialChanged) {
      toast.error('This transaction has already been paid and cannot be directly modified. Please use the appropriate financial correction process.')
      return
    }

    setSaving(true)
    const loader = toast.loading('Saving policy correction...')

    try {
      const newPolNum = editForm.policyNumber.trim()
      const newPlanCode = editForm.planCode.trim().toUpperCase()
      const newMonthly = Number(editForm.monthlyAmount) || 0
      const newTotal = Number(editForm.totalAmount) || 0
      const newStartDate = editForm.startDate.trim()
      const newAgentCode = editForm.agentCode.trim().toUpperCase()

      // 1. Duplicate Policy Check
      if (newPolNum !== p.policyNumber) {
        const { data: dupCheck } = await supabase
          .from('policies')
          .select('id')
          .eq('policy_number', newPolNum)
          .maybeSingle()

        if (dupCheck && dupCheck.id !== p.id) {
          toast.error(`Policy Number "${newPolNum}" already belongs to another policy.`, { id: loader })
          setSaving(false)
          return
        }
      }

      // 2. Resolve Agent Code if changed
      let newAgentDoc = agent
      if (newAgentCode && newAgentCode !== (agent?.sponsorCode || '').toUpperCase()) {
        const { data: uFound } = await supabase
          .from('profiles')
          .select('*')
          .ilike('sponsor_code', newAgentCode)
          .maybeSingle()

        if (!uFound) {
          toast.error(`Agent with Sponsor Code "${newAgentCode}" not found.`, { id: loader })
          setSaving(false)
          return
        }
        newAgentDoc = uFound
      }

      // Construct Update payload for policy
      const planUpdate = {
        policy_number: newPolNum,
        plan_code: newPlanCode,
        monthly_amount: newMonthly,
        fd_amount: newTotal,
        updated_at: new Date().toISOString()
      }

      if (newStartDate) {
        planUpdate.start_date = newStartDate
      }

      if (newAgentDoc) {
        planUpdate.agent_id = newAgentDoc.id
      }

      // Update policy in Supabase
      const { error: updErr } = await supabase
        .from('policies')
        .update(planUpdate)
        .eq('id', p.id)

      if (updErr) throw updErr

      // 3. Update unpaid linked commission ledger entries to keep records consistent
      if (newPolNum !== p.policyNumber || newPlanCode !== p.planCode) {
        await supabase
          .from('commission_ledger')
          .update({
            plan_code: newPlanCode
          })
          .eq('policy_id', p.id)
          .eq('status', 'allocated')
          .catch(() => { })
      }

      // 4. Record Audit Log
      await supabase
        .from('audit_logs')
        .insert({
          type: 'Policy Correction',
          user_id: user?.id || null,
          details: {
            policyId: p.id,
            oldPolicyNumber: p.policyNumber,
            newPolicyNumber: newPolNum,
            reason: reason.trim(),
            changes: diffs,
            adminName: profile?.name || user?.email || 'Admin'
          }
        })
        .catch(auditErr => console.warn('[PolicyDetail] Audit log notice:', auditErr))

      // Refresh local state
      setP(prev => ({
        ...prev,
        policyNumber: newPolNum,
        planCode: newPlanCode,
        type: newPlanCode,
        monthlyAmount: newMonthly,
        fdAmount: newTotal,
        startDate: newStartDate || prev.startDate,
        agentId: newAgentDoc ? newAgentDoc.id : prev.agentId,
        agentName: newAgentDoc ? newAgentDoc.name : prev.agentName
      }))

      toast.success('Policy record corrected successfully!', { id: loader })
      setEditOpen(false)
    } catch (err) {
      console.error('Error saving policy correction:', err)
      toast.error(`Correction failed: ${err.message}`, { id: loader })
    } finally {
      setSaving(false)
    }
  }

  // Calculate maturity date
  const maturityDate = useMemo(() => {
    if (p?.maturityDate) return p.maturityDate
    if (!p?.startDate || !p?.duration) return null
    const start = new Date(p.startDate)
    return !isNaN(start) ? addYears(start, p.duration || 1) : null
  }, [p?.startDate, p?.duration, p?.maturityDate])

  // Get branch name
  const branchName = useMemo(() => {
    if (!p?.branchId || !branchesList.length) return '—'
    return branchesList.find(b => b.id === p.branchId)?.name || '—'
  }, [p?.branchId, branchesList])

  // Calculate total business value of this policy
  const businessValue = useMemo(() => {
    if (!p) return 0
    if (p.monthlyAmount > 0) {
      return p.monthlyAmount * 12 * (p.duration || 1)
    }
    return p.fdAmount || 0
  }, [p])

  const usersMap = useMemo(() => {
    const idMap = {}
    usersList.forEach(u => {
      idMap[u.id] = u
    })
    return idMap
  }, [usersList])

  const traversedChain = useMemo(() => {
    if (!agent || !usersMap) return []
    const chain = []
    let cur = agent
    const visited = new Set()
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id)
      chain.push(cur)
      const sponsorRef = cur.sponsorId || cur.sponsor_id || cur.referredBy
      if (sponsorRef && usersMap[sponsorRef]) {
        cur = usersMap[sponsorRef]
      } else {
        break
      }
    }
    return chain
  }, [agent, usersMap])

  // Only active (non-reversed) real ledger entries are included in commission breakdown
  const activeLedgerData = useMemo(() => {
    return (ledgerData || []).filter((c) => String(c.status || 'unpaid').toLowerCase() !== 'reversed')
  }, [ledgerData])

  const availableInstallments = useMemo(() => {
    const instSet = new Set(
      activeLedgerData
        .map((c) => Number(c.installmentNumber || c.installment || 1))
        .filter((n) => !isNaN(n) && n > 0)
    )
    return Array.from(instSet).sort((a, b) => a - b)
  }, [activeLedgerData])

  const activeLedgerInst = useMemo(() => {
    if (selectedLedgerInst === 'all') return 'all'
    if (selectedLedgerInst !== 'latest') return Number(selectedLedgerInst) || 1
    if (availableInstallments.length > 0) return availableInstallments[availableInstallments.length - 1]
    return Math.max(1, Number(p?.paidInstallments) || 1)
  }, [selectedLedgerInst, availableInstallments, p?.paidInstallments])

  const activeBreakdownYear = useMemo(() => {
    if (!p) return 1
    if (activeLedgerInst === 'all') {
      return getActivePolicyYear(p, availableInstallments[availableInstallments.length - 1] || Math.max(1, Number(p?.paidInstallments) || 1))
    }
    return getActivePolicyYear(p, activeLedgerInst)
  }, [p, activeLedgerInst, availableInstallments])

  const scopedLedgerData = useMemo(() => {
    if (!activeLedgerData || activeLedgerData.length === 0) return []
    if (activeLedgerInst === 'all') return activeLedgerData
    const exact = activeLedgerData.filter((c) => Number(c.installmentNumber || c.installment || 1) === activeLedgerInst)
    return exact
  }, [activeLedgerData, activeLedgerInst])

  // Real per-agent commission recipient rows (aggregated per agent + rank when viewing 'all' installments, exact rows per installment otherwise)
  const recipientRows = useMemo(() => {
    if (!scopedLedgerData.length) return []

    const sellerRankNum = Number(agent?.rank || 0)
    const groups = new Map()

    scopedLedgerData.forEach((entry) => {
      const agObj = usersMap[entry.agentId] || null
      const rankNum = Number(entry.receivingRank || agObj?.rank || 0)
      const rankInfo = getRank(rankNum)
      const rankCode = entry.receivingRankCode || rankInfo?.code || agObj?.rankCode || `R${rankNum || '?'}`
      const rankName = rankInfo?.name || ''
      const agentId = entry.agentId || agObj?.id || null
      const agentName = entry.agentName || agObj?.name || 'Unknown Agent'
      const agentCode = entry.sponsorCode || entry.agentCode || agObj?.sponsorCode || '—'
      const isDirect =
        String(entry.commissionType || '').toLowerCase() === 'direct' ||
        String(entry.commissionType || '').toLowerCase() === 'direct_own' ||
        (agentId && agent?.id && agentId === agent.id && (!entry.commissionType || String(entry.commissionType).toLowerCase().includes('direct')))
      const roleLabel = isDirect ? 'Direct' : 'Upline Commission'
      const rawStatus = String(entry.status || 'unpaid').toLowerCase()
      const instNo = Number(entry.installmentNumber || entry.installment || 1)
      const polYear = Number(entry.policyYear || 1)
      const pct = Number(entry.percentage) || 0
      const amt = Number(entry.amount) || 0
      const compressedList = Array.isArray(entry.compressedFromRanks) ? entry.compressedFromRanks : []

      const key =
        activeLedgerInst === 'all'
          ? `${agentId || agentCode}__R${rankNum}__${isDirect ? 'D' : 'U'}`
          : `${entry.id || `${agentId}_${rankNum}_${instNo}`}`

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          docId: entry.id,
          agentId,
          agentName,
          agentCode,
          rank: rankNum,
          rankCode,
          rankName,
          isDirect,
          type: roleLabel,
          uplineLevel: sellerRankNum > 0 && rankNum > sellerRankNum ? rankNum - sellerRankNum : 0,
          pctSum: pct,
          pctList: [pct],
          amount: amt,
          businessAmount: Number(entry.businessAmount) || 0,
          installments: new Set([instNo]),
          years: new Set([polYear]),
          statuses: new Set([rawStatus]),
          compressedFromRanks: new Set(compressedList),
          policyNumber: p?.policyNumber || '—',
          latestDate: entry.calculationDate || entry.createdAt || null,
        })
      } else {
        const g = groups.get(key)
        g.pctSum += pct
        g.pctList.push(pct)
        g.amount += amt
        g.businessAmount += Number(entry.businessAmount) || 0
        g.installments.add(instNo)
        g.years.add(polYear)
        g.statuses.add(rawStatus)
        compressedList.forEach((cr) => g.compressedFromRanks.add(cr))
      }
    })

    const rows = Array.from(groups.values()).map((g) => {
      const instArr = Array.from(g.installments).sort((a, b) => a - b)
      const statusArr = Array.from(g.statuses)
      const uniquePcts = Array.from(new Set(g.pctList.map((v) => Number(v.toFixed(4)))))
      const status = statusArr.length === 1 ? statusArr[0] : (statusArr.includes('paid') && statusArr.includes('unpaid') ? 'partial' : statusArr[0])
      const avgPct = g.pctList.length > 0 ? g.pctSum / g.pctList.length : 0

      return {
        ...g,
        percentage: uniquePcts.length === 1 ? uniquePcts[0] : avgPct,
        pctLabel: uniquePcts.length === 1 ? `${uniquePcts[0].toFixed(2)}%` : `${Math.min(...uniquePcts).toFixed(2)}%–${Math.max(...uniquePcts).toFixed(2)}%`,
        amount: Number(g.amount.toFixed(2)),
        installmentsList: instArr,
        status,
        compressedRanksList: Array.from(g.compressedFromRanks).filter(Boolean),
        skipped: false,
      }
    })

    return rows.sort((a, b) => Number(a.rank) - Number(b.rank) || a.agentName.localeCompare(b.agentName))
  }, [scopedLedgerData, usersMap, getRank, agent, activeLedgerInst, p?.policyNumber])

  // Filtered & sorted recipient rows for user controls
  const filteredRecipientRows = useMemo(() => {
    const q = commSearch.trim().toLowerCase()
    const filtered = recipientRows.filter((r) => {
      if (commRankFilter !== 'all' && String(r.rank) !== String(commRankFilter)) return false
      if (commStatusFilter !== 'all' && r.status !== commStatusFilter) return false
      if (q) {
        return (
          r.agentName.toLowerCase().includes(q) ||
          r.agentCode.toLowerCase().includes(q) ||
          r.rankCode.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q)
        )
      }
      return true
    })

    const sorted = [...filtered]
    if (commSort === 'amount_desc') {
      sorted.sort((a, b) => b.amount - a.amount || a.rank - b.rank)
    } else if (commSort === 'amount_asc') {
      sorted.sort((a, b) => a.amount - b.amount || a.rank - b.rank)
    } else if (commSort === 'pct_desc') {
      sorted.sort((a, b) => b.percentage - a.percentage || b.amount - a.amount)
    } else {
      sorted.sort((a, b) => a.rank - b.rank || b.amount - a.amount)
    }

    let runPct = 0
    return sorted.map((r) => {
      runPct += Number(r.percentage) || 0
      return { ...r, runningTotalPct: runPct }
    })
  }, [recipientRows, commSearch, commRankFilter, commStatusFilter, commSort])

  // Strict 18-rank audit matrix (NO fabricated fallback rates)
  const matrixRows = useMemo(() => {
    if (!ranksList || ranksList.length === 0) return []
    const sortedRanks = [...ranksList].sort((a, b) => Number(a.rank) - Number(b.rank))
    let runningTotalPct = 0
    const rows = []

    sortedRanks.forEach((r) => {
      const rankNum = Number(r.rank)
      const matchingRecipients = recipientRows.filter((rec) => Number(rec.rank) === rankNum)

      if (matchingRecipients.length > 0) {
        matchingRecipients.forEach((rec, idx) => {
          runningTotalPct += Number(rec.percentage) || 0
          rows.push({
            ...rec,
            key: `${rankNum}_${rec.key}_${idx}`,
            rank: rankNum,
            rankCode: r.code,
            rankName: r.name,
            runningTotalPct,
            skipped: false,
            skipReason: '',
          })
        })
      } else {
        const agentInChain = traversedChain.find((a) => Number(a.rank) === rankNum)
        let skipReason = 'No Ledger Entry'
        if (agent && rankNum < Number(agent.rank)) {
          skipReason = 'Skipped (Below Seller)'
        } else if (!agentInChain) {
          skipReason = 'Skipped (No Agent at Rank)'
        }
        rows.push({
          key: `tier_${rankNum}`,
          rank: rankNum,
          rankCode: r.code,
          rankName: r.name,
          agentId: agentInChain?.id || null,
          agentName: agentInChain ? `${agentInChain.name}` : '—',
          agentCode: agentInChain?.sponsorCode || '—',
          type: agentInChain ? 'Unpaid / Compressed' : '—',
          percentage: 0,
          pctLabel: '0.00%',
          amount: 0,
          runningTotalPct,
          status: 'none',
          installmentsList: [],
          compressedRanksList: [],
          skipped: true,
          skipReason,
        })
      }
    })

    return rows
  }, [ranksList, recipientRows, traversedChain, agent])

  // Available rank options present in this policy's recipients
  const availableRecipientRanks = useMemo(() => {
    const map = new Map()
    recipientRows.forEach((r) => {
      if (!map.has(r.rank)) map.set(r.rank, `${r.rankCode}${r.rankName ? ` — ${r.rankName}` : ''}`)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [recipientRows])

  // Summary card metrics (strictly reconciled with real recipientRows)
  const paidRanks = recipientRows
  const totalDistributed = useMemo(() => recipientRows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0), [recipientRows])
  const totalPaid = useMemo(() => recipientRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [recipientRows])
  const directCommissionTotal = useMemo(() => recipientRows.filter((r) => r.isDirect).reduce((sum, r) => sum + r.amount, 0), [recipientRows])
  const uplineCommissionTotal = useMemo(() => recipientRows.filter((r) => !r.isDirect).reduce((sum, r) => sum + r.amount, 0), [recipientRows])
  const uniqueAgentsCount = useMemo(() => new Set(recipientRows.map((r) => r.agentId || r.agentCode)).size, [recipientRows])
  const highestRankObj = useMemo(() => recipientRows.length > 0 ? recipientRows[recipientRows.length - 1] : null, [recipientRows])
  const lowestRankObj = useMemo(() => recipientRows.length > 0 ? recipientRows[0] : null, [recipientRows])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={2} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!p) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Policy Certificate Not Found</h2>
        <p className="text-sm text-ink-2">This policy record does not exist in the system.</p>
        <Link to="/admin/policies" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Policies</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Info */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IDoc size={26} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-ink-1 tracking-tight truncate">Policy #{p.policyNumber || '—'}</h1>
                <StatusBadge status={p.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">Product: {p.type || p.planCode || '—'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 items-center">
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-dark py-2 px-3.5 text-xs font-bold uppercase tracking-wider border border-gold/40 text-gold hover:border-gold flex items-center gap-1.5"
              >
                <ISettings size={14} /> Correct Credentials
              </button>
            )}
            <Link to="/admin/policies" className="btn-ghost py-2 px-3.5 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Columns - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Policy Information */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Policy Credentials & Deposit Stats
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Product</span>
                  <span className="font-semibold text-ink-1 uppercase">
                    {isPension(p.type, p.planType)
                      ? (getPensionPolicyYear(p.type, p.policyYear || p.duration) ? `Pension ${getPensionPolicyYear(p.type, p.policyYear || p.duration)} Years (${p.type})` : 'Pension')
                      : (p.type || p.planCode || '—')}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Term (Duration)</span>
                  <span className="font-semibold text-ink-1">
                    {isPension(p.type, p.planType)
                      ? (getPensionPolicyYear(p.type, p.policyYear || p.duration) ? `${getPensionPolicyYear(p.type, p.policyYear || p.duration)} Years` : 'Not Specified')
                      : (planYears(p.type) || p.duration ? `${planYears(p.type) || p.duration} ${(planYears(p.type) || p.duration) === 1 ? 'Year' : 'Years'}` : '1 Year')}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Active Policy Year</span>
                  <span className="font-semibold text-ink-1 font-mono">
                    {isPension(p.type, p.planType)
                      ? (getPensionPolicyYear(p.type, p.policyYear || p.duration) ? `Year ${getPensionPolicyYear(p.type, p.policyYear || p.duration)}` : 'Not Specified')
                      : `Year ${getActivePolicyYear(p, Math.max(1, Number(p.paidInstallments) || 1))} of ${getPolicyTermYears(p)}`}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Deposit Value</span>
                  {p.monthlyAmount > 0 ? (
                    <span className="font-semibold text-ink-1">{formatINR(p.monthlyAmount)} /month (RD)</span>
                  ) : (
                    <span className="font-semibold text-ink-1">{formatINR(p.fdAmount)} (Lump Sum)</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Total Paid Installments</span>
                  <span className="font-semibold text-ink-1 font-mono">{p.paidInstallments || 1} of {p.totalInstallments || 12}</span>
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Policy Start Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Expected Maturity Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{maturityDate ? fmtDate(maturityDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Next Due Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{p.nextDueDate ? fmtDate(p.nextDueDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Total Matured Value</span>
                  <span className="font-semibold text-gold-1 text-sm">{formatINR(businessValue)}</span>
                </div>
              </div>
            </div>

            {/* Business value summary banner */}
            <div className="bg-navy-2/30 border border-navy-4 rounded p-4 flex flex-wrap justify-between items-center gap-3 text-xs mt-2">
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Cumulative Business Value</span>
                <span className="text-xl font-bold font-serif text-ink-1 mt-0.5 block">{formatINR(businessValue)}</span>
              </div>
              <ICash size={24} className="text-gold-1/60" />
            </div>
          </div>

          {/* Commission Allocation Breakdown */}
          <div id="commission-breakdown" className="card p-4 sm:p-5 space-y-5">
            <div className="border-b border-navy-4/50 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ISettings size={16} className="shrink-0" /> Commission Allocation Breakdown
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">
                  {activeLedgerInst === 'all'
                    ? `Showing all active commission distributions (${availableInstallments.length || 1} installment${availableInstallments.length === 1 ? '' : 's'}) from live ledger records.`
                    : `Showing Policy Year ${activeBreakdownYear} (Installment #${activeLedgerInst}) live ledger commission allocations.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {availableInstallments.length > 0 && (
                  <select
                    className="field text-xs w-full sm:w-52 py-1.5"
                    value={selectedLedgerInst}
                    onChange={(e) => setSelectedLedgerInst(e.target.value)}
                    aria-label="Filter installment"
                  >
                    <option value="all">All Installments ({availableInstallments.length})</option>
                    <option value="latest">Latest (Inst #{availableInstallments[availableInstallments.length - 1]})</option>
                    {availableInstallments.map((instNo) => (
                      <option key={instNo} value={instNo}>
                        Inst #{instNo} (Year {getActivePolicyYear(p, instNo)})
                      </option>
                    ))}
                  </select>
                )}
                <div className="inline-flex rounded-card border border-navy-4 bg-navy-2 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setCommViewMode('recipients')}
                    className={`px-2.5 py-1 rounded transition-colors ${commViewMode === 'recipients' ? 'bg-gold-1 text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
                  >
                    Recipients ({recipientRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommViewMode('all_ranks')}
                    className={`px-2.5 py-1 rounded transition-colors ${commViewMode === 'all_ranks' ? 'bg-gold-1 text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
                  >
                    All 18 Ranks
                  </button>
                </div>
              </div>
            </div>

            {/* Summary KPI Strip (Strictly Reconciled with Commission Ledger) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-navy-2/25 border border-navy-4 rounded-card p-3.5 sm:p-4">
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Business Amount</span>
                <span className="text-base sm:text-lg font-bold font-serif text-ink-1 mt-0.5 block">{formatINR(businessValue)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Commission Paid</span>
                <span className="text-base sm:text-lg font-bold font-serif text-gold mt-0.5 block">{formatINR(totalPaid)}</span>
                <span className="text-[10px] font-mono text-ink-2">
                  {activeLedgerInst === 'all' && availableInstallments.length > 1
                    ? `${availableInstallments.length} inst. combined`
                    : `${Number(totalDistributed).toFixed(2)}% rate sum`}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Eligible Agents Paid</span>
                <span className="text-base sm:text-lg font-bold font-serif text-ink-1 mt-0.5 block">{uniqueAgentsCount}</span>
                <span className="text-[10px] text-ink-2">{paidRanks.length} ledger share{paidRanks.length === 1 ? '' : 's'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Direct vs Upline</span>
                <span className="text-xs font-bold text-gold-1 block mt-1">Direct: {formatINR(directCommissionTotal)}</span>
                <span className="text-xs font-semibold text-emerald-400 block">Upline: {formatINR(uplineCommissionTotal)}</span>
              </div>
            </div>

            {/* Search, Filter & Sort Controls (Recipients View) */}
            {commViewMode === 'recipients' && recipientRows.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="relative">
                  <ISearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
                  <input
                    type="text"
                    value={commSearch}
                    onChange={(e) => setCommSearch(e.target.value)}
                    placeholder="Search agent name or code..."
                    className="field pl-8 py-1.5 text-xs"
                  />
                </div>
                <select
                  value={commRankFilter}
                  onChange={(e) => setCommRankFilter(e.target.value)}
                  className="field py-1.5 text-xs"
                  aria-label="Filter by rank"
                >
                  <option value="all">All Ranks ({availableRecipientRanks.length})</option>
                  {availableRecipientRanks.map(([rNum, label]) => (
                    <option key={rNum} value={rNum}>Rank {rNum} ({label})</option>
                  ))}
                </select>
                <select
                  value={commStatusFilter}
                  onChange={(e) => setCommStatusFilter(e.target.value)}
                  className="field py-1.5 text-xs"
                  aria-label="Filter by commission status"
                >
                  <option value="all">All Commission Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="allocated">Allocated</option>
                  <option value="approved">Approved</option>
                  <option value="partial">Partial (Mixed)</option>
                </select>
                <select
                  value={commSort}
                  onChange={(e) => setCommSort(e.target.value)}
                  className="field py-1.5 text-xs"
                  aria-label="Sort commission recipients"
                >
                  <option value="rank_asc">Sort: Rank Level (Lowest → Highest)</option>
                  <option value="amount_desc">Sort: Commission (Highest → Lowest)</option>
                  <option value="amount_asc">Sort: Commission (Lowest → Highest)</option>
                  <option value="pct_desc">Sort: Rate % (Highest → Lowest)</option>
                </select>
              </div>
            )}

            {/* Empty State when no ledger rows exist */}
            {commViewMode === 'recipients' && filteredRecipientRows.length === 0 ? (
              <div className="p-6 text-center rounded-card border border-dashed border-navy-4 bg-navy-2/20 space-y-2">
                <p className="text-xs font-semibold text-ink-1">
                  {recipientRows.length === 0
                    ? 'No commission ledger entries have been generated for this policy yet.'
                    : 'No commission recipients match your active filters.'}
                </p>
                {recipientRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCommSearch('')
                      setCommRankFilter('all')
                      setCommStatusFilter('all')
                    }}
                    className="text-xs font-bold text-gold hover:underline"
                  >
                    Clear Commission Filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card Breakdown (320px–767px) */}
                <div className="space-y-2.5 md:hidden">
                  {(commViewMode === 'recipients' ? filteredRecipientRows : matrixRows).map((row) => (
                    <div
                      key={`mob-${row.key || row.rank}`}
                      className={`rounded-card border p-3.5 space-y-2 ${
                        row.skipped
                          ? 'border-navy-4/60 bg-navy-2/15 text-ink-2/75'
                          : 'border-navy-4 bg-navy-2/35 text-ink-1'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-navy-4/70 font-mono text-[10px] font-bold text-gold-tan">
                              R{row.rank} · {row.rankCode}
                            </span>
                            {row.skipped ? (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-navy-2 text-ink-2/80 border border-navy-4">
                                {row.skipReason}
                              </span>
                            ) : (
                              <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${row.isDirect ? 'bg-gold-1/10 text-gold-1 border border-gold-1/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                {row.type}{row.uplineLevel > 0 ? ` (Lvl +${row.uplineLevel})` : ''}
                              </span>
                            )}
                          </div>
                          {row.agentId ? (
                            <Link to={`/admin/members/${row.agentId}`} className="mt-1 block font-semibold text-sm text-ink-1 hover:text-gold truncate">
                              {row.agentName}
                            </Link>
                          ) : (
                            <p className="mt-1 font-semibold text-sm truncate">{row.agentName}</p>
                          )}
                          <p className="text-[11px] font-mono text-ink-2">{row.agentCode}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold text-base text-gold">
                            {row.amount > 0 ? formatINR(row.amount) : '₹0'}
                          </p>
                          <p className="font-mono text-[11px] text-ink-2">{row.pctLabel || `${Number(row.percentage).toFixed(2)}%`}</p>
                          {!row.skipped && row.status !== 'none' && (
                            <div className="mt-1 flex justify-end">
                              <StatusBadge status={row.status === 'partial' ? 'pending' : row.status} />
                            </div>
                          )}
                        </div>
                      </div>
                      {!row.skipped && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-navy-4/40 text-[10px] text-ink-2">
                          <span className="font-mono">
                            Policy: {p.policyNumber || '—'} · {row.installmentsList?.length > 1 ? `${row.installmentsList.length} Inst.` : `Inst #${row.installmentsList?.[0] || activeLedgerInst}`}
                          </span>
                          {row.compressedRanksList?.length > 0 && (
                            <span className="text-gold-tan font-semibold">
                              Compressed: {row.compressedRanksList.join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table Breakdown */}
                <div className="hidden md:block border border-navy-4 rounded-card table-wrap overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr className="bg-navy-2/40">
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Agent Name</th>
                        <th className="py-2.5 px-3">Agent Code</th>
                        <th className="py-2.5 px-3">Level / Role</th>
                        <th className="py-2.5 px-3">Policy Ref</th>
                        <th className="py-2.5 px-3 text-right">Rate %</th>
                        <th className="py-2.5 px-3 text-right">Commission Earned</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        {commViewMode === 'all_ranks' && (
                          <th className="py-2.5 px-3 text-right">Running Total %</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-4">
                      {(commViewMode === 'recipients' ? filteredRecipientRows : matrixRows).map((row) => (
                        <tr key={row.key || row.rank} className={`hover:bg-navy-2/30 transition-colors ${row.skipped ? 'text-ink-2/60 bg-navy-2/5' : 'text-ink-1 font-medium'}`}>
                          <td className="py-3 px-3 uppercase text-[10.5px] font-semibold text-gold-tan whitespace-nowrap">
                            R{row.rank} · {row.rankCode}
                            {row.rankName && <span className="block text-[9.5px] font-normal text-ink-2 capitalize">{row.rankName}</span>}
                          </td>
                          <td className="py-3 px-3">
                            {row.agentId && !row.skipped ? (
                              <Link to={`/admin/members/${row.agentId}`} className="font-semibold text-ink-1 hover:text-gold hover:underline">
                                {row.agentName}
                              </Link>
                            ) : (
                              <span>{row.agentName}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">{row.agentCode}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {row.skipped ? (
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-navy-2 text-ink-2/70 border border-navy-4">
                                {row.skipReason}
                              </span>
                            ) : (
                              <div>
                                <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${row.isDirect ? 'bg-gold-1/10 text-gold-1 border border-gold-1/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                  {row.type}{row.uplineLevel > 0 ? ` · Lvl +${row.uplineLevel}` : ''}
                                </span>
                                {row.compressedRanksList?.length > 0 && (
                                  <span className="block text-[9.5px] text-gold-tan mt-0.5">
                                    Includes compressed: {row.compressedRanksList.join(', ')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                            {row.skipped ? '—' : (
                              <>
                                <span className="block text-ink-1">{p.policyNumber || '—'}</span>
                                <span className="text-[9.5px]">
                                  {row.installmentsList?.length > 1
                                    ? `${row.installmentsList.length} inst. (#${row.installmentsList[0]}–#${row.installmentsList[row.installmentsList.length - 1]})`
                                    : `Inst #${row.installmentsList?.[0] || activeLedgerInst}`}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">{row.pctLabel || `${Number(row.percentage).toFixed(2)}%`}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-gold tabular-nums whitespace-nowrap">{row.amount > 0 ? formatINR(row.amount) : '₹0'}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {row.skipped ? (
                              <span className="text-[10px] text-ink-2/60">—</span>
                            ) : (
                              <StatusBadge status={row.status === 'partial' ? 'pending' : row.status} />
                            )}
                          </td>
                          {commViewMode === 'all_ranks' && (
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">{Number(row.runningTotalPct).toFixed(2)}%</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Reconciled Summary Footer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-navy-2/25 border border-navy-4 rounded-card p-4 sm:p-5">
              <div className="col-span-full border-b border-navy-4/50 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Commission Summary &amp; Reconciliation</h4>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Eligible Commission Entries</span>
                <span className="text-xl font-bold font-serif text-ink-1 block">{paidRanks.length} ({uniqueAgentsCount} Agent{uniqueAgentsCount === 1 ? '' : 's'})</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Rate Sum</span>
                <span className="text-xl font-bold font-serif text-gold block">{Number(totalDistributed).toFixed(2)}%</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Commission Distributed</span>
                <span className="text-xl font-bold font-serif text-ink-1 block">{formatINR(totalPaid)}</span>
              </div>
              <div className="space-y-1.5 border-t border-navy-4/50 pt-2 sm:border-0 sm:pt-0">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Highest Rank Paid</span>
                <span className="text-xs font-semibold text-ink-1 uppercase block">
                  {highestRankObj ? `${highestRankObj.rank} (${highestRankObj.rankCode})` : '—'}
                </span>
              </div>
              <div className="space-y-1.5 border-t border-navy-4/50 pt-2 sm:border-0 sm:pt-0">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Lowest Rank Paid</span>
                <span className="text-xs font-semibold text-ink-1 uppercase block">
                  {lowestRankObj ? `${lowestRankObj.rank} (${lowestRankObj.rankCode})` : '—'}
                </span>
              </div>
            </div>

            {/* Explanation Collapsible Panel */}
            <div className="border border-navy-4 rounded-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExplainOpen(!explainOpen)}
                className="w-full flex items-center justify-between gap-2 bg-navy-2/30 p-4 hover:bg-navy-2/50 transition-colors text-left"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-ink-1">How was this commission calculated?</span>
                <span className="text-xs text-gold-1 font-bold shrink-0">{explainOpen ? 'Hide' : 'Show Details'}</span>
              </button>
              {explainOpen && (
                <div className="p-4 bg-navy-3 border-t border-navy-4 space-y-3.5 text-xs text-ink-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Business Volume</span>
                      <span className="font-semibold text-ink-1 font-mono">{formatINR(businessValue)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Plan Product</span>
                      <span className="font-semibold text-ink-1 uppercase font-mono">{p.type || p.planCode}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Calculation Method</span>
                      <span className="font-semibold text-ink-1">Flat Per-Rank Ledger Allocation</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Highest Eligible Rate Paid</span>
                      <span className="font-semibold text-ink-1 font-mono">{highestRankObj ? `${Number(highestRankObj.percentage).toFixed(2)}%` : '—'}</span>
                    </div>
                    <div className="sm:col-span-2 border-t border-navy-4/50 pt-2.5">
                      <span className="block text-[10px] uppercase text-ink-2">Formula Explanation</span>
                      <p className="mt-1 leading-relaxed text-[11px]">
                        Every row above reflects verified entries recorded in the backend commission ledger for this policy. When downline ranks are skipped or compressed, those ranks earn ₹0 unless explicitly compressed into an eligible sponsor tier according to plan rules.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Columns - Customer & Agent click cards */}
        <div className="space-y-6">
          {/* Linked Customer Profile */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Customer (CIF Owner)
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gold-1/10 border border-gold-1/35 flex items-center justify-center font-bold text-gold-1">
                  {p.customerName ? p.customerName.charAt(0) : 'C'}
                </div>
                <div>
                  <Link to={`/admin/customers/${p.customerId}`} className="font-semibold text-ink-1 hover:underline">
                    {p.customerName}
                  </Link>
                  <div className="text-[10px] text-ink-2 font-mono">CIF: {p.customerAccount || '—'}</div>
                </div>
              </div>
              <div className="pt-2 text-center">
                <Link to={`/admin/customers/${p.customerId}`} className="text-xs text-gold hover:underline font-bold">
                  View Customer Folder &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Linked Agent Card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Submitting Agent
            </h3>
            {agent ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-navy-4 flex items-center justify-center font-bold text-gold-1">
                    {agent.name ? agent.name.charAt(0) : 'A'}
                  </div>
                  <div>
                    <Link to={`/admin/members/${agent.id}`} className="font-semibold text-ink-1 hover:underline">
                      {agent.name}
                    </Link>
                    <div className="text-[10px] text-ink-2 font-mono">{agent.sponsorCode}</div>
                  </div>
                </div>
                <div className="border-t border-navy-4/50 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Level Rank</span>
                    <span className="font-semibold text-ink-1 uppercase font-mono">{agent.rank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Phone</span>
                    <span className="font-mono text-ink-1">{agent.phone || '—'}</span>
                  </div>
                </div>
                <div className="pt-1 text-center">
                  <Link to={`/admin/members/${agent.id}`} className="text-xs text-gold hover:underline font-bold">
                    View Agent Dashboard &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-ink-1 font-semibold">{p.agentName || '—'}</p>
                <p className="text-xs text-ink-2 italic py-1">Missing detailed database mapping record.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Admin Controlled Policy Correction Modal */}
      <ConfirmDialog
        open={editOpen}
        title="Admin Record Correction — Policy Credentials"
        confirmLabel="Save Correction"
        cancelLabel="Cancel"
        loading={saving}
        confirmDisabled={diffs.length === 0 || !reason.trim() || (hasPaidCommission && diffs.some(d => ['Policy Number', 'Plan Code', 'Monthly Amount', 'Total Amount', 'Agent Code'].includes(d.field)))}
        onConfirm={handleSaveCorrection}
        onClose={() => !saving && setEditOpen(false)}
      >
        <div className="space-y-4 text-xs mt-3">
          {/* PAID Payout Lock Warning */}
          {hasPaidCommission && (
            <div className="p-3 bg-red-950/40 border border-red-500/50 rounded text-red-300 flex items-start gap-2">
              <IAlert size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-red-200">Paid Transaction Locked:</span>
                This transaction has already been paid and cannot be directly modified. Please use the appropriate financial correction process.
              </div>
            </div>
          )}

          {/* Unpaid Commission Warning */}
          {!hasPaidCommission && hasUnpaidCommissions && (
            <div className="p-3 bg-gold/10 border border-gold/30 rounded text-gold-tan flex items-start gap-2">
              <IAlert size={18} className="text-gold shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-gold">Commission Ledger Warning:</span>
                This policy already has commission records. Changing Agent Code or Plan Code may affect commission allocation. Please confirm the correction.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Policy Number</label>
              <input
                type="text"
                disabled={hasPaidCommission}
                className="field font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                value={editForm.policyNumber}
                onChange={e => setEditForm({ ...editForm, policyNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Plan Code</label>
              <input
                type="text"
                disabled={hasPaidCommission}
                className="field font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                value={editForm.planCode}
                onChange={e => setEditForm({ ...editForm, planCode: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Selling Agent Sponsor Code</label>
              <input
                type="text"
                disabled={hasPaidCommission}
                className="field font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="e.g. KB000011"
                value={editForm.agentCode}
                onChange={e => setEditForm({ ...editForm, agentCode: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Policy Start Date</label>
              <input
                type="date"
                className="field"
                value={editForm.startDate}
                onChange={e => setEditForm({ ...editForm, startDate: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Monthly Deposit Amount (₹)</label>
              <input
                type="number"
                disabled={hasPaidCommission}
                className="field disabled:opacity-50 disabled:cursor-not-allowed"
                value={editForm.monthlyAmount}
                onChange={e => setEditForm({ ...editForm, monthlyAmount: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Total Amount / FD Deposit (₹)</label>
              <input
                type="number"
                disabled={hasPaidCommission}
                className="field disabled:opacity-50 disabled:cursor-not-allowed"
                value={editForm.totalAmount}
                onChange={e => setEditForm({ ...editForm, totalAmount: e.target.value })}
              />
            </div>
          </div>

          {/* Live Diff Preview */}
          {diffs.length > 0 && (
            <div className="card p-3 bg-navy-4/40 border border-gold-1/30 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gold">
                Preview Changes:
              </div>
              <div className="space-y-1">
                {diffs.map((d, i) => (
                  <div key={i} className="flex flex-wrap justify-between items-center gap-2 text-[11px] border-b border-navy-4/50 pb-1">
                    <span className="text-ink-2 font-medium">{d.field}:</span>
                    <span className="font-mono text-ink-1">
                      <span className="text-red-400 line-through mr-1">{d.oldVal}</span> → <span className="text-ok font-bold">{d.newVal}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mandatory Correction Reason */}
          <div>
            <label className="label text-gold font-bold">
              Reason for Correction <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="field border-gold/40 focus:border-gold"
              placeholder="e.g. Corrected agent code entry error from bank file"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
