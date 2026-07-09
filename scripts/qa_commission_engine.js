import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { calculateCommissions } from '../src/lib/commissionEngine.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RANKS = [
  { rank: 1, code: 'AO', name: 'Advisor' },
  { rank: 2, code: 'SAO', name: 'Senior Advisor' },
  { rank: 3, code: 'DO', name: 'Development Officer' },
  { rank: 4, code: 'SDO', name: 'Senior Development Officer' },
  { rank: 5, code: 'ADO', name: 'Agency Development Officer' },
  { rank: 6, code: 'CADO', name: 'Chief Agency Development Officer' },
  { rank: 7, code: 'BM', name: 'Branch Manager' },
  { rank: 8, code: 'SBM', name: 'Senior Branch Manager' },
  { rank: 9, code: 'ABM', name: 'Area Branch Manager' },
  { rank: 10, code: 'RBM', name: 'Regional Branch Manager' },
  { rank: 11, code: 'ZBM', name: 'Zonal Branch Manager' },
  { rank: 12, code: 'DBM', name: 'Divisional Branch Manager' },
  { rank: 13, code: 'NBM', name: 'National Branch Manager' },
  { rank: 14, code: 'GM', name: 'General Manager' },
  { rank: 15, code: 'CGM', name: 'Chief General Manager' },
  { rank: 16, code: 'VP', name: 'Vice President' },
  { rank: 17, code: 'SVP', name: 'Senior Vice President' },
  { rank: 18, code: 'ED', name: 'Executive Director' }
]

const DEFAULT_COMMISSION_MASTER = {
  RD: {
    1: {
      AO: 8, SAO: 10, DO: 12, SDO: 14, ADO: 16, CADO: 18,
      BM: 20, SBM: 21, ABM: 22, RBM: 23, ZBM: 24, DBM: 25,
      NBM: 26, GM: 27, CGM: 28, VP: 29, SVP: 30, ED: 31
    }
  }
}

// Generate hierarchy and return baseAgent + usersMap
function generateHierarchy(rankNumbers) {
  const usersMap = {}
  const sorted = [...rankNumbers].sort((a, b) => b - a)
  
  let previousId = null
  sorted.forEach((rankNum) => {
    const rankObj = RANKS.find(r => r.rank === rankNum)
    const agentId = `agent_rank_${rankNum}`
    usersMap[agentId] = {
      id: agentId,
      name: `Agent ${rankObj.code}`,
      rank: rankNum,
      referredBy: previousId // Point to the higher rank (which was processed in the previous iteration)
    }
    previousId = agentId
  })
  
  const baseRankNum = Math.min(...rankNumbers)
  const baseAgent = usersMap[`agent_rank_${baseRankNum}`]
  return { baseAgent, usersMap }
}

function runTest(testName, rankNumbers, masterOverrides = null) {
  const { baseAgent, usersMap } = generateHierarchy(rankNumbers)
  const commissionMaster = masterOverrides ? JSON.parse(JSON.stringify(masterOverrides)) : JSON.parse(JSON.stringify(DEFAULT_COMMISSION_MASTER))
  
  const results = calculateCommissions({
    businessAmount: 10000 * 12, // RD 12 months, 1.2 Lakh
    plan: { planCode: 'RD', planType: 'RD', policyYear: 1 },
    baseAgent,
    usersMap,
    commissionMaster,
    ranksList: RANKS,
    customer: { id: 'cust1', name: 'Test Customer', account: '123' },
    policyInfo: { id: 'pol1', number: 'POL-001' },
    monthNum: 7,
    yearNum: 2026
  })
  
  return { testName, results, commissionMaster }
}

