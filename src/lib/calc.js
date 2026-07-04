// ============================================================================
// Plan maturity & schedule calculations (pure functions).
// ============================================================================
import { addMonths, addYears } from 'date-fns'
import { planYears, planIndex, isRD } from '../data/compensation'

/**
 * Compute plan derived fields at enrollment.
 * For RD: monthly deposits over (years*12) installments.
 * For FD: single lump sum held for `years`.
 * Maturity uses the FD_PENSION %% (per annum, applied per year) as the growth
 * rate at a baseline rank index 0 (AO) — the customer-facing savings rate.
 */
export function computePlan({ type, monthlyAmount = 0, fdAmount = 0, startDate = new Date(), rateRankIndex = 0, ranksConfig }) {
  const years = planYears(type)
  const idx = planIndex(type)
  const fdPensionTable = ranksConfig?.FD_PENSION || []
  const rate = fdPensionTable[rateRankIndex]?.[idx] ?? 0 // per-annum rate (decimal)
  const start = startDate instanceof Date ? startDate : new Date(startDate)
  const maturityDate = addYears(start, years)

  if (isRD(type)) {
    const totalInstallments = years * 12
    const principal = monthlyAmount * totalInstallments
    // Simple-interest style growth on average balance for an RD.
    // Average deposited balance ≈ principal * (n+1)/(2n); interest accrues yearly.
    const avgBalance = (monthlyAmount * (totalInstallments + 1)) / 2
    const interest = avgBalance * rate * years
    const maturityAmount = Math.round(principal + interest)
    return {
      type,
      years,
      totalInstallments,
      monthlyAmount,
      fdAmount: 0,
      startDate: start,
      maturityDate,
      nextDueDate: addMonths(start, 1),
      maturityAmount,
      ratePct: rate * 100,
    }
  }

  // FD: lump sum compounded annually.
  const maturityAmount = Math.round(fdAmount * Math.pow(1 + rate, years))
  return {
    type,
    years,
    totalInstallments: 1,
    monthlyAmount: 0,
    fdAmount,
    startDate: start,
    maturityDate,
    nextDueDate: maturityDate,
    maturityAmount,
    ratePct: rate * 100,
  }
}

/** Build the full installment schedule for an RD plan. */
export function buildSchedule({ totalInstallments, monthlyAmount, startDate }) {
  const start = startDate?.toDate ? startDate.toDate() : new Date(startDate)
  const rows = []
  for (let i = 1; i <= totalInstallments; i += 1) {
    rows.push({
      installmentNumber: i,
      dueDate: addMonths(start, i - 1),
      amount: monthlyAmount,
    })
  }
  return rows
}
