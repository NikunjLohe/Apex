// ============================================================================
// Earnings shaping helpers — normalize Firestore docs into a consistent
// breakdown object used across the dashboard, earnings page, and charts.
// ============================================================================

import { calculateEarnings } from './calculator'

/** Normalize a stored `earnings/{uid}/monthly/{key}` doc to a breakdown shape. */
export function normalizeEarningsDoc(doc) {
  if (!doc) return null
  const mda = doc.MDA ?? 0
  const fd = doc.FD ?? 0
  const mfa = doc.MFA ?? 0
  const pb = doc.PB ?? 0
  const ta = doc.TA ?? 0
  return {
    mda,
    fd,
    mfa,
    pb,
    ta,
    total: doc.totalEarnings ?? mda + fd + mfa + pb + ta,
    businessVolume: doc.businessVolume ?? 0,
    rdPlan: doc.rdPlan ?? '1Y',
    stored: true,
  }
}

/** Build a breakdown for a month, falling back to a live calc when unstored. */
export function breakdownForMonth({ doc, rankId, businessVolume = 0, rdPlan = '1Y' }) {
  const normalized = normalizeEarningsDoc(doc)
  if (normalized) return normalized
  const e = calculateEarnings({ rankId, businessVolume, rdPlan })
  return {
    mda: e.mda,
    fd: e.fd,
    mfa: e.mfa,
    pb: e.pb,
    ta: e.ta,
    total: e.total,
    businessVolume,
    rdPlan,
    stored: false,
  }
}

/** Component metadata for rendering breakdown rows/legends consistently. */
export const EARNING_COMPONENTS = [
  { key: 'mda', label: 'MDA', full: 'Marketing Development Allowance', color: '#F59E0B' },
  { key: 'fd', label: 'FD', full: 'FD / Pension', color: '#10B981' },
  { key: 'mfa', label: 'MFA', full: 'Monthly Field Allowance', color: '#60A5FA' },
  { key: 'pb', label: 'PB', full: 'Performance Bonus', color: '#FBBF24' },
  { key: 'ta', label: 'TA', full: 'Travel Allowance', color: '#A78BFA' },
]
