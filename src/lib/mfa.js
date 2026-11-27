// ============================================================================
// Standalone Monthly MFA (Monthly Field Allowance) Evaluation & Mirrors
// ----------------------------------------------------------------------------
// Mirrors Postgres backend logic (agent_mfa_records / agent_mfa_contributions):
// - Standalone performance incentive system (separate from commissions/payouts)
// - Ranks 1–10 (AO to ED) only; Ranks 11–18 have no MFA target/reward
// - Personal (direct) business brought in the target calendar month/year only
// - RD amount = initial/monthly installment amount (never x12), once per policy
// - FD/Pension amount = lump-sum deposit, once per policy
// - Duration-based MFA Credit: 1Y = 25%, 2Y = 50%, 3Y+ = 100%
// - Achievement >= 100% earns full rank reward; < 100% earns ₹0 (no partials)
// - Historical / mid-month records preserve snapshotted rank, target & reward
// ============================================================================
import { RANKS as DEFAULT_RANKS } from '../data/ranks.js'
import {
  DEFAULT_PROMOTION_RULES,
  MFA_SLABS,
  getMfaSlabForRank,
  getMfaTermWeight,
  getPolicyTermYears,
  isRD,
} from '../data/compensation.js'

export function mergePromotionRules(customRules = {}) {
  const merged = {}
  const keys = new Set([...Object.keys(DEFAULT_PROMOTION_RULES), ...Object.keys(customRules || {})])
  keys.forEach((code) => {
    const upper = String(code).toUpperCase()
    const base = DEFAULT_PROMOTION_RULES[upper] || {}
    const custom = customRules?.[code] || customRules?.[upper] || {}
    const combined = { ...base, ...custom }
    // Ranks 11–18 never carry MFA even if legacy config stored a value
    const slab = getMfaSlabForRank(upper)
    if (!slab.applicable && base.mfaTarget === 0) {
      combined.mfa = 0
      combined.mfaTarget = 0
    }
    merged[upper] = combined
  })
  return merged
}

/**
 * Derive single-policy qualifying business amount for MFA:
 * - RD: initial/monthly installment amount (e.g. ₹1,000/mo RD -> ₹1,000; NOT x12)
 * - FD / Pension: lump-sum deposit amount
 */
export function getPolicyMfaBusinessAmount(policy, firstPayment = null) {
  if (!policy) return 0
  const code = policy.planCode || policy.type || ''
  const planType = policy.planType || ''
  if (isRD(code, planType)) {
    const monthly = Number(policy.monthlyAmount ?? policy.installmentAmount ?? 0)
    if (monthly > 0) return monthly
    const payAmt = Number(firstPayment?.amount || 0)
    if (payAmt > 0) return payAmt
    return Number(policy.totalPaid || 0)
  }
  const fd = Number(policy.fdAmount || 0)
  if (fd > 0) return fd
  const payAmt = Number(firstPayment?.amount || 0)
  if (payAmt > 0) return payAmt
  return Number(policy.totalPaid || policy.totalAmount || 0)
}

export function getMfaPercentageForDuration(durationYears) {
  return Math.round(getMfaTermWeight(durationYears) * 100)
}

function parseMonthYear(dateInput) {
  if (!dateInput) return null
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const [y, m] = dateInput.slice(0, 7).split('-').map(Number)
    if (y && m) return { month: m, year: y, dateStr: dateInput.slice(0, 10) }
  }
  const d = dateInput?.toDate ? dateInput.toDate() : new Date(dateInput)
  if (isNaN(d.getTime())) return null
  return {
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    dateStr: d.toISOString().slice(0, 10),
  }
}

export function getCurrentIstPeriod(refDate = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(refDate)
    const year = Number(parts.find((p) => p.type === 'year')?.value)
    const month = Number(parts.find((p) => p.type === 'month')?.value)
    const day = Number(parts.find((p) => p.type === 'day')?.value)
    if (year && month) {
      return { month, year, day: day || 1, ym: year * 100 + month }
    }
  } catch {
    // Fallback if Intl timezone support is unavailable
  }
  const year = refDate.getFullYear()
  const month = refDate.getMonth() + 1
  return { month, year, day: refDate.getDate(), ym: year * 100 + month }
}

export function isClosedMfaPeriod(month, year, refDate = new Date()) {
  const m = Number(month)
  const y = Number(year)
  if (!m || !y) return false
  return (y * 100 + m) < getCurrentIstPeriod(refDate).ym
}

export function isFutureMfaPeriod(month, year, refDate = new Date()) {
  const m = Number(month)
  const y = Number(year)
  if (!m || !y) return false
  return (y * 100 + m) > getCurrentIstPeriod(refDate).ym
}

function getCurrentMonthKey(refDate = new Date()) {
  return getCurrentIstPeriod(refDate).ym
}

export function getMfaStatusMessage({ status, remainingAmount, rewardAmount, mfaTarget }) {
  if (status === 'not_applicable' || Number(mfaTarget) <= 0) {
    return 'Monthly MFA applies to Ranks 1–10 (AO to ED).'
  }
  if (status === 'achieved') {
    return `Congratulations! You have achieved your monthly MFA target. Your ₹${Number(rewardAmount || 0).toLocaleString('en-IN')} reward has been earned.`
  }
  if (status === 'missed') {
    return 'Monthly MFA target not achieved. No MFA reward was earned for this month.'
  }
  return `Achieve ₹${Number(remainingAmount || 0).toLocaleString('en-IN')} more in qualifying business this month to unlock your ₹${Number(rewardAmount || 0).toLocaleString('en-IN')} MFA reward.`
}

const round2 = (n) => Number((Number(n) || 0).toFixed(2))

function isAdminUser(agent) {
  return Boolean(
    agent?.isSuperAdmin ||
      agent?.is_super_admin ||
      agent?.isAdmin ||
      agent?.is_admin ||
      String(agent?.role || '').toLowerCase() === 'super_admin' ||
      String(agent?.role || '').toLowerCase() === 'admin'
  )
}

