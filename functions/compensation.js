// ============================================================================
// Compensation tables + calculation engine (CommonJS mirror of src/data + utils)
// ----------------------------------------------------------------------------
// Kept in sync with the client so server-side payout calculations match what
// members see. If you change rates in src/data/ranks.js, mirror them here.
// ============================================================================

const RD_PLANS = ['1Y', '2Y', '3Y', '4Y', '5Y']

const RANKS = [
  { level: 1, id: 'AO' }, { level: 2, id: 'AM' }, { level: 3, id: 'ADM' },
  { level: 4, id: 'DM' }, { level: 5, id: 'SDM' }, { level: 6, id: 'CM' },
  { level: 7, id: 'AGM' }, { level: 8, id: 'GM' }, { level: 9, id: 'ZM' },
  { level: 10, id: 'ED' }, { level: 11, id: 'SED' }, { level: 12, id: 'MD_MKT' },
  { level: 13, id: 'CMD' }, { level: 14, id: 'AVP' }, { level: 15, id: 'VP' },
  { level: 16, id: 'SVP' }, { level: 17, id: 'EVP' }, { level: 18, id: 'MD_MNG' },
]

const rankByLevel = RANKS.reduce((a, r) => ((a[r.level] = r), a), {})
const getRankByLevel = (lvl) => rankByLevel[lvl] || null
const getNextRank = (lvl) => rankByLevel[lvl + 1] || null

const MDA_TABLE = {
  AO: { '1Y': 4, '2Y': 6, '3Y': 7, '4Y': 8, '5Y': 9 },
  AM: { '1Y': 1, '2Y': 1.25, '3Y': 2, '4Y': 3, '5Y': 3 },
  ADM: { '1Y': 0.7, '2Y': 0.75, '3Y': 1, '4Y': 1, '5Y': 1 },
  DM: { '1Y': 0.55, '2Y': 0.6, '3Y': 0.75, '4Y': 0.65, '5Y': 0.5 },
  SDM: { '1Y': 0.4, '2Y': 0.5, '3Y': 0.75, '4Y': 0.5, '5Y': 0.4 },
  CM: { '1Y': 0.35, '2Y': 0.4, '3Y': 0.5, '4Y': 0.45, '5Y': 0.35 },
  AGM: { '1Y': 0.25, '2Y': 0.3, '3Y': 0.4, '4Y': 0.3, '5Y': 0.2 },
  GM: { '1Y': 0.2, '2Y': 0.2, '3Y': 0.3, '4Y': 0.2, '5Y': 0.15 },
  ZM: { '1Y': 0.2, '2Y': 0.2, '3Y': 0.2, '4Y': 0.2, '5Y': 0.1 },
  ED: { '1Y': 0.15, '2Y': 0.15, '3Y': 0.15, '4Y': 0.15, '5Y': 0.1 },
  SED: { '1Y': 0.15, '2Y': 0.15, '3Y': 0.15, '4Y': 0.15, '5Y': 0.1 },
  MD_MKT: { '1Y': 0.15, '2Y': 0.15, '3Y': 0.15, '4Y': 0.15, '5Y': 0.1 },
  CMD: { '1Y': 0.15, '2Y': 0.15, '3Y': 0.15, '4Y': 0.15, '5Y': 0.1 },
  AVP: { '1Y': 0.15, '2Y': 0.15, '3Y': 0.15, '4Y': 0.15, '5Y': 0.1 },
  VP: { '1Y': 0.1, '2Y': 0.1, '3Y': 0.1, '4Y': 0.1, '5Y': 0.1 },
  SVP: { '1Y': 0.1, '2Y': 0.1, '3Y': 0.1, '4Y': 0.1, '5Y': 0.1 },
  EVP: { '1Y': 0.1, '2Y': 0.1, '3Y': 0.1, '4Y': 0.1, '5Y': 0.1 },
  MD_MNG: { '1Y': 0.1, '2Y': 0.1, '3Y': 0.1, '4Y': 0.1, '5Y': 0.1 },
}

