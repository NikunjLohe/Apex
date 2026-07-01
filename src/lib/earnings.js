// ============================================================================
// Member earnings computations (pure). Operates on already-fetched data so the
// UI controls the Firestore reads.
// ============================================================================
import {
  MDA, MFA, PB_TARGET, PB_AMOUNT, TA, FD_PENSION,
  PROMO_TARGET, CMD_AWARD_TARGET, CMD_AWARD_AMOUNT, CMD_RULES,
  planIndex, isRD, planYears,
} from '../data/compensation'
import { toDate } from '../utils/format'
import { startOfMonth } from 'date-fns'

/** MDA on a single payment based on the agent rank, plan year-band, and plan index. */
/** MDA on a single payment based on the agent rank, plan year-band, and plan index. */
function mdaForPayment(rankIdx, payment, plan, mdaConfig) {
  if (!plan) return 0
  const idx = planIndex(plan.type)
  const inYear1 = (payment.installmentNumber || 1) <= 12
  const mdaTable = mdaConfig || MDA
  const rate = inYear1 ? mdaTable[rankIdx]?.y1?.[idx] : mdaTable[rankIdx]?.y2?.[idx]
  return (payment.amount || 0) * (rate || 0)
}

/**
 * Compute the agent's earnings dashboard model.
 * @param {number} rank
 * @param {Array}  ownPlans     plans where agentId == me
 * @param {Array}  payments     all payments by me (used for month BV + MDA)
 * @param {Array}  downlinePlans plans enrolled by my direct downline
 * @param {Object} ranksConfig   optional dynamic ranks configuration
 */
export function computeEarnings({ rank, ownPlans = [], payments = [], downlinePlans = [], ranksConfig }) {
  const mdaTable = ranksConfig ? ranksConfig.MDA : MDA
  const mfaTable = ranksConfig ? ranksConfig.MFA : MFA
  const taTable = ranksConfig ? ranksConfig.TA : TA
  const pbTargetTable = ranksConfig ? ranksConfig.PB_TARGET : PB_TARGET
  const pbAmountTable = ranksConfig ? ranksConfig.PB_AMOUNT : PB_AMOUNT
  const fdPensionTable = ranksConfig ? ranksConfig.FD_PENSION : FD_PENSION
  const promoTargetTable = ranksConfig ? ranksConfig.PROMO_TARGET : PROMO_TARGET
  const cmdAwardTargetTable = ranksConfig ? ranksConfig.CMD_AWARD_TARGET : CMD_AWARD_TARGET
  const cmdAwardAmountTable = ranksConfig ? ranksConfig.CMD_AWARD_AMOUNT : CMD_AWARD_AMOUNT
  const totalRanksCount = ranksConfig ? ranksConfig.RANKS.length : 18

  const rankIdx = (Number(rank) || 1) - 1
  const month0 = startOfMonth(new Date())
  const planById = {}
  ownPlans.forEach((p) => { planById[p.id] = p })

  const monthPayments = payments.filter((p) => toDate(p.paidDate) >= month0)
  const monthBV = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const lifetimeBV = payments.reduce((s, p) => s + (p.amount || 0), 0)

  // MDA this month
  const mda = monthPayments.reduce((s, p) => s + mdaForPayment(rankIdx, p, planById[p.planId], mdaTable), 0)

  // MFA / TA flat
  const mfa = mfaTable[rankIdx] || 0
  const ta = taTable[rankIdx] || 0

  // Performance bonus
  const pbTarget = pbTargetTable[rankIdx] || 0
  const pbAmount = pbAmountTable[rankIdx] || 0
  const pbAchieved = pbTarget > 0 && monthBV >= pbTarget
  const pbProgress = pbTarget > 0 ? Math.min(100, (monthBV / pbTarget) * 100) : 0

  // FD / Pension accrual (approx): lifetime collected × rank's representative FD rate
  const fdRate = fdPensionTable[rankIdx]?.[2] || 0 // 3Y slab as representative
  const fdAccrual = lifetimeBV * fdRate

  // Promotion progress (lifetime BV vs next-rank target)
  const promoTarget = rankIdx < totalRanksCount - 1 ? promoTargetTable[rankIdx + 1] || 0 : 0
  const promoProgress = promoTarget > 0 ? Math.min(100, (lifetimeBV / promoTarget) * 100) : 100

  // ---- CMD weighted BV ----
  const weightPlans = (plans) =>
    plans.reduce((sum, p) => {
      const collected = p.totalPaid || 0
      if (isRD(p.type)) {
        if ((p.paidInstallments || 0) < CMD_RULES.minInstallments) return sum // need 12 installments
        const w = CMD_RULES.weightByYear[planYears(p.type)] ?? 1
        return sum + collected * w
      }
      return sum + collected // FD full value
    }, 0)

  const mainLeg = weightPlans(ownPlans)
  const otherLegs = weightPlans(downlinePlans)
  const weightedTotal = mainLeg + otherLegs
  const cmdTarget = cmdAwardTargetTable[rankIdx] || 0
  const cmdAmount = cmdAwardAmountTable[rankIdx] || 0
  const cmdProgress = cmdTarget > 0 ? Math.min(100, (weightedTotal / cmdTarget) * 100) : 0
  // qualifying: 80% from main, 20% min from others
  const mainOk = weightedTotal > 0 && mainLeg >= weightedTotal * CMD_RULES.mainLegShare * 0.999
  const otherOk = weightedTotal > 0 && otherLegs >= cmdTarget * CMD_RULES.otherLegsMin

  return {
    rank,
    monthBV,
    lifetimeBV,
    mda,
    mfa,
    ta,
    pb: { target: pbTarget, amount: pbAmount, achieved: pbAchieved, progress: pbProgress, current: monthBV },
    fdAccrual,
    promo: { target: promoTarget, progress: promoProgress },
    cmd: {
      mainLeg, otherLegs, weightedTotal,
      target: cmdTarget, amount: cmdAmount, progress: cmdProgress,
      mainOk, otherOk,
      qualified: weightedTotal >= cmdTarget && mainOk && otherOk,
    },
    totalThisMonth: mda + mfa + ta + (pbAchieved ? pbAmount : 0),
  }
}