function buildFirstPaymentMap(payments) {
  const firstPaymentByPolicy = new Map()
  if (Array.isArray(payments)) {
    const sorted = [...payments]
      .filter((pay) => String(pay?.status || 'completed').toLowerCase() === 'completed')
      .sort((a, b) => {
        const instDiff = (Number(a.installmentNumber || a.installment_number || 1) - Number(b.installmentNumber || b.installment_number || 1))
        if (instDiff !== 0) return instDiff
        return String(a.paidDate || a.paid_date || a.createdAt || a.created_at || '')
          .localeCompare(String(b.paidDate || b.paid_date || b.createdAt || b.created_at || ''))
      })
    sorted.forEach((pay) => {
      const pid = pay.policyId || pay.policy_id
      if (pid && !firstPaymentByPolicy.has(pid)) {
        firstPaymentByPolicy.set(pid, pay)
      }
    })
  }
  return firstPaymentByPolicy
}

function extractQualifyingMonthContributions({
  policies,
  firstPaymentByPolicy,
  targetMonth,
  targetYear,
  isEligibleAgentFn,
}) {
  const seenPolicyIds = new Set()
  const contribs = []

  ;(policies || []).forEach((p) => {
    if (!p || !p.id || seenPolicyIds.has(p.id)) return
    seenPolicyIds.add(p.id)

    const agentId = p.agentId || p.agent_id
    if (isEligibleAgentFn && !isEligibleAgentFn(agentId)) return

    const statusStr = String(p.status || 'active').toLowerCase()
    if (statusStr !== 'active' && statusStr !== 'matured') return

    const firstPay = firstPaymentByPolicy.get(p.id) || null
    const hasValidPayment =
      Boolean(firstPay) ||
      Number(p.paidInstallments ?? p.paid_installments ?? 0) >= 1 ||
      Number(p.totalPaid ?? p.total_paid ?? 0) > 0
    if (!hasValidPayment) return

    const bizDate = parseMonthYear(firstPay?.paidDate || firstPay?.paid_date || p.startDate || p.start_date || p.createdAt || p.created_at)
    if (!bizDate || bizDate.month !== targetMonth || bizDate.year !== targetYear) return

    const businessAmount = round2(getPolicyMfaBusinessAmount(p, firstPay))
    if (businessAmount <= 0) return

    const durationYears = getPolicyTermYears(p)
    const mfaPercentage = getMfaPercentageForDuration(durationYears)
    const mfaCredit = round2((businessAmount * mfaPercentage) / 100)

    contribs.push({
      policyId: p.id,
      policyNumber: p.policyNumber || p.policy_number || p.planAccountNumber || p.id,
      policyCreatedAt: String(p.createdAt || p.created_at || bizDate.dateStr || ''),
      agentId,
      customerId: p.customerId || p.customer_id || null,
      customerName: p.customerName || p.customers?.name || '—',
      planCode: String(p.planCode || p.plan_code || p.type || '').toUpperCase(),
      planType: String(p.planType || p.plan_type || (isRD(p.planCode || p.type, p.planType) ? 'RD' : 'FD')).toUpperCase(),
      durationYears,
      businessDate: bizDate.dateStr,
      month: targetMonth,
      year: targetYear,
      businessAmount,
      mfaPercentage,
      mfaCredit,
    })
  })

  return contribs
}

function buildBaseAllocStep(c, originState, sourceInfo, seq, path, extra = {}) {
  return {
    id: `${c.policyId}-seq-${seq}`,
    month: c.month,
    year: c.year,
    policyId: c.policyId,
    policyNumber: c.policyNumber,
    businessDate: c.businessDate,
    planCode: c.planCode,
    planType: c.planType,
    durationYears: c.durationYears,
    originalBusinessAmount: c.businessAmount,
    mfaPercentage: c.mfaPercentage,
    originatingMfaCredit: c.mfaCredit,
    originatingAgentId: originState.agentId,
    originatingAgentName: originState.agentName,
    originatingAgentCode: originState.sponsorCode,
    sourceAgentId: sourceInfo.id,
    sourceAgentName: sourceInfo.name,
    sourceAgentCode: sourceInfo.code,
    allocationSequence: seq,
    hierarchyPath: [...path],
    ...extra,
  }
}

function resolveSlabForAgent(agent, snapshot, ranksList = DEFAULT_RANKS) {
  const currentRank = Number(agent?.rank) || 1
  const rankMeta = (ranksList || DEFAULT_RANKS).find((r) => Number(r.rank) === currentRank)
  const adminFlag = isAdminUser(agent)

  if (snapshot) {
    return {
      rank: Number(snapshot.rankSnapshot ?? snapshot.rank_snapshot ?? currentRank),
      code: String(snapshot.rankCodeSnapshot ?? snapshot.rank_code_snapshot ?? rankMeta?.code ?? 'AO').toUpperCase(),
      mfaTarget: Number(snapshot.mfaTargetSnapshot ?? snapshot.mfa_target_snapshot ?? snapshot.mfaTarget ?? 0),
      mfaReward: Number(snapshot.mfaRewardSnapshot ?? snapshot.mfa_reward_snapshot ?? snapshot.mfaReward ?? 0),
    }
  }
  const s = getMfaSlabForRank(currentRank)
  return {
    rank: s.rank,
    code: s.code || String(rankMeta?.code || 'AO').toUpperCase(),
    mfaTarget: adminFlag || !s.applicable ? 0 : s.mfaTarget,
    mfaReward: adminFlag || !s.applicable ? 0 : s.mfaReward,
  }
}

/**
 * Pure deterministic chronological Cascading MFA Evaluator for a calendar (month, year).
 * Mirrors `recalculate_cascading_mfa_month(p_month, p_year)` in PostgreSQL 1-for-1:
 *  - Duration-weighted qualifying MFA credit (1Y=25%, 2Y=50%, 3Y+=100%)
 *  - Self target fill first; remaining excess flows upward via `sponsorId`
 *  - Intermediate seniors already at 100% pass credit cleanly ('pass_through')
 *  - Handles missing / inactive / suspended / cyclic / Rank 11+ boundaries safely
 *  - Preserves monthly snapshots (`rank`, `target`, `reward`, and past-month `sponsorId`)
 */
