// ============================================================================
// 18-level rank ladder. Rank is stored as a number 1–18 on the user doc.
// Index in arrays = rank - 1.
// ============================================================================

export const RANKS = [
  { rank: 1, code: 'AO', name: 'Administrative Officer' },
  { rank: 2, code: 'AM', name: 'Assistant Manager' },
  { rank: 3, code: 'ADM', name: 'Admin Division Manager' },
  { rank: 4, code: 'DM', name: 'Division Manager' },
  { rank: 5, code: 'SDM', name: 'Senior Division Manager' },
  { rank: 6, code: 'CM', name: 'Chief Manager' },
  { rank: 7, code: 'AGM', name: 'Asst. General Manager' },
  { rank: 8, code: 'GM', name: 'General Manager' },
  { rank: 9, code: 'ZM', name: 'Zonal Manager' },
  { rank: 10, code: 'ED', name: 'Executive Director' },
  { rank: 11, code: 'SED', name: 'Sr. Executive Director' },
  { rank: 12, code: 'MD', name: 'Marketing Director' },
  { rank: 13, code: 'CMD', name: 'Chief Marketing Director' },
  { rank: 14, code: 'AVP', name: 'Asst. Vice President' },
  { rank: 15, code: 'VP', name: 'Vice President' },
  { rank: 16, code: 'SVP', name: 'Senior Vice President' },
  { rank: 17, code: 'EVP', name: 'Executive Vice President' },
  { rank: 18, code: 'MGD', name: 'Managing Director' },
]

export const getRank = (rank) => RANKS[(Number(rank) || 1) - 1] || RANKS[0]
export const rankCode = (rank) => getRank(rank).code
export const rankName = (rank) => getRank(rank).name
export const nextRank = (rank) => RANKS[Number(rank)] || null // RANKS[rank] is rank+1 (0-indexed)
