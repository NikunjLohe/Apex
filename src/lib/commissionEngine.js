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
  
  const rawYr = plan.policyYear
  const yr = rawYr !== undefined && rawYr !== null && rawYr !== '' ? Number(rawYr) : null
  
  if (!yr || isNaN(yr)) {
    throw new Error(`Missing or invalid policyYear for plan ${code} (Policy: ${policyInfo.number}). Cannot calculate commission safely.`)
  }
  
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

  // 1. Calculate the Hard Cap Maximum Pool based on configured ranks 1-18
  let maximumPool = 0
  for (let r = 1; r <= 18; r++) {
    const rankObj = activeRanks.find(rk => Number(rk.rank) === r)
    const rankCode = rankObj?.code || 'AO'
    maximumPool += getRate(rankCode)
  }
  // Add a tiny epsilon for floating point safety, handled by toFixed
  maximumPool = Number((maximumPool).toFixed(6))

  let currentAgent = baseAgent
  
  let highestRankPaid = 0
  let totalAllocatedRate = 0

  // Traverse the upline (Sponsor Hierarchy) all the way to the top
  while (currentAgent) {
    const currentRankNum = Number(currentAgent.rank) || 1
    const currentRankObj = activeRanks.find(r => Number(r.rank) === currentRankNum)
    const rankCode = currentRankObj?.code || 'AO'

    // Duplicate / Lower Rank Prevention
    // If the current agent's rank has already been covered, skip paying them.
    if (currentRankNum <= highestRankPaid) {
      if (currentAgent.referredBy && usersMap[currentAgent.referredBy]) {
        currentAgent = usersMap[currentAgent.referredBy]
        continue
      } else {
        break
      }
    }

    let uplineVacantRateSum = 0
    const uplineVacantRanksAbsorbed = []
    
    // Gap compression: sweep skipped ranks from highestRankPaid + 1 to currentRankNum - 1
    for (let r = highestRankPaid + 1; r < currentRankNum; r++) {
      const gapRankObj = activeRanks.find(rk => Number(rk.rank) === r)
      const gapCode = gapRankObj?.code || 'AO'
      const gapRate = getRate(gapCode)
      if (gapRate > 0) {
        uplineVacantRateSum += gapRate
        uplineVacantRanksAbsorbed.push({ rank: r, code: gapCode, rate: gapRate * 100 })
      }
    }

    const rankRate = getRate(rankCode)
    let effectiveRate = rankRate + uplineVacantRateSum

    if (effectiveRate > 0) {
      // Hard Commission Cap Protection
      if (Number((totalAllocatedRate + effectiveRate).toFixed(6)) > maximumPool) {
        effectiveRate = maximumPool - totalAllocatedRate
      }

      if (effectiveRate > 0) {
        totalAllocatedRate += effectiveRate
        const effectivePercentage = Number((effectiveRate * 100).toFixed(4))
        const effectiveAmount = Number((businessAmount * effectiveRate).toFixed(2))

        const isSeller = (currentAgent.id === baseAgent.id)
        const hasCompression = uplineVacantRanksAbsorbed.length > 0
        
        let compressionReason = ''
        if (isSeller) {
          compressionReason = hasCompression
              ? `${rankCode} Commission (Direct + ${uplineVacantRanksAbsorbed.map(v => v.code).join('+')} Vacant Lower Ranks)`
              : `${rankCode} Commission (Direct)`
        } else {
          compressionReason = hasCompression
              ? `${rankCode} Commission (Upline + ${uplineVacantRanksAbsorbed.map(v => v.code).join('+')} Vacant Upline Ranks)`
              : `${rankCode} Commission (Upline Commission)`
        }

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
          
          commissionType: isSeller ? 'direct' : 'upline', 
          compression: hasCompression,
          compressionReason: compressionReason,
          compressedFromRank: hasCompression ? uplineVacantRanksAbsorbed.map(v => v.rank) : null,
          
          month: monthNum,
          year: yearNum,
          calculationDate: serverTimestamp(),
          status: 'unpaid',
        })
      }
    }
    
    // Advance highestRankPaid
    highestRankPaid = currentRankNum

    if (currentAgent.referredBy && usersMap[currentAgent.referredBy]) {
      currentAgent = usersMap[currentAgent.referredBy]
    } else {
      break
    }
  }

  return entries
}