const FD_TABLE = {
  AO: { '1Y': 5, '2Y': 5.5, '3Y': 6, '4Y': 6.5, '5Y': 7 },
  AM: { '1Y': 2, '2Y': 2.25, '3Y': 2.5, '4Y': 2.75, '5Y': 3 },
  ADM: { '1Y': 1.5, '2Y': 1.75, '3Y': 1.8, '4Y': 1, '5Y': 1 },
  DM: { '1Y': 0.9, '2Y': 0.9, '3Y': 1, '4Y': 1, '5Y': 0.9 },
  SDM: { '1Y': 0.75, '2Y': 0.75, '3Y': 0.8, '4Y': 0.8, '5Y': 0.75 },
  CM: { '1Y': 0.7, '2Y': 0.7, '3Y': 0.7, '4Y': 0.75, '5Y': 0.7 },
  AGM: { '1Y': 0.65, '2Y': 0.65, '3Y': 0.65, '4Y': 0.65, '5Y': 0.65 },
  GM: { '1Y': 0.5, '2Y': 0.5, '3Y': 0.55, '4Y': 0.55, '5Y': 0.5 },
  ZM: { '1Y': 0.5, '2Y': 0.5, '3Y': 0.5, '4Y': 0.5, '5Y': 0.5 },
  ED: { '1Y': 0.45, '2Y': 0.45, '3Y': 0.45, '4Y': 0.4, '5Y': 0.4 },
  SED: { '1Y': 0.4, '2Y': 0.4, '3Y': 0.4, '4Y': 0.4, '5Y': 0.35 },
  MD_MKT: { '1Y': 0.4, '2Y': 0.4, '3Y': 0.35, '4Y': 0.35, '5Y': 0.35 },
  CMD: { '1Y': 0.35, '2Y': 0.35, '3Y': 0.35, '4Y': 0.35, '5Y': 0.3 },
  AVP: { '1Y': 0.35, '2Y': 0.35, '3Y': 0.3, '4Y': 0.3, '5Y': 0.3 },
  VP: { '1Y': 0.3, '2Y': 0.3, '3Y': 0.3, '4Y': 0.3, '5Y': 0.3 },
  SVP: { '1Y': 0.3, '2Y': 0.3, '3Y': 0.3, '4Y': 0.3, '5Y': 0.3 },
  EVP: { '1Y': 0.3, '2Y': 0.3, '3Y': 0.3, '4Y': 0.3, '5Y': 0.3 },
  MD_MNG: { '1Y': 0.3, '2Y': 0.3, '3Y': 0.3, '4Y': 0.3, '5Y': 0.3 },
}

const MFA_TABLE = {
  AO: 400, AM: 500, ADM: 600, DM: 750, SDM: 1000, CM: 1500,
  AGM: 2000, GM: 2500, ZM: 3000, ED: 3500, SED: 4000, MD_MKT: 5000,
  CMD: 6000, AVP: 7500, VP: 9000, SVP: 12000, EVP: 15000, MD_MNG: 20000,
}

const PB_TABLE = {
  AO: { target: 0, amount: 0 }, AM: { target: 0, amount: 0 }, ADM: { target: 0, amount: 0 },
  DM: { target: 200000, amount: 3000 }, SDM: { target: 500000, amount: 4000 },
  CM: { target: 800000, amount: 6000 }, AGM: { target: 1000000, amount: 7000 },
  GM: { target: 1500000, amount: 8000 }, ZM: { target: 2000000, amount: 9000 },
  ED: { target: 3000000, amount: 10000 }, SED: { target: 4000000, amount: 15000 },
  MD_MKT: { target: 5000000, amount: 20000 }, CMD: { target: 6000000, amount: 25000 },
  AVP: { target: 7500000, amount: 32500 }, VP: { target: 9000000, amount: 40000 },
  SVP: { target: 10500000, amount: 50000 }, EVP: { target: 12000000, amount: 60000 },
  MD_MNG: { target: 13500000, amount: 75000 },
}

const TA_TABLE = {
  AO: 0, AM: 500, ADM: 1000, DM: 1000, SDM: 1500, CM: 1500,
  AGM: 2000, GM: 2500, ZM: 2500, ED: 3000, SED: 3000, MD_MKT: 3500,
  CMD: 3500, AVP: 4500, VP: 6000, SVP: 7000, EVP: 9000, MD_MNG: 12000,
}

