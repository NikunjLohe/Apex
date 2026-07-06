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
  let lastProcessedRankNum = 0
  let maxRateEncountered = 0

  const activeRanks = (ranksList && ranksList.length > 0) ? ranksList : DEFAULT_RANKS

  // The maximum rank number available in the system
  const maxRankNum = Math.max(...activeRanks.map(r => Number(r.rank)))

  // Traverse the upline (Sponsor Hierarchy)
  while (currentAgent) {
    const currentRankNum = Number(currentAgent.rank) || 1
    
    // Process only if the agent is at a higher rank or if it's the direct agent (rank processing logic)
    if (currentRankNum > lastProcessedRankNum || currentAgent.id === baseAgent.id) {
      
      const startLoopRank = Math.max(lastProcessedRankNum + 1, 1)
      const endLoopRank = currentRankNum

      // For direct agent, we just process their rank directly
      if (currentAgent.id === baseAgent.id) {
        const currentRankObj = activeRanks.find(r => Number(r.rank) === currentRankNum)
        const rankCode = currentRankObj?.code || 'AO'
        const rankRate = getRate(rankCode)
        const diffRate = Math.max(0, rankRate - maxRateEncountered)
        
        if (diffRate > 0) {
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
            percentage: diffRate * 100,
            amount: businessAmount * diffRate,
            
            originalRank: baseAgent.rank,
            originalAgentId: baseAgent.id,
            
            commissionType: 'direct',
            compression: false,
            compressionReason: `${rankCode} Commission (Direct)`,
            compressedFromRank: null,
            
            month: monthNum,
            year: yearNum,
            calculationDate: serverTimestamp(),
            status: 'unpaid',
          })
          maxRateEncountered = rankRate
        }
        lastProcessedRankNum = currentRankNum
      } else {
        // Upline agent logic: Loop through bypassed ranks to itemize compression
        for (let r = startLoopRank; r <= endLoopRank; r++) {
          const evalRankObj = activeRanks.find(rankItem => Number(rankItem.rank) === r)
          if (!evalRankObj) continue
          
          const evalRankCode = evalRankObj.code
          const evalRankRate = getRate(evalRankCode)
          const diffRate = Math.max(0, evalRankRate - maxRateEncountered)

          if (diffRate > 0) {
            const isOwnCommission = (r === endLoopRank)
            
            entries.push({
              agentId: currentAgent.id,
              agentName: currentAgent.name,
              sponsorCode: currentAgent.sponsorCode || '',
              receivingRank: currentRankNum,
              receivingRankCode: evalRankCode, // use the evaluated rank code for transparency
              
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
              percentage: diffRate * 100,
              amount: businessAmount * diffRate,
              
              originalRank: baseAgent.rank,
              originalAgentId: baseAgent.id,
              
              commissionType: isOwnCommission ? 'differential_own' : 'compressed',
              compression: !isOwnCommission,
              compressionReason: isOwnCommission ? `${evalRankCode} Own Commission` : `${evalRankCode} Commission (Compressed)`,
              compressedFromRank: isOwnCommission ? null : r,
              
              month: monthNum,
              year: yearNum,
              calculationDate: serverTimestamp(),
              status: 'unpaid',
            })
            maxRateEncountered = evalRankRate
          }
        }
        lastProcessedRankNum = currentRankNum
      }
    }

    if (currentRankNum >= maxRankNum) {
      break
    }

    if (currentAgent.referredBy && usersMap[currentAgent.referredBy]) {
      currentAgent = usersMap[currentAgent.referredBy]
    } else {
      break
    }
  }

  return entries
}
