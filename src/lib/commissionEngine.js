import { serverTimestamp } from 'firebase/firestore'
import { RANKS as DEFAULT_RANKS } from '../data/ranks.js'

/**
 * calculateCommissions
 * 
 * Computes commissions based strictly on the Commission Master.
 * Traverses the sponsor hierarchy to apply Full Rank Compression.
 * 
 * @param {number} businessAmount - The base amount for calculation (RD: monthly * 12, FD: totalAmount)
 * @param {object} plan - { planCode, planType, policyYear }
 * @param {object} baseAgent - The direct agent { id, name, rank, sponsorCode, referredBy }
 * @param {object} usersMap - A mapping of userId -> userObject for traversing `referredBy`
 * @param {object} commissionMaster - The dynamic config/commissions JSON
 * @param {array} ranksList - Array of rank objects ordered by rank number ascending
 * @param {object} customer - { id, name, account }
 * @param {object} policyInfo - { id, number }
 * @param {number} monthNum
 * @param {number} yearNum
 * @returns {array} Array of commission ledger entry objects
 */
export function calculateCommissions({
  businessAmount,
  plan,
  baseAgent,
  usersMap,
  commissionMaster,
  ranksList,
  customer,
  policyInfo,
  monthNum,
  yearNum,
  installmentNumber = 1,
}) {
  const code = String(plan.planCode).toUpperCase()
  const yr = Number(plan.policyYear) || 1
  const isRDPlan = String(plan.planType).toUpperCase() === 'RD'

  // Helper to get commission rate from Master config
  const getRate = (rankCode) => {
    const rankCodeStr = String(rankCode || 'AO').toUpperCase()
    if (commissionMaster && commissionMaster[code]?.[yr]?.[rankCodeStr] !== undefined) {
      return Number(commissionMaster[code][yr][rankCodeStr]) / 100
    }
    return 0
  }

  const entries = []
  
  const activeRanks = (ranksList && ranksList.length > 0) ? ranksList : DEFAULT_RANKS

  // Identify selling agent rank
  const sellerRankNum = Number(baseAgent.rank) || 1

  // Calculate total vacant lower rank rates for ranks strictly below sellerRankNum
  let vacantLowerRatesSum = 0
  const vacantRanksAbsorbed = []

  for (let r = 1; r < sellerRankNum; r++) {
    const rankObj = activeRanks.find(rk => Number(rk.rank) === r)
    const rankCode = rankObj?.code || 'AO'
    const rRate = getRate(rankCode)
    if (rRate > 0) {
      vacantLowerRatesSum += rRate
      vacantRanksAbsorbed.push({ rank: r, code: rankCode, rate: rRate * 100 })
    }
  }

  let currentAgent = baseAgent

  // Traverse the upline (Sponsor Hierarchy) all the way to the top
  while (currentAgent) {
    const currentRankNum = Number(currentAgent.rank) || 1
    const currentRankObj = activeRanks.find(r => Number(r.rank) === currentRankNum)
    const rankCode = currentRankObj?.code || 'AO'
    const rankRate = getRate(rankCode)

    if (rankRate > 0 || (currentAgent.id === baseAgent.id && vacantLowerRatesSum > 0)) {
      const isSeller = (currentAgent.id === baseAgent.id)
      const effectiveRate = isSeller ? (rankRate + vacantLowerRatesSum) : rankRate
      const effectivePercentage = Number((effectiveRate * 100).toFixed(4))
      const effectiveAmount = Number((businessAmount * effectiveRate).toFixed(2))

      const hasCompression = isSeller && vacantRanksAbsorbed.length > 0
      const compressionReason = isSeller
        ? (hasCompression
            ? `${rankCode} Commission (Direct + ${vacantRanksAbsorbed.map(v => v.code).join('+')} Vacant Lower Ranks)`
            : `${rankCode} Commission (Direct)`)
        : `${rankCode} Commission (Upline Commission)`

      entries.push({
        agentId: currentAgent.id,
        agentName: currentAgent.name,
        sponsorCode: currentAgent.sponsorCode || '',
        receivingRank: currentRankNum,
        receivingRankCode: rankCode,
        
        customerId: customer.id,
        customerName: customer.name,
        customerAccount: customer.account,
        policyId: policyInfo.id,
        policyNumber: policyInfo.number,
        planCode: code,
        planType: isRDPlan ? 'RD' : 'FD',
        policyYear: yr,
        installment: installmentNumber, 
        
        businessAmount: businessAmount,
        percentage: effectivePercentage,
        amount: effectiveAmount,
        
        originalRank: baseAgent.rank,
        originalAgentId: baseAgent.id,
        
        commissionType: isSeller ? 'direct' : 'upline', // Direct for seller, Upline for sponsor
        compression: hasCompression,
        compressionReason: compressionReason,
        compressedFromRank: hasCompression ? vacantRanksAbsorbed.map(v => v.rank) : null,
        
        month: monthNum,
        year: yearNum,
        calculationDate: serverTimestamp(),
        status: 'unpaid',
      })
    }

    if (currentAgent.referredBy && usersMap[currentAgent.referredBy]) {
      currentAgent = usersMap[currentAgent.referredBy]
    } else {
      break
    }
  }

  return entries
}
