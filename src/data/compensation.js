// ============================================================================
// APEX compensation data. All tables indexed by [rank-1] (0–17).
// RD plan index 0–4 maps to 1Y/2Y/3Y/4Y/5Y.
// ============================================================================

// Hardcoded commission tables removed.
// The system now uses the dynamic Commission Master configuration stored in Firestore.

// ---- Plan catalogue ----
// planIndex 0–4 = 1Y..5Y. type prefix RD or FD.
export const RD_PLANS = ['RD-1Y', 'RD-2Y', 'RD-3Y', 'RD-4Y', 'RD-5Y']
export const FD_PLANS = ['FD-1Y', 'FD-2Y', 'FD-3Y', 'FD-4Y', 'FD-5Y']
export const PENS_PLANS = ['PENS1Y', 'PENS2Y', 'PENS3Y', 'PENS4Y', 'PENS5Y']
export const ALL_PLANS = [...RD_PLANS, ...FD_PLANS, ...PENS_PLANS]

/** Years for a plan type string e.g. 'RD-3Y' -> 3, 'PENS5Y' -> 5. Returns null if missing/generic PENS. */
export const planYears = (type) => {
  const match = String(type || '').match(/(\d)Y$/i)
  return match ? Number(match[1]) : null
}

/** plan index 0–4 from type */
export const planIndex = (type) => {
  const yrs = planYears(type)
  return yrs ? yrs - 1 : 0
}

/** true if RD */
export const isRD = (type, planType) => {
  const typeUpper = String(type || '').toUpperCase()
  if (typeUpper.startsWith('RD')) return true
  if (planType != null && String(planType).toUpperCase() === 'RD') return true
  return false
}

/** true if Pension */
export const isPension = (type, planType) => {
  const typeUpper = String(type || '').toUpperCase()
  if (typeUpper === 'PENS' || typeUpper.startsWith('PENS')) return true
  if (planType != null && String(planType).toUpperCase() === 'PENS') return true
  return false
}

/** Get explicit policy year for Pension (1..5). Returns null if missing or generic PENS without explicit year. */
export const getPensionPolicyYear = (type, explicitYear) => {
  if (explicitYear !== undefined && explicitYear !== null && explicitYear !== '') {
    const yr = Number(explicitYear)
    if (!isNaN(yr) && yr >= 1 && yr <= 5) return yr
  }
  const match = String(type || '').match(/^PENS([1-5])Y$/i)
  return match ? Number(match[1]) : null
}
