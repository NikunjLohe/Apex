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

function getCurrentMonthKey(refDate = new Date()) {
  return refDate.getFullYear() * 100 + (refDate.getMonth() + 1)
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

/**
 * Pure mirror evaluator for a single agent & calendar (month, year).
 * Preserves snapshotted (rankSnapshot, mfaTargetSnapshot, mfaRewardSnapshot) when supplied
 * so historical or mid-month records remain invariant across rank promotions.
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
}) {
  const agentId = agent?.id || agent?.uid
  const currentRank = Number(agent?.rank) || 1
  const rankMeta = (ranksList || DEFAULT_RANKS).find((r) => Number(r.rank) === currentRank)
  const isAdminAccount = Boolean(
    agent?.isSuperAdmin ||
      agent?.is_super_admin ||
      agent?.isAdmin ||
      agent?.is_admin ||
      agent?.role === 'super_admin' ||
      agent?.role === 'admin'
  )

  const slab = snapshot
    ? {
        rank: Number(snapshot.rankSnapshot ?? snapshot.rank_snapshot ?? currentRank),
        code: String(snapshot.rankCodeSnapshot ?? snapshot.rank_code_snapshot ?? rankMeta?.code ?? 'AO').toUpperCase(),
        mfaTarget: Number(snapshot.mfaTargetSnapshot ?? snapshot.mfa_target_snapshot ?? 0),
        mfaReward: Number(snapshot.mfaRewardSnapshot ?? snapshot.mfa_reward_snapshot ?? 0),
      }
    : (() => {
        const s = getMfaSlabForRank(currentRank)
        return {
          rank: s.rank,
          code: s.code || String(rankMeta?.code || 'AO').toUpperCase(),
          mfaTarget: isAdminAccount || !s.applicable ? 0 : s.mfaTarget,
          mfaReward: isAdminAccount || !s.applicable ? 0 : s.mfaReward,
        }
      })()

  const targetMonth = Number(month)
  const targetYear = Number(year)

  // Map earliest completed payment per policy_id if payments are supplied
  const firstPaymentByPolicy = new Map()
  if (Array.isArray(payments)) {
    const sorted = [...payments]
      .filter((pay) => String(pay?.status || 'completed').toLowerCase() === 'completed')
      .sort((a, b) => (Number(a.installmentNumber || 1) - Number(b.installmentNumber || 1)))
    sorted.forEach((pay) => {
      const pid = pay.policyId || pay.policy_id
      if (pid && !firstPaymentByPolicy.has(pid)) {
        firstPaymentByPolicy.set(pid, pay)
      }
    })
  }

  let rawBusinessTotal = 0
  let totalMfaCredit = 0
  const contributions = []
  const seenPolicyIds = new Set()

  if (agentId && !isAdminAccount) {
    const policyList = policies || []
    policyList.forEach((p) => {
      if (!p || !p.id) return
      if (seenPolicyIds.has(p.id)) return // Prevent double counting
      seenPolicyIds.add(p.id)

      const polAgentId = p.agentId || p.agent_id
      if (polAgentId !== agentId) return

      const statusStr = String(p.status || 'active').toLowerCase()
      if (statusStr !== 'active' && statusStr !== 'matured') return

      const firstPay = firstPaymentByPolicy.get(p.id) || null
      // Respect business collection/payment integrity when payments or counters indicate collected status
      const hasValidPayment =
        Boolean(firstPay) ||
        Number(p.paidInstallments ?? p.paid_installments ?? 0) >= 1 ||
        Number(p.totalPaid ?? p.total_paid ?? 0) > 0
      if (!hasValidPayment) return

      const bizDate = parseMonthYear(firstPay?.paidDate || p.startDate || p.start_date || p.createdAt || p.created_at)
      if (!bizDate || bizDate.month !== targetMonth || bizDate.year !== targetYear) return

      const businessAmount = getPolicyMfaBusinessAmount(p, firstPay)
      if (businessAmount <= 0) return

      const durationYears = getPolicyTermYears(p)
      const mfaPercentage = getMfaPercentageForDuration(durationYears)
      const mfaCredit = Number(((businessAmount * mfaPercentage) / 100).toFixed(2))

      rawBusinessTotal += businessAmount
      totalMfaCredit += mfaCredit

      contributions.push({
        policyId: p.id,
        policyNumber: p.policyNumber || p.planAccountNumber || p.id,
        customerId: p.customerId || p.customer_id || null,
        customerName: p.customerName || '—',
        planCode: String(p.planCode || p.type || '').toUpperCase(),
        planType: String(p.planType || (isRD(p.planCode || p.type, p.planType) ? 'RD' : 'FD')).toUpperCase(),
        durationYears,
        businessDate: bizDate.dateStr,
        month: targetMonth,
        year: targetYear,
        businessAmount: Number(businessAmount.toFixed(2)),
        mfaPercentage,
        mfaCredit,
      })
    })
  }

  rawBusinessTotal = Number(rawBusinessTotal.toFixed(2))
  totalMfaCredit = Number(totalMfaCredit.toFixed(2))

  const applicable = !isAdminAccount && slab.mfaTarget > 0 && slab.mfaReward > 0
  const remainingAmount = applicable ? Math.max(0, Number((slab.mfaTarget - totalMfaCredit).toFixed(2))) : 0
  const achievementPct = applicable ? Number(((totalMfaCredit / slab.mfaTarget) * 100).toFixed(2)) : 0
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
    totalMfaCredit,
    remainingAmount,
    achievementPct,
    isQualified,
    rewardEarned,
    status,
    contributionsCount: contributions.length,
    contributions: contributions.sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
  }
}

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
  const byAgentId = {}
  const records = []
  let totalRewardsEarned = 0
  let achievedCount = 0

  ;(profiles || []).forEach((agent) => {
    if (!agent?.id) return
    if (agent.isSuperAdmin || agent.is_super_admin || agent.isAdmin || agent.is_admin || agent.role === 'admin' || agent.role === 'super_admin') {
      return
    }
    const snap = snapshotsByAgentId?.[agent.id] || null
    const evalRec = calculateMonthlyMfaForAgent({
      agent,
      policies,
      payments,
      month,
      year,
      snapshot: snap,
      ranksList,
      referenceDate,
    })

    if (!evalRec.applicable && evalRec.contributionsCount === 0) return

    const row = {
      ...evalRec,
      agentName: agent.name || '—',
      sponsorCode: agent.sponsorCode || agent.sponsor_code || '—',
      email: agent.email || '',
      phone: agent.phone || '',
      currentRank: Number(agent.rank) || 1,
      agentStatus: agent.status || 'active',
    }
    byAgentId[agent.id] = row
    records.push(row)
    if (row.isQualified) {
      achievedCount += 1
      totalRewardsEarned += row.rewardEarned
    }
  })

  return {
    month: Number(month),
    year: Number(year),
    byAgentId,
    records,
    totalTracked: records.filter((r) => r.applicable).length,
    achievedCount,
    notAchievedCount: Math.max(0, records.filter((r) => r.applicable).length - achievedCount),
    totalRewardsEarned: Number(totalRewardsEarned.toFixed(2)),
    slabs: Object.values(MFA_SLABS),
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
