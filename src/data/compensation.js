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

/** Resolve total term duration (1..5+ years) for any RD, FD, or Pension policy object/code. */
export function getPolicyTermYears(planOrCode, explicitYear = null) {
  if (typeof planOrCode === 'string') {
    const fromCode = planYears(planOrCode) || getPensionPolicyYear(planOrCode, explicitYear)
    return fromCode || (Number(explicitYear) > 0 ? Number(explicitYear) : 1)
  }
  const p = planOrCode || {}
  const code = p.planCode || p.type || ''
  const planType = p.planType || ''
  if (isPension(code, planType)) {
    return getPensionPolicyYear(code, explicitYear ?? p.policyYear ?? p.duration) || 1
  }
  const parsed = planYears(code)
  if (parsed) return parsed
  if (Number(p.totalInstallments) > 1 && isRD(code, planType)) {
    return Math.max(1, Math.round(Number(p.totalInstallments) / 12))
  }
  return Number(explicitYear ?? p.policyYear ?? p.duration) || 1
}

/**
 * Resolve active policy year for commission lookup given a policy and installment number.
 * - RD policies advance every 12 installments (1-12 -> Y1, 13-24 -> Y2, ..., capped at term).
 * - FD / Pension policies use the plan term year (single upfront deposit).
 */
export function getActivePolicyYear(planOrCode, installmentNumber = 1) {
  const termYears = getPolicyTermYears(planOrCode)
  const code = typeof planOrCode === 'string' ? planOrCode : (planOrCode?.planCode || planOrCode?.type || '')
  const planType = typeof planOrCode === 'object' ? planOrCode?.planType : null

  if (isRD(code, planType)) {
    const inst = Math.max(1, Number(installmentNumber) || 1)
    return Math.min(termYears, Math.ceil(inst / 12))
  }
  return termYears
}

/** Standalone Rank-Based Monthly MFA (Monthly Field Allowance) Slabs: Ranks 1–10 only. */
export const MFA_SLABS = {
  1:  { rank: 1,  code: 'AO',  name: 'Administrative Officer',    mfaTarget: 50000,   mfaReward: 3000 },
  2:  { rank: 2,  code: 'AM',  name: 'Assistant Manager',         mfaTarget: 350000,  mfaReward: 5000 },
  3:  { rank: 3,  code: 'ADM', name: 'Admin. Division Manager',   mfaTarget: 550000,  mfaReward: 8000 },
  4:  { rank: 4,  code: 'DM',  name: 'Division Manager',          mfaTarget: 800000,  mfaReward: 10000 },
  5:  { rank: 5,  code: 'SDM', name: 'Senior Division Manager',   mfaTarget: 1200000, mfaReward: 12000 },
  6:  { rank: 6,  code: 'CM',  name: 'Chief Manager',             mfaTarget: 1800000, mfaReward: 15000 },
  7:  { rank: 7,  code: 'AGM', name: 'Assistant General Manager', mfaTarget: 2500000, mfaReward: 18000 },
  8:  { rank: 8,  code: 'GM',  name: 'General Manager',           mfaTarget: 3200000, mfaReward: 20000 },
  9:  { rank: 9,  code: 'ZM',  name: 'Zonal Manager',             mfaTarget: 4000000, mfaReward: 25000 },
  10: { rank: 10, code: 'ED',  name: 'Executive Director',        mfaTarget: 5000000, mfaReward: 30000 },
}

export function getMfaSlabForRank(rankOrCode) {
  if (rankOrCode == null) return { rank: 1, code: 'AO', mfaTarget: 50000, mfaReward: 3000, applicable: true }
  const asNum = Number(rankOrCode)
  if (!isNaN(asNum) && asNum > 0) {
    const slab = MFA_SLABS[asNum]
    if (!slab) return { rank: asNum, code: '', mfaTarget: 0, mfaReward: 0, applicable: false }
    return { ...slab, applicable: true }
  }
  const upper = String(rankOrCode).toUpperCase().trim()
  const match = Object.values(MFA_SLABS).find((s) => s.code === upper)
  return match ? { ...match, applicable: true } : { rank: 0, code: upper, mfaTarget: 0, mfaReward: 0, applicable: false }
}

/** MFA duration credit weights by plan duration (1Y=25%, 2Y=50%, 3Y+=100%). */
export const MFA_TERM_WEIGHTS = {
  1: 0.25,
  2: 0.5,
  3: 1.0,
  4: 1.0,
  5: 1.0,
}

