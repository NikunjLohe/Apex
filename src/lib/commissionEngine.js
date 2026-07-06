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
  
  let currentAgent = baseAgent
  const activeRanks = (ranksList && ranksList.length > 0) ? ranksList : DEFAULT_RANKS

  // Traverse the upline (Sponsor Hierarchy) all the way to the top
  while (currentAgent) {
    const currentRankNum = Number(currentAgent.rank) || 1
    const currentRankObj = activeRanks.find(r => Number(r.rank) === currentRankNum)
    const rankCode = currentRankObj?.code || 'AO'
    const rankRate = getRate(rankCode)

    if (rankRate > 0) {
      const isSeller = (currentAgent.id === baseAgent.id)
      
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
        installment: 1, 
        
        businessAmount: businessAmount,
        percentage: rankRate * 100,
        amount: businessAmount * rankRate,
        
        originalRank: baseAgent.rank,
        originalAgentId: baseAgent.id,
        
        commissionType: isSeller ? 'direct' : 'differential_own', // Direct for seller, Differential for upline
        compression: false,
        compressionReason: isSeller ? `${rankCode} Commission (Direct)` : `${rankCode} Commission (Differential)`,
        compressedFromRank: null,
        
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
