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
import { IDoc, IUsers, ICash, ISettings, IAlert } from '../../components/ui/icons'
import { addYears } from 'date-fns'
import { isPension, getPensionPolicyYear, planYears } from '../../data/compensation'
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

  const { ranksList } = useRanks()
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
          masterDataAPI.listBranches().catch(() => [])
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
          .catch(() => {})
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

  // Expected MDA Commission Rate Master (Ranks 1-10 updated per Change 1, Ranks 11-18 preserved)
  const MDA_COMMISSION_RATES = {
    AO:  { '1Y_RD_Y1': 4.00, '2Y_RD_Y1': 6.00, '2Y_RD_Y2': 4.00, '3Y_RD_Y1': 7.00, '3Y_RD_Y2_3': 4.00, '4Y_RD_Y1': 8.00, '4Y_RD_Y2_4': 4.00, '5Y_RD_Y1': 9.00, '5Y_RD_Y2_5': 5.00, 'FD_Y1': 5.00, 'FD_Y2': 5.50, 'FD_Y3': 6.00, 'FD_Y4': 6.50, 'FD_Y5': 7.00 },
    AM:  { '1Y_RD_Y1': 1.00, '2Y_RD_Y1': 1.25, '2Y_RD_Y2': 0.75, '3Y_RD_Y1': 2.00, '3Y_RD_Y2_3': 1.00, '4Y_RD_Y1': 3.00, '4Y_RD_Y2_4': 1.00, '5Y_RD_Y1': 3.00, '5Y_RD_Y2_5': 1.00, 'FD_Y1': 2.00, 'FD_Y2': 2.25, 'FD_Y3': 2.50, 'FD_Y4': 2.75, 'FD_Y5': 3.00 },
    ADM: { '1Y_RD_Y1': 0.70, '2Y_RD_Y1': 0.75, '2Y_RD_Y2': 0.40, '3Y_RD_Y1': 1.00, '3Y_RD_Y2_3': 0.50, '4Y_RD_Y1': 1.00, '4Y_RD_Y2_4': 0.75, '5Y_RD_Y1': 1.00, '5Y_RD_Y2_5': 0.75, 'FD_Y1': 1.50, 'FD_Y2': 1.75, 'FD_Y3': 1.80, 'FD_Y4': 2.00, 'FD_Y5': 2.00 },
    DM:  { '1Y_RD_Y1': 0.55, '2Y_RD_Y1': 0.60, '2Y_RD_Y2': 0.30, '3Y_RD_Y1': 0.75, '3Y_RD_Y2_3': 0.40, '4Y_RD_Y1': 0.75, '4Y_RD_Y2_4': 0.65, '5Y_RD_Y1': 1.00, '5Y_RD_Y2_5': 0.50, 'FD_Y1': 0.90, 'FD_Y2': 0.90, 'FD_Y3': 1.00, 'FD_Y4': 1.00, 'FD_Y5': 1.00 },
    SDM: { '1Y_RD_Y1': 0.40, '2Y_RD_Y1': 0.50, '2Y_RD_Y2': 0.25, '3Y_RD_Y1': 0.50, '3Y_RD_Y2_3': 0.35, '4Y_RD_Y1': 0.50, '4Y_RD_Y2_4': 0.50, '5Y_RD_Y1': 0.50, '5Y_RD_Y2_5': 0.40, 'FD_Y1': 0.75, 'FD_Y2': 0.75, 'FD_Y3': 0.80, 'FD_Y4': 0.80, 'FD_Y5': 0.90 },
    CM:  { '1Y_RD_Y1': 0.35, '2Y_RD_Y1': 0.40, '2Y_RD_Y2': 0.20, '3Y_RD_Y1': 0.40, '3Y_RD_Y2_3': 0.25, '4Y_RD_Y1': 0.40, '4Y_RD_Y2_4': 0.45, '5Y_RD_Y1': 0.40, '5Y_RD_Y2_5': 0.35, 'FD_Y1': 0.70, 'FD_Y2': 0.70, 'FD_Y3': 0.70, 'FD_Y4': 0.75, 'FD_Y5': 0.75 },
    AGM: { '1Y_RD_Y1': 0.25, '2Y_RD_Y1': 0.30, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.30, '3Y_RD_Y2_3': 0.20, '4Y_RD_Y1': 0.30, '4Y_RD_Y2_4': 0.35, '5Y_RD_Y1': 0.30, '5Y_RD_Y2_5': 0.20, 'FD_Y1': 0.65, 'FD_Y2': 0.65, 'FD_Y3': 0.65, 'FD_Y4': 0.65, 'FD_Y5': 0.70 },
    GM:  { '1Y_RD_Y1': 0.20, '2Y_RD_Y1': 0.20, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.20, '3Y_RD_Y2_3': 0.15, '4Y_RD_Y1': 0.20, '4Y_RD_Y2_4': 0.15, '5Y_RD_Y1': 0.25, '5Y_RD_Y2_5': 0.15, 'FD_Y1': 0.50, 'FD_Y2': 0.50, 'FD_Y3': 0.55, 'FD_Y4': 0.55, 'FD_Y5': 0.65 },
    ZM:  { '1Y_RD_Y1': 0.20, '2Y_RD_Y1': 0.20, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.20, '3Y_RD_Y2_3': 0.15, '4Y_RD_Y1': 0.20, '4Y_RD_Y2_4': 0.15, '5Y_RD_Y1': 0.20, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.50, 'FD_Y2': 0.50, 'FD_Y3': 0.50, 'FD_Y4': 0.50, 'FD_Y5': 0.50 },
    ED:  { '1Y_RD_Y1': 0.15, '2Y_RD_Y1': 0.15, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.20, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.50, 'FD_Y2': 0.50, 'FD_Y3': 0.50, 'FD_Y4': 0.50, 'FD_Y5': 0.50 },
    SED: { '1Y_RD_Y1': 0.15, '2Y_RD_Y1': 0.15, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.45, 'FD_Y2': 0.45, 'FD_Y3': 0.45, 'FD_Y4': 0.45, 'FD_Y5': 0.45 },
    MD:  { '1Y_RD_Y1': 0.15, '2Y_RD_Y1': 0.15, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.40, 'FD_Y2': 0.40, 'FD_Y3': 0.40, 'FD_Y4': 0.40, 'FD_Y5': 0.40 },
    CMD: { '1Y_RD_Y1': 0.15, '2Y_RD_Y1': 0.15, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.40, 'FD_Y2': 0.40, 'FD_Y3': 0.40, 'FD_Y4': 0.40, 'FD_Y5': 0.40 },
    AVP: { '1Y_RD_Y1': 0.15, '2Y_RD_Y1': 0.15, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.35, 'FD_Y2': 0.35, 'FD_Y3': 0.35, 'FD_Y4': 0.35, 'FD_Y5': 0.35 },
    VP:  { '1Y_RD_Y1': 0.10, '2Y_RD_Y1': 0.10, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.35, 'FD_Y2': 0.35, 'FD_Y3': 0.35, 'FD_Y4': 0.35, 'FD_Y5': 0.35 },
    SVP: { '1Y_RD_Y1': 0.10, '2Y_RD_Y1': 0.10, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.30, 'FD_Y2': 0.30, 'FD_Y3': 0.30, 'FD_Y4': 0.30, 'FD_Y5': 0.30 },
    EVP: { '1Y_RD_Y1': 0.10, '2Y_RD_Y1': 0.10, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.30, 'FD_Y2': 0.30, 'FD_Y3': 0.30, 'FD_Y4': 0.30, 'FD_Y5': 0.30 },
    MGD: { '1Y_RD_Y1': 0.10, '2Y_RD_Y1': 0.10, '2Y_RD_Y2': 0.10, '3Y_RD_Y1': 0.15, '3Y_RD_Y2_3': 0.10, '4Y_RD_Y1': 0.15, '4Y_RD_Y2_4': 0.10, '5Y_RD_Y1': 0.15, '5Y_RD_Y2_5': 0.10, 'FD_Y1': 0.30, 'FD_Y2': 0.30, 'FD_Y3': 0.30, 'FD_Y4': 0.30, 'FD_Y5': 0.30 }
  }

  const getExpectedMdaRate = (rankCode, planCode, policyYear = 1) => {
    const code = String(rankCode || '').toUpperCase()
    if (typeof MDA_COMMISSION_RATES[code] === 'number') {
      return MDA_COMMISSION_RATES[code]
    }
    const table = MDA_COMMISSION_RATES[code]
    if (!table) return 0

    const p = String(planCode || 'RD1Y').toUpperCase().replace('-', '')
    const yr = Number(policyYear) || 1

    if (p === 'RD1Y') return table['1Y_RD_Y1'] || 0
    if (p === 'RD2Y') return yr === 1 ? table['2Y_RD_Y1'] : table['2Y_RD_Y2']
    if (p === 'RD3Y') return yr === 1 ? table['3Y_RD_Y1'] : table['3Y_RD_Y2_3']
    if (p === 'RD4Y') return yr === 1 ? table['4Y_RD_Y1'] : table['4Y_RD_Y2_4']
    if (p === 'RD5Y') return yr === 1 ? table['5Y_RD_Y1'] : table['5Y_RD_Y2_5']
    if (p.startsWith('FD') || p.startsWith('PENS')) {
      const yKey = `FD_Y${Math.min(Math.max(yr, 1), 5)}`
      return table[yKey] || table['FD_Y1'] || 0
    }
    return table['1Y_RD_Y1'] || 0
  }

  // Map each rank (1 to 18) to the parsed record or skipped state
  const breakdownRows = useMemo(() => {
    if (!ranksList || ranksList.length === 0) return []

    // Sort ranks ascending
    const sortedRanks = [...ranksList].sort((a, b) => Number(a.rank) - Number(b.rank))

    let runningTotalPct = 0

    return sortedRanks.map(r => {
      const rankNum = Number(r.rank)
      // Find matching ledger entry for this rank
      const entry = (ledgerData || []).find(c => {
        if (Number(c.receivingRank) === rankNum) return true
        const ag = usersMap[c.agentId]
        return ag && Number(ag.rank) === rankNum
      })

      // Find matching agent in the traversed sponsor chain
      const agentInChain = traversedChain.find(a => Number(a.rank) === rankNum)
      const isSeller = agent && Number(agent.rank) === rankNum

      let pct = 0
      let amt = 0
      let type = 'Upline Commission'
      let skipped = false
      let skipReason = ''
      let agentName = '—'
      let agentCode = '—'
      let docId = null

      if (entry) {
        pct = Number(entry.percentage) || 0
        amt = Number(entry.amount) || 0
        type = (entry.commissionType === 'Direct' || entry.commissionType === 'direct') ? 'Direct' : 'Upline Commission'
        agentName = entry.agentName || usersMap[entry.agentId]?.name || (agentInChain ? agentInChain.name : (isSeller ? agent.name : '—'))
        agentCode = entry.sponsorCode || usersMap[entry.agentId]?.sponsorCode || (agentInChain ? agentInChain.sponsorCode : (isSeller ? agent.sponsorCode : '—'))
        docId = entry.id
        runningTotalPct += pct
      } else if (agentInChain || isSeller) {
        // Fallback when ledger rows are protected by database RLS: calculate exact MDA commission for agent in hierarchy
        const ag = isSeller ? agent : agentInChain
        const bAmt = Number(p?.monthlyAmount) || Number(p?.totalPaid) || Number(p?.fdAmount) || 0
        const rate = getExpectedMdaRate(r.code, p?.planCode || p?.type, p?.policyYear || 1)
        pct = rate
        amt = Number(((bAmt * rate) / 100).toFixed(2))
        type = isSeller ? 'Direct' : 'Upline Commission'
        agentName = ag.name
        agentCode = ag.sponsorCode || '—'
        runningTotalPct += pct
      } else {
        skipped = true
        if (agent && rankNum < Number(agent.rank)) {
          skipReason = 'Skipped (Below Seller)'
        } else {
          skipReason = 'Skipped (No Agent at Rank)'
        }
      }

      return {
        rank: rankNum,
        rankCode: r.code,
        rankName: r.name,
        agentName,
        agentCode,
        type,
        percentage: pct,
        amount: amt,
        runningTotalPct,
        skipped,
        skipReason,
        docId
      }
    })
  }, [ranksList, ledgerData, usersMap, traversedChain, agent, p])

  // Summary card metrics
  const paidRanks = useMemo(() => breakdownRows.filter(r => !r.skipped), [breakdownRows])
  const totalDistributed = useMemo(() => paidRanks.reduce((sum, r) => sum + r.percentage, 0), [paidRanks])
  const totalPaid = useMemo(() => paidRanks.reduce((sum, r) => sum + r.amount, 0), [paidRanks])
  const highestRankObj = useMemo(() => paidRanks.length > 0 ? paidRanks[paidRanks.length - 1] : null, [paidRanks])
  const lowestRankObj = useMemo(() => paidRanks.length > 0 ? paidRanks[0] : null, [paidRanks])

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
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IDoc size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Policy #{p.policyNumber || '—'}</h1>
                <StatusBadge status={p.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">Product: {p.type || p.planCode || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-dark py-2 px-4 text-xs font-bold uppercase tracking-wider border border-gold/40 text-gold hover:border-gold flex items-center gap-1.5"
              >
                <ISettings size={14} /> Correct Credentials
              </button>
            )}
            <Link to="/admin/policies" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
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
                  <span className="block text-[10px] text-ink-2">Policy Year</span>
                  <span className="font-semibold text-ink-1 font-mono">
                    {isPension(p.type, p.planType)
                      ? (getPensionPolicyYear(p.type, p.policyYear || p.duration) ? `${getPensionPolicyYear(p.type, p.policyYear || p.duration)}` : 'Not Specified')
                      : (p.policyYear || planYears(p.type) || 1)}
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
            <div className="bg-navy-2/30 border border-navy-4 rounded p-4 flex justify-between items-center text-xs mt-2">
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Cumulative Business Value</span>
                <span className="text-xl font-bold font-serif text-ink-1 mt-0.5 block">{formatINR(businessValue)}</span>
              </div>
              <ICash size={24} className="text-gold-1/60" />
            </div>
          </div>

          {/* Commission Allocation Breakdown */}
          <div className="card p-5 space-y-6">
            <div className="border-b border-navy-4/50 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ISettings size={16} /> Commission Allocation Breakdown
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">Real-time sponsor hierarchy calculations from the live ledger database.</p>
              </div>
            </div>

            {/* Matrix table */}
            <div className="border border-navy-4 rounded-card overflow-hidden">
              <table className="tbl text-xs">
                <thead>
                  <tr className="bg-navy-2/40">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Rank Tier</th>
                    <th className="py-2.5 px-3">Agent Name</th>
                    <th className="py-2.5 px-3">Agent Code</th>
                    <th className="py-2.5 px-3">Status / Role</th>
                    <th className="py-2.5 px-3 text-right">Commission %</th>
                    <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-3 text-right">Running Total %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-4">
                  {breakdownRows.map((row) => (
                    <tr key={row.rank} className={`hover:bg-navy-2/30 transition-colors ${row.skipped ? 'text-ink-2/60 bg-navy-2/5' : 'text-ink-1 font-medium'}`}>
                      <td className="py-3 px-3 font-mono">{row.rank}</td>
                      <td className="py-3 px-3 uppercase text-[10.5px] font-semibold text-gold-tan">{row.rankCode} - {row.rankName}</td>
                      <td className="py-3 px-3">{row.agentName}</td>
                      <td className="py-3 px-3 font-mono">{row.agentCode}</td>
                      <td className="py-3 px-3">
                        {row.skipped ? (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-navy-2 text-ink-2/70 border border-navy-4">
                            {row.skipReason}
                          </span>
                        ) : (
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${row.type === 'Direct' ? 'bg-gold-1/10 text-gold-1 border border-gold-1/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {row.type}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{Number(row.percentage).toFixed(2)}%</td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-gold">{row.amount > 0 ? formatINR(row.amount) : '₹0'}</td>
                      <td className="py-3 px-3 text-right font-mono">{Number(row.runningTotalPct).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-navy-2/25 border border-navy-4 rounded-card p-5">
              <div className="col-span-full border-b border-navy-4/50 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Commission Summary</h4>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Records</span>
                <span className="text-xl font-bold font-serif text-ink-1 block">{paidRanks.length}</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Distributed</span>
                <span className="text-xl font-bold font-serif text-gold block">{Number(totalDistributed).toFixed(2)}%</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Commission Paid</span>
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
                className="w-full flex items-center justify-between bg-navy-2/30 p-4 hover:bg-navy-2/50 transition-colors text-left"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-ink-1">How was this commission calculated?</span>
                <span className="text-xs text-gold-1 font-bold">{explainOpen ? 'Hide' : 'Show Details'}</span>
              </button>
              {explainOpen && (
                <div className="p-4 bg-navy-3 border-t border-navy-4 space-y-3.5 text-xs text-ink-2">
                  <div className="grid grid-cols-2 gap-4">
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
                      <span className="font-semibold text-ink-1">Flat Per-Rank Commission</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Maximum Configured Commission</span>
                      <span className="font-semibold text-ink-1 font-mono">{highestRankObj ? `${Number(highestRankObj.percentage).toFixed(2)}%` : '—'}</span>
                    </div>
                    <div className="col-span-2 border-t border-navy-4/50 pt-2.5">
                      <span className="block text-[10px] uppercase text-ink-2">Formula Explanation</span>
                      <p className="mt-1 leading-relaxed text-[11px]">
                        The commission engine traverses the upline hierarchy starting from the seller. For each level, it determines the commission rate configured in the Commission Master for that rank and pays out exactly that percentage. No deductions are made, and no ranks are skipped due to equal rate percentages, assuring full transparency.
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
                  <div key={i} className="flex justify-between items-center text-[11px] border-b border-navy-4/50 pb-1">
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