const PROMOTION_TARGET = {
  AO: 50000, AM: 150000, ADM: 300000, DM: 500000, SDM: 750000, CM: 1500000,
  AGM: 2000000, GM: 3000000, ZM: 4500000, ED: 6000000, SED: 7500000,
  MD_MKT: 9000000, CMD: 12000000, AVP: 15000000, VP: 18000000,
  SVP: 21000000, EVP: 25000000, MD_MNG: 30000000,
}

function buildDynamicTables(ranksList) {
  const RANKS = ranksList.map(r => ({ level: r.rank, id: r.code }))
  const MDA_TABLE = {}
  const FD_TABLE = {}
  const MFA_TABLE = {}
  const PB_TABLE = {}
  const TA_TABLE = {}
  const PROMOTION_TARGET = {}

  ranksList.forEach(r => {
    const id = r.code
    MDA_TABLE[id] = {
      '1Y': r.mdaY1?.[0] ?? 0,
      '2Y': r.mdaY1?.[1] ?? 0,
      '3Y': r.mdaY1?.[2] ?? 0,
      '4Y': r.mdaY1?.[3] ?? 0,
      '5Y': r.mdaY1?.[4] ?? 0,
    }
    FD_TABLE[id] = {
      '1Y': r.fdPension?.[0] ?? 0,
      '2Y': r.fdPension?.[1] ?? 0,
      '3Y': r.fdPension?.[2] ?? 0,
      '4Y': r.fdPension?.[3] ?? 0,
      '5Y': r.fdPension?.[4] ?? 0,
    }
    MFA_TABLE[id] = r.mfa ?? 0
    PB_TABLE[id] = { target: r.pbTarget ?? 0, amount: r.pbAmount ?? 0 }
    TA_TABLE[id] = r.ta ?? 0
    PROMOTION_TARGET[id] = r.promoTarget ?? 0
  })

  return { RANKS, MDA_TABLE, FD_TABLE, MFA_TABLE, PB_TABLE, TA_TABLE, PROMOTION_TARGET }
}

/**
 * Calculate one month's earnings. `overrides` may supply mda/mfa maps from
 * config/compensation to replace defaults.
 */
function calculateEarnings({ rankId, businessVolume = 0, rdPlan = '1Y', yearsInPlan, overrides = {}, ranksList = null }) {
  const fdKey = yearsInPlan || rdPlan
  const bv = Number(businessVolume) || 0

  let mda = MDA_TABLE
  let fd = FD_TABLE
  let mfa = MFA_TABLE
  let pb = PB_TABLE
  let ta = TA_TABLE

  if (ranksList && ranksList.length > 0) {
    const dynamic = buildDynamicTables(ranksList)
    mda = dynamic.MDA_TABLE
    fd = dynamic.FD_TABLE
    mfa = dynamic.MFA_TABLE
    pb = dynamic.PB_TABLE
    ta = dynamic.TA_TABLE
  }

  const mdaTable = (overrides.mda && overrides.mda[rankId]) || mda[rankId] || {}
  const mfaVal = (overrides.mfa && overrides.mfa[rankId] != null ? overrides.mfa[rankId] : mfa[rankId]) || 0

  const mdaPercent = mdaTable[rdPlan] || 0
  const fdPercent = (fd[rankId] && fd[rankId][fdKey]) || 0
  const pbRule = pb[rankId] || { target: 0, amount: 0 }
  const pbVal = pbRule.amount > 0 && bv >= pbRule.target ? pbRule.amount : 0
  const taVal = ta[rankId] || 0

  const mdaAmt = bv * (mdaPercent / 100)
  const fdAmt = bv * (fdPercent / 100)
  const total = mdaAmt + fdAmt + mfaVal + pbVal + taVal

  return { MDA: mdaAmt, FD: fdAmt, MFA: mfaVal, PB: pbVal, TA: taVal, totalEarnings: total }
}

module.exports = {
  RD_PLANS, RANKS, getRankByLevel, getNextRank,
  MDA_TABLE, FD_TABLE, MFA_TABLE, PB_TABLE, TA_TABLE, PROMOTION_TARGET,
  calculateEarnings, buildDynamicTables,
}