function verifyResults(testName, results, commissionMaster) {
  let output = `## ${testName}\n\n`
  output += `| Rank | Agent | Commission Type | % Allocated | Amount | Running Total | PASS/FAIL |\n`
  output += `|---|---|---|---|---|---|---|\n`
  
  let runningTotalPct = 0
  let runningTotalAmt = 0
  let passed = true
  
  // Ranks array to check total allocations vs configured max
  const maxConfiguredPct = commissionMaster.RD[1].ED / 100
  const expectedTotalAmt = 120000 * maxConfiguredPct
  
  // Sort results by rank ascending
  results.sort((a, b) => a.receivingRank - b.receivingRank)
  
  for (let entry of results) {
    const allocatedPct = entry.percentage / 100
    runningTotalPct += allocatedPct
    runningTotalAmt += entry.amount
    
    // Quick math check
    const expectedAmount = 120000 * allocatedPct
    const isMathCorrect = Math.abs(entry.amount - expectedAmount) < 0.01
    
    output += `| Rank ${entry.receivingRank} (${entry.receivingRankCode}) | ${entry.agentName} | ${entry.compressionReason} | ${(allocatedPct * 100).toFixed(2)}% | ₹${entry.amount.toFixed(2)} | ₹${runningTotalAmt.toFixed(2)} | ${isMathCorrect ? '✅ PASS' : '❌ FAIL'} |\n`
    if (!isMathCorrect) passed = false
  }
  
  const isTotalCorrect = Math.abs(runningTotalAmt - expectedTotalAmt) < 0.01
  const isTotalPctCorrect = Math.abs(runningTotalPct - maxConfiguredPct) < 0.001
  
  output += `\n**Total Commission Distributed:** ₹${runningTotalAmt.toFixed(2)} (Expected: ₹${expectedTotalAmt.toFixed(2)})\n`
  output += `**Total Percentage Distributed:** ${(runningTotalPct * 100).toFixed(2)}% (Expected: ${(maxConfiguredPct * 100).toFixed(2)}%)\n`
  output += `**Final Status:** ${passed && isTotalCorrect && isTotalPctCorrect ? '✅ PASS' : '❌ FAIL'}\n\n`
  
  return { output, passed: passed && isTotalCorrect && isTotalPctCorrect }
}

async function main() {
  let report = `# Commission Engine Verification Report\n\n`
  let allPassed = true
  
  // TEST 1: Full Hierarchy
  const test1Ranks = Array.from({length: 18}, (_, i) => i + 1)
  const test1 = runTest('Test 1 – Full Hierarchy (All 18 Ranks)', test1Ranks)
  const res1 = verifyResults(test1.testName, test1.results, test1.commissionMaster)
  report += res1.output
  allPassed = allPassed && res1.passed
  
  // TEST 2: Rank Compression
  const test2Ranks = [1, 2, 8, 15, 18]
  const test2 = runTest('Test 2 – Rank Compression (Bypassed: 3-7, 9-14, 16-17)', test2Ranks)
  const res2 = verifyResults(test2.testName, test2.results, test2.commissionMaster)
  report += res2.output
  allPassed = allPassed && res2.passed
  
  // TEST 3: Dynamic Commission Master
  const customMaster = JSON.parse(JSON.stringify(DEFAULT_COMMISSION_MASTER))
  customMaster.RD[1].SBM = 22.5 // Originally 21
  const test3 = runTest('Test 3 – Dynamic Commission Master (Rank 8 SBM updated to 22.5%)', test2Ranks, customMaster)
  const res3 = verifyResults(test3.testName, test3.results, test3.commissionMaster)
  report += res3.output
  allPassed = allPassed && res3.passed
  
  // WRITE REPORT
  const artifactPath = path.join(process.env.APPDATA || process.env.HOME || '', '.gemini', 'antigravity-ide', 'brain', 'bfe0987a-c3cb-47a2-8370-22e0fdc418fd', 'commission_engine_verification_report.md')
  
  try {
    fs.writeFileSync(artifactPath, report)
    console.log(`Report successfully written to ${artifactPath}`)
  } catch (err) {
    console.error('Failed to write artifact locally, trying fallback:', err)
    fs.writeFileSync('commission_engine_verification_report.md', report)
  }
}

main().catch(console.error)

