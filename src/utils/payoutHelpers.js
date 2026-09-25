/**
 * Canonical Payout Field Resolution Helpers
 *
 * Provides a unified resolution precedence across all UI components, export functions,
 * and summary metrics. Canonical fields (set by calculation engines/reconciliation scripts)
 * take strict precedence over legacy alias fields, while preserving legitimate 0 values via
 * nullish coalescing (??).
 */

/**
 * Gross Commission Resolution:
 * Precedence: grossAmount ?? grossCommission ?? totalAmount ?? 0
 */
export function getPayoutGross(payout) {
  if (!payout) return 0
  return payout.grossAmount ?? payout.grossCommission ?? payout.totalAmount ?? 0
}

/**
 * TDS Resolution:
 * Precedence: tdsAmount ?? tds ?? 0
 */
export function getPayoutTds(payout) {
  if (!payout) return 0
  return payout.tdsAmount ?? payout.tds ?? 0
}

/**
 * Admin Charge Resolution:
 * Precedence: adminCharge ?? adminFee ?? 0
 */
export function getPayoutAdminCharge(payout) {
  if (!payout) return 0
  return payout.adminCharge ?? payout.adminFee ?? 0
}

/**
 * Net Payable Resolution:
 * Precedence: netAmount ?? netPayable ?? amount ?? totalAmount ?? 0
 */
export function getPayoutNet(payout) {
  if (!payout) return 0
  return payout.netAmount ?? payout.netPayable ?? payout.amount ?? payout.totalAmount ?? 0
}
