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
export const ALL_PLANS = [...RD_PLANS, ...FD_PLANS]

/** Years for a plan type string e.g. 'RD-3Y' -> 3 */
export const planYears = (type) => Number(String(type).match(/(\d)Y$/)?.[1] || 1)
/** plan index 0–4 from type */
export const planIndex = (type) => planYears(type) - 1
/** true if RD */
export const isRD = (type, planType) => {
  if (planType != null) return planType === 'RD'
  return String(type || '').toUpperCase().startsWith('RD')
}