export function calculateMonthlyMfaBatch({
  profiles = [],
  policies = [],
  payments = null,
  month,
  year,
  snapshotsByAgentId = {},
  ranksList = DEFAULT_RANKS,
  referenceDate = new Date(),
}) {
  const targetMonth = Number(month)
  const targetYear = Number(year)
  const periodKey = targetYear * 100 + targetMonth
  const currentKey = getCurrentMonthKey(referenceDate)

  const profileMap = new Map()
  ;(profiles || []).forEach((p) => {
    const id = p?.id || p?.uid
    if (id) profileMap.set(id, p)
  })

  const stateByAgentId = new Map()
  const ensureAgentState = (agentProf) => {
    const id = agentProf?.id || agentProf?.uid
    if (!id || isAdminUser(agentProf)) return null
    if (stateByAgentId.has(id)) return stateByAgentId.get(id)

    const snap = snapshotsByAgentId?.[id] || null
    const snapIsLocked = Boolean(snap?.isLocked ?? snap?.is_locked ?? false)
    const isHistoricalOrLocked = periodKey < currentKey || snapIsLocked
    const slab = resolveSlabForAgent(agentProf, snap, ranksList)
    const liveSponsorId = agentProf.sponsorId ?? agentProf.sponsor_id ?? agentProf.referredBy ?? null
    const hasSnapSponsor = Boolean(snap && ('sponsorIdSnapshot' in snap || 'sponsor_id_snapshot' in snap))
    const snapSponsorId = snap?.sponsorIdSnapshot ?? snap?.sponsor_id_snapshot ?? null
    const resolvedSponsorId = isHistoricalOrLocked && hasSnapSponsor
      ? snapSponsorId
      : liveSponsorId

    const rawSnapStatus = snap?.agentStatusSnapshot ?? snap?.agent_status_snapshot ?? null
    const liveAgentStatus = String(agentProf.status || 'active').toLowerCase()
    let resolvedAgentStatus = liveAgentStatus
    let statusSnapshotUncertain = Boolean(snap?.statusSnapshotUncertain ?? snap?.status_snapshot_uncertain ?? false)

    if (rawSnapStatus !== null && rawSnapStatus !== undefined && String(rawSnapStatus).trim() !== '') {
      resolvedAgentStatus = isHistoricalOrLocked
        ? String(rawSnapStatus).toLowerCase()
        : liveAgentStatus
    } else if (isHistoricalOrLocked) {
      const hasHistoricalActivity = Boolean(
        snap && (
          Number(snap.ownMfaCreditApplied ?? snap.own_mfa_credit_applied ?? 0) > 0 ||
          Number(snap.cascadingMfaCreditReceived ?? snap.cascading_mfa_credit_received ?? 0) > 0 ||
          Number(snap.totalMfaCredit ?? snap.total_mfa_credit ?? 0) > 0 ||
          snap.isQualified || snap.is_qualified
        )
      )
      if (hasHistoricalActivity) {
        resolvedAgentStatus = 'active'
      } else {
        resolvedAgentStatus = 'unknown'
        statusSnapshotUncertain = true
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[MFA Historical Snapshot] Uncertain agent status for ${id} in ${targetMonth}/${targetYear}; defaulting conservatively to 'unknown'.`)
        }
      }
    }

    const state = {
      agentId: id,
      agentName: agentProf.name || '—',
      sponsorCode: agentProf.sponsorCode || agentProf.sponsor_code || '—',
      email: agentProf.email || '',
      phone: agentProf.phone || '',
      currentRank: Number(agentProf.rank) || 1,
      agentStatusSnapshot: resolvedAgentStatus,
      statusSnapshotUncertain,
      isLocked: snapIsLocked,
      agentStatus: resolvedAgentStatus,
      sponsorId: resolvedSponsorId || null,
      month: targetMonth,
      year: targetYear,
      rankSnapshot: slab.rank,
      rankCodeSnapshot: slab.code,
      mfaTarget: slab.mfaTarget,
      mfaReward: slab.mfaReward,
      applicable: slab.rank >= 1 && slab.rank <= 10 && slab.mfaTarget > 0 && slab.mfaReward > 0,
      rawBusinessTotal: 0,
      ownBusinessTotal: 0,
      ownMfaCreditGenerated: 0,
      ownMfaCreditApplied: 0,
      cascadingMfaCreditReceived: 0,
      totalMfaCredit: 0,
      excessCreditPassedUp: 0,
      excessUnallocatedCredit: 0,
      remainingAmount: slab.mfaTarget,
      achievementPct: 0,
      isQualified: false,
      rewardEarned: 0,
      status: slab.mfaTarget > 0 ? (periodKey < currentKey ? 'missed' : 'in_progress') : 'not_applicable',
      contributionsCount: 0,
      cascadingInCount: 0,
      contributions: [],
      cascadingIncoming: [],
      cascadingOutgoing: [],
    }
    stateByAgentId.set(id, state)
    return state
  }

  // Initialize active non-admin Rank 1–10 agents upfront
  ;(profiles || []).forEach((p) => {
    if (!p?.id && !p?.uid) return
    if (isAdminUser(p)) return
    const rankNum = Number(p.rank) || 1
    const snap = snapshotsByAgentId?.[p.id || p.uid]
    const st = String(p.status || 'active').toLowerCase()
    if ((rankNum >= 1 && rankNum <= 10 && st === 'active') || snap) {
      ensureAgentState(p)
    }
  })

  // Collect qualifying policies in (month, year) deterministically sorted chronologically
  const firstPaymentByPolicy = buildFirstPaymentMap(payments)
  const qualifyingContribs = extractQualifyingMonthContributions({
    policies,
    firstPaymentByPolicy,
    targetMonth,
    targetYear,
    isEligibleAgentFn: (aid) => {
      const prof = profileMap.get(aid)
      return Boolean(prof && !isAdminUser(prof))
    },
  })

  qualifyingContribs.sort((a, b) => {
    const dateCmp = String(a.businessDate).localeCompare(String(b.businessDate))
    if (dateCmp !== 0) return dateCmp
    const createdCmp = String(a.policyCreatedAt).localeCompare(String(b.policyCreatedAt))
    if (createdCmp !== 0) return createdCmp
    return String(a.policyId).localeCompare(String(b.policyId))
  })

  const allocations = []
  const allocationsByPolicy = {}
  const allocationsByAgent = {}
  const hierarchyIssues = []
  const MAX_DEPTH = 30

  const pushAlloc = (alloc) => {
    allocations.push(alloc)
    if (!allocationsByPolicy[alloc.policyId]) allocationsByPolicy[alloc.policyId] = []
    allocationsByPolicy[alloc.policyId].push(alloc)
    if (alloc.recipientAgentId) {
      if (!allocationsByAgent[alloc.recipientAgentId]) allocationsByAgent[alloc.recipientAgentId] = []
      allocationsByAgent[alloc.recipientAgentId].push(alloc)
    }
  }

  qualifyingContribs.forEach((c) => {
    const originProf = profileMap.get(c.agentId)
    const originState = ensureAgentState(originProf)
    if (!originState) return

    originState.rawBusinessTotal = round2(originState.rawBusinessTotal + c.businessAmount)
    originState.ownBusinessTotal = round2(originState.ownBusinessTotal + c.businessAmount)
    originState.ownMfaCreditGenerated = round2(originState.ownMfaCreditGenerated + c.mfaCredit)
    originState.contributionsCount += 1

    const remTargetSelf = originState.applicable && originState.agentStatus === 'active'
      ? Math.max(0, round2(originState.mfaTarget - originState.totalMfaCredit))
      : 0
    const applySelf = round2(Math.min(c.mfaCredit, remTargetSelf))
    const excessSelf = round2(c.mfaCredit - applySelf)

    originState.ownMfaCreditApplied = round2(originState.ownMfaCreditApplied + applySelf)
    originState.totalMfaCredit = round2(originState.totalMfaCredit + applySelf)
    originState.contributions.push({
      ...c,
      appliedToSelf: applySelf,
      excessPassedUp: excessSelf,
    })

    let seq = 1
    let depth = 0
    const visited = new Set([originState.agentId])
    const path = [
      {
        seq: 1,
        agentId: originState.agentId,
        agentCode: originState.sponsorCode,
        agentName: originState.agentName,
        rank: originState.rankSnapshot,
        rankCode: originState.rankCodeSnapshot,
        target: originState.mfaTarget,
        allocationType: 'self_own',
        applied: applySelf,
        excessUp: excessSelf,
      },
    ]

    pushAlloc({
      id: `${c.policyId}-seq-${seq}`,
      month: targetMonth,
      year: targetYear,
      policyId: c.policyId,
      policyNumber: c.policyNumber,
      businessDate: c.businessDate,
      planCode: c.planCode,
      planType: c.planType,
      durationYears: c.durationYears,
      originalBusinessAmount: c.businessAmount,
      mfaPercentage: c.mfaPercentage,
      originatingMfaCredit: c.mfaCredit,
      originatingAgentId: originState.agentId,
      originatingAgentName: originState.agentName,
      originatingAgentCode: originState.sponsorCode,
      sourceAgentId: originState.agentId,
      sourceAgentName: originState.agentName,
      sourceAgentCode: originState.sponsorCode,
      recipientAgentId: originState.agentId,
      recipientAgentName: originState.agentName,
      recipientAgentCode: originState.sponsorCode,
      allocationSequence: seq,
      allocationType: 'self_own',
      incomingCredit: c.mfaCredit,
      appliedAmount: applySelf,
      excessPassedUp: excessSelf,
      unallocatedAmount: 0,
      unallocatedReason: null,
      recipientRankSnapshot: originState.rankSnapshot,
      recipientRankCodeSnapshot: originState.rankCodeSnapshot,
      recipientTargetSnapshot: originState.mfaTarget,
      recipientRewardSnapshot: originState.mfaReward,
      reportingSponsorIdSnapshot: originState.sponsorId,
      hierarchyPath: [...path],
    })

    let remaining = excessSelf
    let currState = originState
    let currId = originState.agentId
    let currName = originState.agentName
    let currCode = originState.sponsorCode
    let currSponsorId = originState.sponsorId

    const recordUnallocated = ({ reason, issueType = null, issueAgentId = null, issueSponsorId = null, details = null, extra = {} }) => {
      if (currState) {
        currState.excessUnallocatedCredit = round2(currState.excessUnallocatedCredit + remaining)
      }
      if (issueType) {
        hierarchyIssues.push({
          month: targetMonth,
          year: targetYear,
          policyId: c.policyId,
          policyNumber: c.policyNumber,
          originatingAgentId: originState.agentId,
          agentId: issueAgentId || currId,
          sponsorId: issueSponsorId ?? currSponsorId,
          issueType,
          affectedCredit: remaining,
          details: details || { path: [...path] },
        })
      }
      const unalloc = buildBaseAllocStep(c, originState, { id: currId, name: currName, code: currCode }, seq, path, {
        recipientAgentId: null,
        recipientAgentName: null,
        recipientAgentCode: null,
        allocationType: 'unallocated_excess',
        incomingCredit: remaining,
        appliedAmount: 0,
        excessPassedUp: 0,
        unallocatedAmount: remaining,
        unallocatedReason: reason,
        ...extra,
      })
      pushAlloc(unalloc)
      if (currState) currState.cascadingOutgoing.push(unalloc)
    }

    while (remaining > 0) {
      seq += 1
      depth += 1

      if (!currSponsorId) {
        recordUnallocated({ reason: 'no_superior' })
        break
      }

      if (visited.has(currSponsorId)) {
        const isSelf = currSponsorId === currId
        recordUnallocated({
          issueType: isSelf ? 'self_referential_cycle' : 'hierarchy_cycle',
          reason: isSelf ? 'self_referential_cycle' : 'hierarchy_cycle_detected',
          details: { path: [...path], cycleTarget: currSponsorId },
          extra: { reportingSponsorIdSnapshot: currSponsorId },
        })
        break
      }

      if (depth > MAX_DEPTH) {
        recordUnallocated({
          issueType: 'max_depth_exceeded',
          reason: 'max_depth_exceeded',
          details: { path: [...path], maxDepth: MAX_DEPTH },
          extra: { reportingSponsorIdSnapshot: currSponsorId },
        })
        break
      }

      const supProf = profileMap.get(currSponsorId)
      if (!supProf) {
        recordUnallocated({
          issueType: 'missing_superior',
          reason: 'missing_superior',
          details: { path: [...path], missingSponsorId: currSponsorId },
          extra: { reportingSponsorIdSnapshot: currSponsorId },
        })
        break
      }

      if (isAdminUser(supProf)) {
        recordUnallocated({
          issueType: 'admin_in_hierarchy',
          reason: 'admin_in_hierarchy',
          issueSponsorId: supProf.id,
          details: { path: [...path], adminCode: supProf.sponsorCode || supProf.sponsor_code },
          extra: { reportingSponsorIdSnapshot: supProf.id },
        })
        break
      }

      const supState = ensureAgentState(supProf)
      const supStatus = supState ? supState.agentStatus : String(supProf.status || 'active').toLowerCase()

      if (supStatus !== 'active') {
        const issueType = supStatus === 'suspended' ? 'suspended_superior' : 'inactive_superior'
        visited.add(supProf.id)
        if (currState) {
          currState.excessCreditPassedUp = round2(currState.excessCreditPassedUp + remaining)
        }
        path.push({
          seq,
          agentId: supState.agentId,
          agentCode: supState.sponsorCode,
          agentName: supState.agentName,
          rank: supState.rankSnapshot,
          rankCode: supState.rankCodeSnapshot,
          target: supState.mfaTarget,
          allocationType: 'skipped_inactive',
          status: supStatus,
          applied: 0,
          excessUp: remaining,
        })
        hierarchyIssues.push({
          month: targetMonth,
          year: targetYear,
          policyId: c.policyId,
          policyNumber: c.policyNumber,
          originatingAgentId: originState.agentId,
          agentId: supState.agentId,
          sponsorId: supState.sponsorId,
          issueType,
          affectedCredit: remaining,
          details: { path: [...path], superiorStatus: supStatus },
        })
        const skippedAlloc = buildBaseAllocStep(c, originState, { id: currId, name: currName, code: currCode }, seq, path, {
          recipientAgentId: supState.agentId,
          recipientAgentName: supState.agentName,
          recipientAgentCode: supState.sponsorCode,
          allocationType: 'skipped_inactive',
          incomingCredit: remaining,
          appliedAmount: 0,
          excessPassedUp: remaining,
          unallocatedAmount: 0,
          unallocatedReason: null,
          recipientRankSnapshot: supState.rankSnapshot,
          recipientRankCodeSnapshot: supState.rankCodeSnapshot,
          recipientTargetSnapshot: supState.mfaTarget,
          recipientRewardSnapshot: supState.mfaReward,
          reportingSponsorIdSnapshot: supState.sponsorId,
        })
        pushAlloc(skippedAlloc)
        if (currState) currState.cascadingOutgoing.push(skippedAlloc)

        currId = supState.agentId
        currName = supState.agentName
        currCode = supState.sponsorCode
        currState = null
        currSponsorId = supState.sponsorId
        continue
      }

      if (!supState.applicable || supState.rankSnapshot < 1 || supState.rankSnapshot > 10) {
        recordUnallocated({
          reason: 'no_eligible_mfa_superior',
          extra: {
            recipientRankSnapshot: supState.rankSnapshot,
            recipientRankCodeSnapshot: supState.rankCodeSnapshot,
            reportingSponsorIdSnapshot: supState.agentId,
          },
        })
        break
      }

      if (currState) {
        currState.excessCreditPassedUp = round2(currState.excessCreditPassedUp + remaining)
      }

      visited.add(supState.agentId)
      const supRemTarget = Math.max(0, round2(supState.mfaTarget - supState.totalMfaCredit))
      const applySup = round2(Math.min(remaining, supRemTarget))
      const nextExcess = round2(remaining - applySup)
      const allocType = applySup === 0 && supRemTarget === 0 ? 'pass_through' : 'cascading_from_downline'

      if (applySup > 0) {
        supState.cascadingMfaCreditReceived = round2(supState.cascadingMfaCreditReceived + applySup)
        supState.totalMfaCredit = round2(supState.totalMfaCredit + applySup)
        supState.cascadingInCount += 1
      }

      path.push({
        seq,
        agentId: supState.agentId,
        agentCode: supState.sponsorCode,
        agentName: supState.agentName,
        rank: supState.rankSnapshot,
        rankCode: supState.rankCodeSnapshot,
        target: supState.mfaTarget,
        allocationType: allocType,
        applied: applySup,
        excessUp: nextExcess,
      })

      const stepAlloc = {
        id: `${c.policyId}-seq-${seq}`,
        month: targetMonth,
        year: targetYear,
        policyId: c.policyId,
        policyNumber: c.policyNumber,
        businessDate: c.businessDate,
        planCode: c.planCode,
        planType: c.planType,
        durationYears: c.durationYears,
        originalBusinessAmount: c.businessAmount,
        mfaPercentage: c.mfaPercentage,
        originatingMfaCredit: c.mfaCredit,
        originatingAgentId: originState.agentId,
        originatingAgentName: originState.agentName,
        originatingAgentCode: originState.sponsorCode,
        sourceAgentId: currId,
        sourceAgentName: currName,
        sourceAgentCode: currCode,
        recipientAgentId: supState.agentId,
        recipientAgentName: supState.agentName,
        recipientAgentCode: supState.sponsorCode,
        allocationSequence: seq,
        allocationType: allocType,
        incomingCredit: remaining,
        appliedAmount: applySup,
        excessPassedUp: nextExcess,
        unallocatedAmount: 0,
        unallocatedReason: null,
        recipientRankSnapshot: supState.rankSnapshot,
        recipientRankCodeSnapshot: supState.rankCodeSnapshot,
        recipientTargetSnapshot: supState.mfaTarget,
        recipientRewardSnapshot: supState.mfaReward,
        reportingSponsorIdSnapshot: supState.sponsorId,
        hierarchyPath: [...path],
      }

      pushAlloc(stepAlloc)
      if (currState) currState.cascadingOutgoing.push(stepAlloc)
      supState.cascadingIncoming.push(stepAlloc)

      remaining = nextExcess
      currId = supState.agentId
      currName = supState.agentName
      currCode = supState.sponsorCode
      currState = supState
      currSponsorId = supState.sponsorId
    }
  })

  const byAgentId = {}
  const records = []
  let totalRewardsEarned = 0
  let achievedCount = 0
  let totalCascadedCredit = 0
  let totalUnallocatedCredit = 0

  stateByAgentId.forEach((row) => {
    if (!row.applicable && row.contributionsCount === 0 && row.cascadingInCount === 0) return

    if (row.applicable) {
      row.remainingAmount = Math.max(0, round2(row.mfaTarget - row.totalMfaCredit))
      row.achievementPct = round2((row.totalMfaCredit / row.mfaTarget) * 100)
      row.isQualified = row.totalMfaCredit >= row.mfaTarget
      row.rewardEarned = row.isQualified ? row.mfaReward : 0
      if (row.isQualified) row.status = 'achieved'
      else if (periodKey < currentKey) row.status = 'missed'
      else row.status = 'in_progress'
    } else {
      row.remainingAmount = 0
      row.achievementPct = 0
      row.isQualified = false
      row.rewardEarned = 0
      row.status = 'not_applicable'
    }

    row.contributions.sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    byAgentId[row.agentId] = row
    records.push(row)
    if (row.isQualified) {
      achievedCount += 1
      totalRewardsEarned = round2(totalRewardsEarned + row.rewardEarned)
    }
    totalCascadedCredit = round2(totalCascadedCredit + row.cascadingMfaCreditReceived)
    totalUnallocatedCredit = round2(
      allocations
        .filter((a) => a.allocationType === 'unallocated_excess')
        .reduce((sum, a) => sum + Number(a.unallocatedAmount || 0), 0)
    )
  })

  const trackedCount = records.filter((r) => r.applicable).length

  return {
    month: targetMonth,
    year: targetYear,
    byAgentId,
    records,
    allocations,
    allocationsByPolicy,
    allocationsByAgent,
    hierarchyIssues,
    totalTracked: trackedCount,
    achievedCount,
    notAchievedCount: Math.max(0, trackedCount - achievedCount),
    totalRewardsEarned,
    totalCascadedCredit,
    totalUnallocatedCredit,
    slabs: Object.values(MFA_SLABS),
  }
}

/**
 * Pure mirror evaluator for a single agent & calendar (month, year).
 * Preserves snapshotted (rankSnapshot, mfaTargetSnapshot, mfaRewardSnapshot) when supplied
 * so historical or mid-month records remain invariant across rank promotions.
 * When `allProfiles` / `allPolicies` are passed, executes full hierarchical cascading evaluation.
 */
export function calculateMonthlyMfaForAgent({
  agent,
  policies = [],
  payments = null,
  month,
  year,
  snapshot = null,
  ranksList = DEFAULT_RANKS,
  referenceDate = new Date(),
  allProfiles = null,
  allPolicies = null,
  allPayments = null,
  snapshotsByAgentId = null,
}) {
  const agentId = agent?.id || agent?.uid
  if (Array.isArray(allProfiles) && allProfiles.length > 0) {
    const mergedSnaps = { ...(snapshotsByAgentId || {}) }
    if (agentId && snapshot) mergedSnaps[agentId] = snapshot
    const batch = calculateMonthlyMfaBatch({
      profiles: allProfiles,
      policies: allPolicies || policies,
      payments: allPayments ?? payments,
      month,
      year,
      snapshotsByAgentId: mergedSnaps,
      ranksList,
      referenceDate,
    })
    if (batch.byAgentId[agentId]) {
      return batch.byAgentId[agentId]
    }
  }

  const isAdminAccount = isAdminUser(agent)
  const slab = resolveSlabForAgent(agent, snapshot, ranksList)
  const targetMonth = Number(month)
  const targetYear = Number(year)
  const firstPaymentByPolicy = buildFirstPaymentMap(payments)

  const contributions = agentId && !isAdminAccount
    ? extractQualifyingMonthContributions({
        policies,
        firstPaymentByPolicy,
        targetMonth,
        targetYear,
        isEligibleAgentFn: (aid) => aid === agentId,
      })
    : []

  const rawBusinessTotal = round2(contributions.reduce((s, c) => s + c.businessAmount, 0))
  const ownMfaCreditGenerated = round2(contributions.reduce((s, c) => s + c.mfaCredit, 0))

  const applicable = !isAdminAccount && slab.rank >= 1 && slab.rank <= 10 && slab.mfaTarget > 0 && slab.mfaReward > 0
  const ownMfaCreditApplied = applicable ? round2(Math.min(ownMfaCreditGenerated, slab.mfaTarget)) : 0
  const excessGenerated = round2(Math.max(0, ownMfaCreditGenerated - ownMfaCreditApplied))
  const totalMfaCredit = ownMfaCreditApplied
  const remainingAmount = applicable ? Math.max(0, round2(slab.mfaTarget - totalMfaCredit)) : 0
  const achievementPct = applicable ? round2((totalMfaCredit / slab.mfaTarget) * 100) : 0
  const isQualified = applicable && totalMfaCredit >= slab.mfaTarget
  const rewardEarned = isQualified ? slab.mfaReward : 0

  const periodKey = targetYear * 100 + targetMonth
  const currentKey = getCurrentMonthKey(referenceDate)

  let status = 'not_applicable'
  if (applicable) {
    if (isQualified) status = 'achieved'
    else if (periodKey < currentKey) status = 'missed'
    else status = 'in_progress'
  }

  return {
    agentId,
    month: targetMonth,
    year: targetYear,
    rankSnapshot: slab.rank,
    rankCodeSnapshot: slab.code,
    mfaTarget: slab.mfaTarget,
    mfaReward: slab.mfaReward,
    applicable,
    rawBusinessTotal,
    ownBusinessTotal: rawBusinessTotal,
    ownMfaCreditGenerated,
    ownMfaCreditApplied,
    cascadingMfaCreditReceived: 0,
    totalMfaCredit,
    excessCreditPassedUp: excessGenerated,
    excessUnallocatedCredit: 0,
    remainingAmount,
    achievementPct,
    isQualified,
    rewardEarned,
    status,
    contributionsCount: contributions.length,
    cascadingInCount: 0,
    contributions: contributions.sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
    cascadingIncoming: [],
    cascadingOutgoing: [],
  }
}

/**
 * Evaluate Promotion Quota (separate from MFA).
 */
export function evaluatePromotionEligibility({
  agent,
  policies = [],
  allProfiles = [],
  promotionRules = {},
  ranksList = DEFAULT_RANKS,
}) {
  const currentRank = Number(agent?.rank) || 1
  const nextRankObj = (ranksList || DEFAULT_RANKS).find((r) => Number(r.rank) === currentRank + 1)
  if (!nextRankObj) return null

  const agentId = agent?.id || agent?.uid
  const nextCode = String(nextRankObj.code).toUpperCase()
  const merged = mergePromotionRules(promotionRules)
  const rule = merged[nextCode] || {}

  // Promotion uses lifetime personal BV (RD x 12 annualized; FD lump-sum)
  const lifetimePoliciesBiz = (policies || [])
    .filter((p) => (p.agentId || p.agent_id) === agentId && !['cancelled', 'lapsed'].includes(String(p.status || '').toLowerCase()))
    .reduce((sum, p) => {
      const code = p.planCode || p.type || ''
      const planType = p.planType || ''
      if (isRD(code, planType)) {
        const monthly = Number(p.monthlyAmount ?? p.installmentAmount ?? 0)
        return sum + (monthly > 0 ? monthly * 12 : Number(p.totalPaid || 0))
      }
      return sum + Number(p.fdAmount || p.totalPaid || p.totalAmount || 0)
    }, 0)

  const businessAchieved = Math.max(
    Number(agent?.businessVolume || agent?.business_volume || 0),
    lifetimePoliciesBiz
  )
  const businessTarget = Number(rule.businessTarget) || 0
  const businessMet = businessAchieved >= businessTarget

  const directChildren = (allProfiles || []).filter(
    (u) => (u.sponsorId || u.sponsor_id || u.referredBy) === agentId
  )
  const countAtOrAbove = (rankCode) => {
    if (!rankCode) return 0
    const reqRankNum = (ranksList || DEFAULT_RANKS).find((r) => String(r.code).toUpperCase() === String(rankCode).toUpperCase())?.rank || 0
    if (!reqRankNum) return 0
    return directChildren.filter((child) => (Number(child.rank) || 1) >= reqRankNum).length
  }

  const reqRank = rule.requiredPromotedRank || ''
  const reqCount = Number(rule.requiredPromotedCount) || 0
  const altRank = rule.altRequiredPromotedRank || ''
  const altCount = Number(rule.altRequiredPromotedCount) || 0

  const primaryAchievedCount = countAtOrAbove(reqRank)
  const altAchievedCount = countAtOrAbove(altRank)

  const primaryMet = reqCount > 0 ? primaryAchievedCount >= reqCount : true
  const altMet = altCount > 0 ? altAchievedCount >= altCount : false
  const promoteeMet = reqCount > 0 ? (primaryMet || altMet) : true

  return {
    currentRank,
    nextRank: nextRankObj,
    rule,
    businessAchieved,
    businessTarget,
    businessMet,
    reqRank,
    reqCount,
    primaryAchievedCount,
    altRank,
    altCount,
    altAchievedCount,
    promoteeMet,
    eligible: businessMet && promoteeMet,
  }
}

/**
 * Resolve agent subtree IDs starting at rootId using either snapshot hierarchy
 * (for closed/locked historical periods) or live profile reporting lines.
 */
export function getMfaSubtreeIds(rootId, profiles = [], records = [], useSnapshotHierarchy = false) {
  if (!rootId || rootId === 'all') return null
  const sponsorByAgent = new Map()
  ;(profiles || []).forEach((p) => {
    if (!p?.id) return
    sponsorByAgent.set(p.id, p.sponsorId ?? p.sponsor_id ?? p.referredBy ?? null)
  })
  ;(records || []).forEach((r) => {
    if (!r?.agentId) return
    const hasSnap = ('sponsorIdSnapshot' in r) || ('sponsor_id_snapshot' in r)
    const snapSponsor = r.sponsorIdSnapshot ?? r.sponsor_id_snapshot ?? null
    if (useSnapshotHierarchy && hasSnap) {
      sponsorByAgent.set(r.agentId, snapSponsor)
    } else if (!sponsorByAgent.has(r.agentId)) {
      sponsorByAgent.set(r.agentId, r.sponsorId ?? snapSponsor ?? null)
    }
  })

  const set = new Set([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const curr = queue.shift()
    sponsorByAgent.forEach((sp, agentId) => {
      if (sp === curr && !set.has(agentId)) {
        set.add(agentId)
        queue.push(agentId)
      }
    })
  }
  return set
}

/**
 * Filter MFA monthly summary records by active UI filters.
 */
export function filterMfaRecordsForView({
  records = [],
  subtreeIds = null,
  rankFilter = 'all',
  statusFilter = 'all',
  search = '',
}) {
  const q = String(search || '').trim().toLowerCase()
  return (records || []).filter((r) => {
    if (subtreeIds && !subtreeIds.has(r.agentId)) return false
    if (rankFilter !== 'all' && String(r.rankSnapshot) !== String(rankFilter)) return false
    if (statusFilter === 'achieved' && !r.isQualified) return false
    if (statusFilter === 'not_achieved' && (r.isQualified || !r.applicable)) return false
    if (statusFilter === 'in_progress' && r.status !== 'in_progress') return false
    if (statusFilter === 'missed' && r.status !== 'missed') return false
    if (q) {
      const hay = `${r.agentName || ''} ${r.sponsorCode || ''} ${r.email || ''} ${r.phone || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/**
 * Build and filter policy-level cascading traces consistently with active UI filters.
 */
export function filterPolicyTracesForView({
  allocationsByPolicy = {},
  records = [],
  subtreeIds = null,
  rankFilter = 'all',
  statusFilter = 'all',
  search = '',
}) {
  const q = String(search || '').trim().toLowerCase()
  const hasRankOrStatusFilter = rankFilter !== 'all' || statusFilter !== 'all'
  const structuralRecs = filterMfaRecordsForView({
    records,
    subtreeIds,
    rankFilter,
    statusFilter,
    search: '',
  })
  const allowedStructuralIds = new Set(structuralRecs.map((r) => r.agentId))

  return Object.entries(allocationsByPolicy || {})
    .map(([policyId, steps]) => {
      const ordered = [...(steps || [])].sort((a, b) => a.allocationSequence - b.allocationSequence)
      const first = ordered[0]
      if (!first) return null

      const totalCascaded = ordered
        .filter((s) => s.allocationType === 'cascading_from_downline')
        .reduce((sum, s) => sum + Number(s.appliedAmount || 0), 0)
      const totalUnallocated = ordered
        .filter((s) => s.allocationType === 'unallocated_excess')
        .reduce((sum, s) => sum + Number(s.unallocatedAmount || 0), 0)
      const cascadeHops = ordered.filter((s) => s.allocationType !== 'self_own')

      return {
        policyId,
        policyNumber: first.policyNumber,
        businessDate: first.businessDate,
        planCode: first.planCode,
        durationYears: first.durationYears,
        mfaPercentage: first.mfaPercentage,
        originalBusinessAmount: first.originalBusinessAmount,
        originatingMfaCredit: first.originatingMfaCredit,
        originatingAgentId: first.originatingAgentId,
        originatingAgentName: first.originatingAgentName,
        originatingAgentCode: first.originatingAgentCode,
        selfApplied: first.appliedAmount,
        totalCascaded,
        totalUnallocated,
        hasCascade: cascadeHops.length > 0,
        steps: ordered,
      }
    })
    .filter(Boolean)
    .filter((t) => {
      if (subtreeIds) {
        const touchesSubtree = t.steps.some(
          (s) => subtreeIds.has(s.originatingAgentId) || (s.recipientAgentId && subtreeIds.has(s.recipientAgentId))
        )
        if (!touchesSubtree) return false
      }
      if (hasRankOrStatusFilter) {
        const touchesAllowed = t.steps.some(
          (s) => allowedStructuralIds.has(s.originatingAgentId) || (s.recipientAgentId && allowedStructuralIds.has(s.recipientAgentId))
        )
        if (!touchesAllowed) return false
      }
      if (q) {
        const hay = [
          t.policyNumber,
          t.originatingAgentName,
          t.originatingAgentCode,
          ...t.steps.map((s) => `${s.recipientAgentName || ''} ${s.recipientAgentCode || ''} ${s.sourceAgentName || ''} ${s.sourceAgentCode || ''}`),
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const dateCmp = String(b.businessDate).localeCompare(String(a.businessDate))
      if (dateCmp !== 0) return dateCmp
      return String(a.policyNumber || '').localeCompare(String(b.policyNumber || ''))
    })
}

/**
 * Build Sheets 1–3 data arrays consistently from the active filtered view.
 */
export function buildMfaExcelSheetsData({
  filteredRecords = [],
  contribByAgent = {},
  filteredPolicyTraces = [],
  monthLabel = '',
  allocationLabels = {},
}) {
  const summaryRows = (filteredRecords || []).map((r, i) => ({
    'Sr. No.': i + 1,
    'Agent Code': r.sponsorCode || '—',
    'Agent Name': r.agentName || '—',
    'Rank (Snapshot)': r.rankCodeSnapshot,
    'Month': monthLabel,
    'MFA Target (₹)': r.mfaTarget,
    'Own Business Generated Credit (₹)': r.ownMfaCreditGenerated ?? r.totalMfaCredit,
    'Own MFA Credit Applied (₹)': r.ownMfaCreditApplied ?? r.totalMfaCredit,
    'Cascading Credit Received (₹)': r.cascadingMfaCreditReceived ?? 0,
    'Total MFA Achieved (₹)': r.totalMfaCredit,
    'Remaining (₹)': r.remainingAmount,
    'Excess Passed Upward (₹)': r.excessCreditPassedUp ?? 0,
    'Unallocated Excess (₹)': r.excessUnallocatedCredit ?? 0,
    'Achievement %': r.achievementPct,
    'Rank Reward (₹)': r.mfaReward,
    'Status': r.status,
    'Reward Earned (₹)': r.rewardEarned,
    'Qualifying Policies': r.contributionsCount,
  }))

  const contribRows = []
  ;(filteredRecords || []).forEach((r) => {
    const list = contribByAgent?.[r.agentId] || []
    list.forEach((c) => {
      contribRows.push({
        'Agent Code': r.sponsorCode || '—',
        'Agent Name': r.agentName || '—',
        'Policy Number': c.policyNumber,
        'Customer Name': c.customerName || '—',
        'Plan': c.planCode,
        'Duration (Years)': c.durationYears,
        'Business Date': c.businessDate,
        'Business Amount (₹)': c.businessAmount,
        'MFA %': c.mfaPercentage,
        'Qualifying MFA Credit (₹)': c.mfaCredit,
        'Applied to Own Target (₹)': c.appliedToSelf ?? c.mfaCredit,
        'Excess Passed Upward (₹)': c.excessPassedUp ?? 0,
      })
    })
  })

  const filteredAllocations = (filteredPolicyTraces || []).flatMap((t) => t.steps || [])
  const cascadeRows = filteredAllocations.map((a) => ({
    'Policy Number': a.policyNumber,
    'Business Date': a.businessDate,
    'Step #': a.allocationSequence,
    'Allocation Type': allocationLabels[a.allocationType] || a.allocationType,
    'Originating Agent': `${a.originatingAgentName} (${a.originatingAgentCode})`,
    'Source Downline': `${a.sourceAgentName} (${a.sourceAgentCode})`,
    'Recipient Agent': a.recipientAgentName ? `${a.recipientAgentName} (${a.recipientAgentCode})` : 'Hierarchy Boundary',
    'Recipient Rank': a.recipientRankCodeSnapshot || '—',
    'Target Snapshot (₹)': a.recipientTargetSnapshot,
    'Incoming Credit (₹)': a.incomingCredit,
    'Applied Amount (₹)': a.appliedAmount,
    'Excess Passed Up (₹)': a.excessPassedUp,
    'Unallocated (₹)': a.unallocatedAmount,
    'Unallocated Reason': a.unallocatedReason || '',
  }))

  return { summaryRows, contribRows, cascadeRows }
}