export function getMfaTermWeight(termYears) {
  const yrs = Math.max(1, Math.round(Number(termYears) || 1))
  if (yrs >= 3) return 1.0
  return MFA_TERM_WEIGHTS[yrs] ?? 0.25
}

/** Official Promotion Quota and Monthly Incentive Structure (Synced with Apex Reward Chart).
 * Ranks 1–10 carry Monthly MFA Targets & Rewards; Ranks 11–18 have no MFA (0 / 0).
 */
export const DEFAULT_PROMOTION_RULES = {
  AO:  { businessTarget: 50000,   requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 3000,  mfaTarget: 50000,   pb: 0,     pbTarget: 0,        cmd: 3000,    cmdTarget: 300000 },
  AM:  { businessTarget: 150000,  requiredPromotedRank: 'AO',  requiredPromotedCount: 3, promoteeLabel: '3 promoted AO',        mfa: 5000,  mfaTarget: 350000,  pb: 0,     pbTarget: 0,        cmd: 9000,    cmdTarget: 900000 },
  ADM: { businessTarget: 300000,  requiredPromotedRank: 'AM',  requiredPromotedCount: 2, altRequiredPromotedRank: 'AO', altRequiredPromotedCount: 6, promoteeLabel: '2 pro AM / 6 pro AO', mfa: 8000, mfaTarget: 550000, pb: 0, pbTarget: 0, cmd: 15000, cmdTarget: 1500000 },
  DM:  { businessTarget: 500000,  requiredPromotedRank: 'ADM', requiredPromotedCount: 2, promoteeLabel: '2 ADM promoted',       mfa: 10000, mfaTarget: 800000,  pb: 3000,  pbTarget: 200000,   cmd: 25000,   cmdTarget: 2500000 },
  SDM: { businessTarget: 750000,  requiredPromotedRank: 'DM',  requiredPromotedCount: 2, promoteeLabel: '2 DM promoted',        mfa: 12000, mfaTarget: 1200000, pb: 4000,  pbTarget: 500000,   cmd: 40000,   cmdTarget: 4000000 },
  CM:  { businessTarget: 1500000, requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 15000, mfaTarget: 1800000, pb: 6000,  pbTarget: 800000,   cmd: 60000,   cmdTarget: 6000000 },
  AGM: { businessTarget: 2000000, requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 18000, mfaTarget: 2500000, pb: 7000,  pbTarget: 1000000,  cmd: 80000,   cmdTarget: 8000000 },
  GM:  { businessTarget: 3000000, requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 20000, mfaTarget: 3200000, pb: 8000,  pbTarget: 1500000,  cmd: 100000,  cmdTarget: 10000000 },
  ZM:  { businessTarget: 4500000, requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 25000, mfaTarget: 4000000, pb: 9000,  pbTarget: 2000000,  cmd: 150000,  cmdTarget: 15000000 },
  ED:  { businessTarget: 6000000, requiredPromotedRank: '',    requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 30000, mfaTarget: 5000000, pb: 10000, pbTarget: 3000000,  cmd: 200000,  cmdTarget: 20000000 },
  SED: { businessTarget: 7500000,  requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 15000, pbTarget: 4000000,  cmd: 225000,  cmdTarget: 30000000 },
  MD:  { businessTarget: 9000000,  requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 20000, pbTarget: 5000000,  cmd: 300000,  cmdTarget: 40000000 },
  CMD: { businessTarget: 12000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 25000, pbTarget: 6000000,  cmd: 412500,  cmdTarget: 55000000 },
  AVP: { businessTarget: 15000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 32500, pbTarget: 7500000,  cmd: 525000,  cmdTarget: 70000000 },
  VP:  { businessTarget: 18000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 40000, pbTarget: 9000000,  cmd: 675000,  cmdTarget: 90000000 },
  SVP: { businessTarget: 21000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 50000, pbTarget: 10500000, cmd: 550000,  cmdTarget: 110000000 },
  EVP: { businessTarget: 25000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 60000, pbTarget: 12000000, cmd: 750000,  cmdTarget: 150000000 },
  MGD: { businessTarget: 30000000, requiredPromotedRank: '',   requiredPromotedCount: 0, promoteeLabel: '—',                    mfa: 0,     mfaTarget: 0,       pb: 75000, pbTarget: 13500000, cmd: 1000000, cmdTarget: 200000000 },
}
