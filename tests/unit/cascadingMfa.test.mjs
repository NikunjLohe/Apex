import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMonthlyMfaBatch,
  getCurrentIstPeriod,
  isClosedMfaPeriod,
  isFutureMfaPeriod,
  getMfaSubtreeIds,
  filterMfaRecordsForView,
  filterPolicyTracesForView,
  buildMfaExcelSheetsData,
} from '../../src/lib/mfa.js'

const REF_DATE = new Date('2026-11-26T10:00:00Z')

function agent(id, code, rank, sponsorId = null, status = 'active') {
  return {
    id,
    name: `${code} User`,
    sponsorCode: code,
    sponsorId,
    rank,
    status,
    role: 'agent',
    isAdmin: false,
    isSuperAdmin: false,
  }
}

function policy({
  id,
  number = id,
  agentId,
  planCode = 'FD3Y',
  planType = 'FD',
  policyYear = 3,
  fdAmount = 0,
  monthlyAmount = 0,
  totalPaid = null,
  paidInstallments = 1,
  startDate = '2026-11-10',
  createdAt = '2026-11-10T10:00:00Z',
  status = 'active',
}) {
  return {
    id,
    policyNumber: number,
    agentId,
    planCode,
    planType,
    policyYear,
    fdAmount,
    monthlyAmount,
    totalPaid: totalPaid ?? (fdAmount || monthlyAmount),
    paidInstallments,
    startDate,
    createdAt,
    status,
  }
}

function assertConservation(res) {
  const totalOrig = res.allocations
    .filter((a) => a.allocationType === 'self_own')
    .reduce((s, a) => s + a.originatingMfaCredit, 0)
  const totalApplied = res.records.reduce((s, r) => s + r.totalMfaCredit, 0)
  const totalUnalloc = res.allocations
    .filter((a) => a.allocationType === 'unallocated_excess')
    .reduce((s, a) => s + a.unallocatedAmount, 0)

  assert.equal(
    Number((totalApplied + totalUnalloc).toFixed(2)),
    Number(totalOrig.toFixed(2)),
    'Total applied + unallocated must equal total qualifying MFA credit'
  )
}

test('Scenario 1: Multi-level Cascading AO -> AM -> ADM with ₹5,00,000 qualifying business', () => {
  const adm = agent('adm-1', 'KB03001', 3, null)
  const am = agent('am-1', 'KB02001', 2, adm.id)
  const ao = agent('ao-1', 'KB01001', 1, am.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [ao, am, adm],
    policies: [
      policy({ id: 'p1', agentId: ao.id, planCode: 'FD5Y', policyYear: 5, fdAmount: 500000 }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[ao.id].ownMfaCreditApplied, 50000)
  assert.equal(res.byAgentId[ao.id].cascadingMfaCreditReceived, 0)
  assert.equal(res.byAgentId[ao.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[ao.id].excessCreditPassedUp, 450000)
  assert.equal(res.byAgentId[ao.id].isQualified, true)
  assert.equal(res.byAgentId[ao.id].rewardEarned, 3000)

  assert.equal(res.byAgentId[am.id].ownMfaCreditApplied, 0)
  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 350000)
  assert.equal(res.byAgentId[am.id].totalMfaCredit, 350000)
  assert.equal(res.byAgentId[am.id].excessCreditPassedUp, 100000)
  assert.equal(res.byAgentId[am.id].isQualified, true)
  assert.equal(res.byAgentId[am.id].rewardEarned, 5000)

  assert.equal(res.byAgentId[adm.id].ownMfaCreditApplied, 0)
  assert.equal(res.byAgentId[adm.id].cascadingMfaCreditReceived, 100000)
  assert.equal(res.byAgentId[adm.id].totalMfaCredit, 100000)
  assert.equal(res.byAgentId[adm.id].remainingAmount, 450000)
  assert.equal(res.byAgentId[adm.id].achievementPct, 18.18)
  assert.equal(res.byAgentId[adm.id].isQualified, false)
  assert.equal(res.byAgentId[adm.id].rewardEarned, 0)
  assertConservation(res)
})

test('Scenario 2: Insufficient business (₹30,000 for AO target ₹50,000) -> no cascading, no reward', () => {
  const am = agent('am-1', 'KB02001', 2, null)
  const ao = agent('ao-1', 'KB01001', 1, am.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [ao, am],
    policies: [
      policy({ id: 'p1', agentId: ao.id, planCode: 'FD3Y', policyYear: 3, fdAmount: 30000 }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[ao.id].totalMfaCredit, 30000)
  assert.equal(res.byAgentId[ao.id].remainingAmount, 20000)
  assert.equal(res.byAgentId[ao.id].achievementPct, 60)
  assert.equal(res.byAgentId[ao.id].isQualified, false)
  assert.equal(res.byAgentId[ao.id].rewardEarned, 0)
  assert.equal(res.byAgentId[ao.id].excessCreditPassedUp, 0)

  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 0)
  assert.equal(res.byAgentId[am.id].totalMfaCredit, 0)
  assert.equal(res.byAgentId[am.id].rewardEarned, 0)
  assertConservation(res)
})

test('Scenario 3: Small excess (₹60,000 for AO) cascades ₹10,000 to AM without qualifying AM', () => {
  const am = agent('am-1', 'KB02001', 2, null)
  const ao = agent('ao-1', 'KB01001', 1, am.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [ao, am],
    policies: [
      policy({ id: 'p1', agentId: ao.id, planCode: 'FD3Y', policyYear: 3, fdAmount: 60000 }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[ao.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[ao.id].isQualified, true)
  assert.equal(res.byAgentId[ao.id].rewardEarned, 3000)
  assert.equal(res.byAgentId[ao.id].excessCreditPassedUp, 10000)

  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 10000)
  assert.equal(res.byAgentId[am.id].remainingAmount, 340000)
  assert.equal(res.byAgentId[am.id].achievementPct, 2.86)
  assert.equal(res.byAgentId[am.id].isQualified, false)
  assert.equal(res.byAgentId[am.id].rewardEarned, 0)
  assertConservation(res)
})

test('Scenario 4: Intermediate senior AM already at 100% passes credit cleanly to ADM (pass_through)', () => {
  const adm = agent('adm-1', 'KB03001', 3, null)
  const am = agent('am-1', 'KB02001', 2, adm.id)
  const ao = agent('ao-1', 'KB01001', 1, am.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [ao, am, adm],
    policies: [
      policy({
        id: 'p-am',
        number: 'POL-AM',
        agentId: am.id,
        planCode: 'FD3Y',
        policyYear: 3,
        fdAmount: 350000,
        startDate: '2026-11-01',
        createdAt: '2026-11-01T08:00:00Z',
      }),
      policy({
        id: 'p-ao',
        number: 'POL-AO',
        agentId: ao.id,
        planCode: 'FD5Y',
        policyYear: 5,
        fdAmount: 150000,
        startDate: '2026-11-08',
        createdAt: '2026-11-08T08:00:00Z',
      }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[am.id].ownMfaCreditApplied, 350000)
  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 0)
  assert.equal(res.byAgentId[am.id].totalMfaCredit, 350000)
  assert.equal(res.byAgentId[am.id].excessCreditPassedUp, 100000)

  const aoSteps = res.allocationsByPolicy['p-ao']
  assert.equal(aoSteps.length, 3)
  assert.equal(aoSteps[1].allocationType, 'pass_through')
  assert.equal(aoSteps[1].appliedAmount, 0)
  assert.equal(aoSteps[1].excessPassedUp, 100000)
  assert.equal(aoSteps[2].recipientAgentId, adm.id)
  assert.equal(aoSteps[2].appliedAmount, 100000)

  assert.equal(res.byAgentId[adm.id].cascadingMfaCreditReceived, 100000)
  assert.equal(res.byAgentId[adm.id].remainingAmount, 450000)
  assertConservation(res)
})

test('Scenario 5: Multiple chronological businesses within same month (₹30,000 + ₹40,000)', () => {
  const am = agent('am-1', 'KB02001', 2, null)
  const ao = agent('ao-1', 'KB01001', 1, am.id)

  // Deliberately pass out-of-order array to verify deterministic sort
  const res = calculateMonthlyMfaBatch({
    profiles: [ao, am],
    policies: [
      policy({
        id: 'p2',
        number: 'POL-2',
        agentId: ao.id,
        fdAmount: 40000,
        startDate: '2026-11-12',
        createdAt: '2026-11-12T09:00:00Z',
      }),
      policy({
        id: 'p1',
        number: 'POL-1',
        agentId: ao.id,
        fdAmount: 30000,
        startDate: '2026-11-05',
        createdAt: '2026-11-05T09:00:00Z',
      }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  const steps1 = res.allocationsByPolicy['p1']
  assert.equal(steps1.length, 1)
  assert.equal(steps1[0].appliedAmount, 30000)
  assert.equal(steps1[0].excessPassedUp, 0)

  const steps2 = res.allocationsByPolicy['p2']
  assert.equal(steps2.length, 2)
  assert.equal(steps2[0].appliedAmount, 20000)
  assert.equal(steps2[0].excessPassedUp, 20000)
  assert.equal(steps2[1].recipientAgentId, am.id)
  assert.equal(steps2[1].appliedAmount, 20000)

  assert.equal(res.byAgentId[ao.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[ao.id].excessCreditPassedUp, 20000)
  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 20000)
  assertConservation(res)
})

test('Scenario 6: Duration-weighted MFA credits (1Y=25%, 2Y=50%, 3Y+=100%, RD once per policy)', () => {
  const am = agent('am-1', 'KB02001', 2, null)
  const ao1 = agent('ao-1', 'KB01001', 1, am.id)
  const ao2 = agent('ao-2', 'KB01002', 1, am.id)
  const ao3 = agent('ao-3', 'KB01003', 1, am.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [ao1, ao2, ao3, am],
    policies: [
      // 1Y FD ₹4,00,000 => 25% = ₹1,00,000 qualifying credit (50k to ao1, 50k cascade to AM)
      policy({ id: 'p-1y', agentId: ao1.id, planCode: 'FD1Y', policyYear: 1, fdAmount: 400000, startDate: '2026-11-02' }),
      // 2Y FD ₹2,00,000 => 50% = ₹1,00,000 qualifying credit (50k to ao2, 50k cascade to AM)
      policy({ id: 'p-2y', agentId: ao2.id, planCode: 'FD2Y', policyYear: 2, fdAmount: 200000, startDate: '2026-11-03' }),
      // 5Y RD ₹20,000/mo with 3 paid installments (₹60,000 totalPaid) => ₹20,000 once at 100%
      policy({
        id: 'p-rd',
        agentId: ao3.id,
        planCode: 'RD5Y',
        planType: 'RD',
        policyYear: 5,
        monthlyAmount: 20000,
        totalPaid: 60000,
        paidInstallments: 3,
        startDate: '2026-11-04',
      }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[ao1.id].ownMfaCreditGenerated, 100000)
  assert.equal(res.byAgentId[ao1.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[ao1.id].excessCreditPassedUp, 50000)

  assert.equal(res.byAgentId[ao2.id].ownMfaCreditGenerated, 100000)
  assert.equal(res.byAgentId[ao2.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[ao2.id].excessCreditPassedUp, 50000)

  assert.equal(res.byAgentId[ao3.id].ownMfaCreditGenerated, 20000)
  assert.equal(res.byAgentId[ao3.id].totalMfaCredit, 20000)

  assert.equal(res.byAgentId[am.id].cascadingMfaCreditReceived, 100000)
  assertConservation(res)
})

test('Scenario 7: Month boundary reset (Nov excess never carries into Dec) & historical snapshot integrity', () => {
  const amOld = agent('am-old', 'KB02001', 2, null)
  const amNew = agent('am-new', 'KB02002', 2, null)
  // In Dec 2026, ao was promoted to Rank 2 & moved to amNew
  const aoPromoted = agent('ao-1', 'KB01001', 2, amNew.id)

  const octPolicies = [
    policy({ id: 'p-oct', agentId: aoPromoted.id, fdAmount: 100000, startDate: '2026-10-15', createdAt: '2026-10-15T10:00:00Z' }),
  ]

  // Oct snapshot keeps Rank 1 (50k target), sponsorIdSnapshot = amOld.id & agentStatusSnapshot = 'active'
  const octRes = calculateMonthlyMfaBatch({
    profiles: [aoPromoted, amOld, amNew],
    policies: octPolicies,
    month: 10,
    year: 2026,
    snapshotsByAgentId: {
      [aoPromoted.id]: {
        rankSnapshot: 1,
        rankCodeSnapshot: 'AO',
        mfaTargetSnapshot: 50000,
        mfaRewardSnapshot: 3000,
        sponsorIdSnapshot: amOld.id,
        agentStatusSnapshot: 'active',
        isLocked: true,
      },
      [amOld.id]: {
        rankSnapshot: 2,
        rankCodeSnapshot: 'AM',
        mfaTargetSnapshot: 350000,
        mfaRewardSnapshot: 5000,
        sponsorIdSnapshot: null,
        agentStatusSnapshot: 'active',
        isLocked: true,
      },
      [amNew.id]: {
        rankSnapshot: 2,
        rankCodeSnapshot: 'AM',
        mfaTargetSnapshot: 350000,
        mfaRewardSnapshot: 5000,
        sponsorIdSnapshot: null,
        agentStatusSnapshot: 'active',
        isLocked: true,
      },
    },
    referenceDate: REF_DATE,
  })

  assert.equal(octRes.byAgentId[aoPromoted.id].mfaTarget, 50000)
  assert.equal(octRes.byAgentId[aoPromoted.id].excessCreditPassedUp, 50000)
  assert.equal(octRes.byAgentId[amOld.id].cascadingMfaCreditReceived, 50000)
  assert.equal(octRes.byAgentId[amNew.id].cascadingMfaCreditReceived, 0)

  // Dec resets completely to 0
  const decRes = calculateMonthlyMfaBatch({
    profiles: [aoPromoted, amOld, amNew],
    policies: octPolicies,
    month: 12,
    year: 2026,
    referenceDate: new Date('2026-12-01T10:00:00Z'),
  })

  assert.equal(decRes.byAgentId[aoPromoted.id].mfaTarget, 350000)
  assert.equal(decRes.byAgentId[aoPromoted.id].totalMfaCredit, 0)
  assert.equal(decRes.byAgentId[amOld.id].cascadingMfaCreditReceived, 0)
  assert.equal(decRes.byAgentId[amNew.id].cascadingMfaCreditReceived, 0)
})

test('Scenario 8: Top hierarchy limit records unallocated_excess at root or Rank 11 boundary', () => {
  const sed = agent('sed-1', 'SM00008', 11, null)
  const ed = agent('ed-1', 'KB10001', 10, sed.id)
  const aoRoot = agent('ao-root', 'KB01099', 1, null)

  const res = calculateMonthlyMfaBatch({
    profiles: [aoRoot, ed, sed],
    policies: [
      policy({ id: 'p-root', agentId: aoRoot.id, fdAmount: 120000 }),
      policy({ id: 'p-ed', agentId: ed.id, fdAmount: 5500000 }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(res.byAgentId[aoRoot.id].excessUnallocatedCredit, 70000)
  const rootUnalloc = res.allocationsByPolicy['p-root'].find((a) => a.allocationType === 'unallocated_excess')
  assert.equal(rootUnalloc.unallocatedReason, 'no_superior')
  assert.equal(rootUnalloc.unallocatedAmount, 70000)

  assert.equal(res.byAgentId[ed.id].excessUnallocatedCredit, 500000)
  const edUnalloc = res.allocationsByPolicy['p-ed'].find((a) => a.allocationType === 'unallocated_excess')
  assert.equal(edUnalloc.unallocatedReason, 'no_eligible_mfa_superior')
  assert.equal(edUnalloc.unallocatedAmount, 500000)
  assertConservation(res)
})

test('Scenario 9: Duplicate processing protection (duplicate policy objects & repeated execution)', () => {
  const am = agent('am-1', 'KB02001', 2, null)
  const ao = agent('ao-1', 'KB01001', 1, am.id)
  const dupPol = policy({ id: 'p-dup', agentId: ao.id, fdAmount: 100000 })

  const run1 = calculateMonthlyMfaBatch({
    profiles: [ao, am],
    policies: [dupPol, { ...dupPol }],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })
  const run2 = calculateMonthlyMfaBatch({
    profiles: [ao, am],
    policies: [dupPol, { ...dupPol }],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  assert.equal(run1.byAgentId[ao.id].totalMfaCredit, 50000)
  assert.equal(run1.byAgentId[am.id].cascadingMfaCreditReceived, 50000)
  assert.equal(run1.allocations.length, 2)
  assert.deepEqual(run1.byAgentId[am.id].totalMfaCredit, run2.byAgentId[am.id].totalMfaCredit)
  assert.equal(run2.allocations.length, 2)
  assertConservation(run1)
})

test('Scenario 10: Hierarchy edge cases (self-loop, cycle, missing superior, inactive/suspended, admin stop)', () => {
  // 1. Self-referential loop
  const aoSelf = agent('ao-self', 'KB01010', 1, 'ao-self')
  // 2. Multi-hop cycle (a -> b -> a)
  const cycB = agent('cyc-b', 'KB02011', 2, 'cyc-a')
  const cycA = agent('cyc-a', 'KB01011', 1, 'cyc-b')
  cycB.sponsorId = cycA.id // cycA -> cycB -> cycA
  // 3. Inactive superior skipped -> active ADM above receives credit
  const activeAdm = agent('adm-ok', 'KB03012', 3, null)
  const inactiveAm = agent('am-off', 'KB02012', 2, activeAdm.id, 'inactive')
  const aoUnderInactive = agent('ao-off', 'KB01012', 1, inactiveAm.id)
  // 4. Missing superior UUID
  const aoBroken = agent('ao-brk', 'KB01013', 1, 'non-existent-uuid')

  const res = calculateMonthlyMfaBatch({
    profiles: [aoSelf, cycA, cycB, aoUnderInactive, inactiveAm, activeAdm, aoBroken],
    policies: [
      policy({ id: 'p-self', agentId: aoSelf.id, fdAmount: 80000, startDate: '2026-11-01' }),
      policy({ id: 'p-cyc', agentId: cycA.id, fdAmount: 500000, startDate: '2026-11-02' }),
      policy({ id: 'p-inact', agentId: aoUnderInactive.id, fdAmount: 200000, startDate: '2026-11-03' }),
      policy({ id: 'p-brk', agentId: aoBroken.id, fdAmount: 75000, startDate: '2026-11-04' }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  // Self loop handled safely
  assert.equal(res.byAgentId[aoSelf.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[aoSelf.id].excessUnallocatedCredit, 30000)

  // Multi-hop cycle fills cycA (50k) and cycB (350k) before cycle hits cycA again -> 100k unallocated
  assert.equal(res.byAgentId[cycA.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[cycB.id].cascadingMfaCreditReceived, 350000)
  assert.equal(res.byAgentId[cycB.id].excessUnallocatedCredit, 100000)

  // Inactive AM gets 0 credit/reward; excess reaches activeAdm cleanly
  assert.equal(res.byAgentId[inactiveAm.id].totalMfaCredit, 0)
  assert.equal(res.byAgentId[inactiveAm.id].rewardEarned, 0)
  assert.equal(res.byAgentId[activeAdm.id].cascadingMfaCreditReceived, 150000)

  // Missing superior handled cleanly
  assert.equal(res.byAgentId[aoBroken.id].totalMfaCredit, 50000)
  assert.equal(res.byAgentId[aoBroken.id].excessUnallocatedCredit, 25000)

  // Audit issues logged for all 4 anomalies
  const issueTypes = new Set(res.hierarchyIssues.map((i) => i.issueType))
  assert.ok(issueTypes.has('self_referential_cycle'))
  assert.ok(issueTypes.has('hierarchy_cycle'))
  assert.ok(issueTypes.has('inactive_superior'))
  assert.ok(issueTypes.has('missing_superior'))
  assertConservation(res)
})

test('Scenario 11: Historical agent_status_snapshot prevents subsequent status edits from altering closed months', () => {
  // Later profile changes: AM became inactive after October closed; inactive AO2 later became active.
  const amNowInactive = agent('am-hist', 'KB02050', 2, null, 'inactive')
  const aoNowActive = agent('ao-hist1', 'KB01050', 1, amNowInactive.id, 'inactive')
  const aoWasInactiveNowActive = agent('ao-hist2', 'KB01051', 1, amNowInactive.id, 'active')

  const res = calculateMonthlyMfaBatch({
    profiles: [amNowInactive, aoNowActive, aoWasInactiveNowActive],
    policies: [
      policy({ id: 'p-h1', agentId: aoNowActive.id, fdAmount: 150000, startDate: '2026-10-10' }),
      policy({ id: 'p-h2', agentId: aoWasInactiveNowActive.id, fdAmount: 100000, startDate: '2026-10-12' }),
    ],
    month: 10,
    year: 2026,
    snapshotsByAgentId: {
      [amNowInactive.id]: {
        rankSnapshot: 2,
        rankCodeSnapshot: 'AM',
        mfaTargetSnapshot: 350000,
        mfaRewardSnapshot: 5000,
        sponsorIdSnapshot: null,
        agentStatusSnapshot: 'active', // Was active in Oct snapshot
        isLocked: true,
      },
      [aoNowActive.id]: {
        rankSnapshot: 1,
        rankCodeSnapshot: 'AO',
        mfaTargetSnapshot: 50000,
        mfaRewardSnapshot: 3000,
        sponsorIdSnapshot: amNowInactive.id,
        agentStatusSnapshot: 'active', // Was active in Oct snapshot
        isLocked: true,
      },
      [aoWasInactiveNowActive.id]: {
        rankSnapshot: 1,
        rankCodeSnapshot: 'AO',
        mfaTargetSnapshot: 50000,
        mfaRewardSnapshot: 3000,
        sponsorIdSnapshot: amNowInactive.id,
        agentStatusSnapshot: 'inactive', // Was inactive in Oct snapshot
        isLocked: true,
      },
    },
    referenceDate: REF_DATE,
  })

  // ao-hist1 (snapshotted active) keeps ₹50k own + ₹3,000 reward & passes ₹1,00,000 up
  assert.equal(res.byAgentId[aoNowActive.id].ownMfaCreditApplied, 50000)
  assert.equal(res.byAgentId[aoNowActive.id].rewardEarned, 3000)
  // ao-hist2 (snapshotted inactive) does NOT retroactively gain ₹50k own credit from later reactivation; all ₹1,00,000 goes up
  assert.equal(res.byAgentId[aoWasInactiveNowActive.id].ownMfaCreditApplied, 0)
  assert.equal(res.byAgentId[aoWasInactiveNowActive.id].rewardEarned, 0)
  // am-hist (snapshotted active) receives ₹2,00,000 cascading despite later becoming inactive
  assert.equal(res.byAgentId[amNowInactive.id].cascadingMfaCreditReceived, 200000)
  assertConservation(res)
})

test('Scenario 12: Conservative handling & uncertainty logging when historical status snapshot is unreconstructable', () => {
  const adm = agent('adm-u', 'KB03060', 3, null, 'active')
  const am = agent('am-u', 'KB02060', 2, adm.id, 'active')

  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    const res = calculateMonthlyMfaBatch({
      profiles: [am, adm],
      policies: [
        policy({ id: 'p-unc', agentId: am.id, fdAmount: 400000, startDate: '2026-09-15' }),
      ],
      month: 9,
      year: 2026,
      snapshotsByAgentId: {
        // Zero documented applied activity + missing agentStatusSnapshot -> cannot prove active -> conservative 'unknown'
        [am.id]: {
          rankSnapshot: 2,
          rankCodeSnapshot: 'AM',
          mfaTargetSnapshot: 350000,
          mfaRewardSnapshot: 5000,
          sponsorIdSnapshot: adm.id,
          ownMfaCreditApplied: 0,
          totalMfaCredit: 0,
          isQualified: false,
        },
        // Documented historical applied activity without status column -> reliably reconstructable as 'active'
        [adm.id]: {
          rankSnapshot: 3,
          rankCodeSnapshot: 'ADM',
          mfaTargetSnapshot: 550000,
          mfaRewardSnapshot: 8000,
          sponsorIdSnapshot: null,
          cascadingMfaCreditReceived: 50000,
          totalMfaCredit: 50000,
        },
      },
      referenceDate: REF_DATE,
    })

    assert.equal(res.byAgentId[am.id].agentStatusSnapshot, 'unknown')
    assert.equal(res.byAgentId[am.id].statusSnapshotUncertain, true)
    assert.equal(res.byAgentId[am.id].ownMfaCreditApplied, 0)
    assert.equal(res.byAgentId[adm.id].agentStatusSnapshot, 'active')
    assert.equal(res.byAgentId[adm.id].statusSnapshotUncertain, false)
    assert.ok(warnings.some((w) => w.includes('am-u') && w.includes('unknown')))
  } finally {
    console.warn = origWarn
  }
})

test('Scenario 13: IST calendar boundary checks for open, closed, and future MFA periods', () => {
  // 2026-11-30 18:29:59 UTC == 2026-11-30 23:59:59 IST (November still open)
  const beforeMidnightIst = new Date('2026-11-30T18:29:59Z')
  assert.deepEqual(getCurrentIstPeriod(beforeMidnightIst), { month: 11, year: 2026, day: 30, ym: 202611 })
  assert.equal(isClosedMfaPeriod(10, 2026, beforeMidnightIst), true)
  assert.equal(isClosedMfaPeriod(11, 2026, beforeMidnightIst), false)
  assert.equal(isFutureMfaPeriod(12, 2026, beforeMidnightIst), true)

  // 2026-11-30 18:30:01 UTC == 2026-12-01 00:00:01 IST (November now closed, December open)
  const afterMidnightIst = new Date('2026-11-30T18:30:01Z')
  assert.deepEqual(getCurrentIstPeriod(afterMidnightIst), { month: 12, year: 2026, day: 1, ym: 202612 })
  assert.equal(isClosedMfaPeriod(11, 2026, afterMidnightIst), true)
  assert.equal(isClosedMfaPeriod(12, 2026, afterMidnightIst), false)
  assert.equal(isFutureMfaPeriod(12, 2026, afterMidnightIst), false)
  assert.equal(isFutureMfaPeriod(1, 2027, afterMidnightIst), true)
})

test('Scenario 14: totalUnallocatedCredit reconciles even when excess passes skipped_inactive into no_superior', () => {
  const inactiveTop = agent('top-off', 'KB02099', 2, null, 'inactive')
  const ao = agent('ao-skip', 'KB01098', 1, inactiveTop.id, 'active')

  const res = calculateMonthlyMfaBatch({
    profiles: [ao, inactiveTop],
    policies: [
      policy({ id: 'p-skip-end', agentId: ao.id, fdAmount: 150000 }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  // Self applied = 50,000; 1,00,000 passed to inactiveTop -> skipped_inactive -> no_superior unallocated 1,00,000
  const unallocStep = res.allocationsByPolicy['p-skip-end'].find((a) => a.allocationType === 'unallocated_excess')
  assert.equal(unallocStep.unallocatedAmount, 100000)
  assert.equal(res.totalUnallocatedCredit, 100000)
  assert.equal(res.totalCascadedCredit, 0)
  assertConservation(res)
})

test('Scenario 15: Filtered Excel export helper keeps Sheets 1, 2, 3 mutually consistent & uses snapshot hierarchy when closed', () => {
  // Team A: adm -> amA (KB02001) -> aoA (KB01026)
  // Team B: adm -> amB (KB02002) -> aoB (KB01001)
  const adm = agent('adm', 'KB03001', 3, null)
  const amA = agent('am-a', 'KB02001', 2, adm.id)
  const amB = agent('am-b', 'KB02002', 2, adm.id)
  const aoA = agent('ao-a', 'KB01026', 1, amA.id)
  const aoB = agent('ao-b', 'KB01001', 1, amB.id)

  const res = calculateMonthlyMfaBatch({
    profiles: [adm, amA, amB, aoA, aoB],
    policies: [
      policy({ id: 'pol-81638', number: 'APEX-PLN-81638', agentId: aoA.id, fdAmount: 150000, startDate: '2026-11-10' }),
      policy({ id: 'pol-66512', number: 'APEX-PLN-66512', agentId: aoB.id, fdAmount: 100000, startDate: '2026-11-11' }),
    ],
    month: 11,
    year: 2026,
    referenceDate: REF_DATE,
  })

  // Filter by Team KB02001
  const subtree = getMfaSubtreeIds(amA.id, [adm, amA, amB, aoA, aoB], res.records, false)
  const filteredRecords = filterMfaRecordsForView({ records: res.records, subtreeIds: subtree })
  const filteredTraces = filterPolicyTracesForView({
    allocationsByPolicy: res.allocationsByPolicy,
    records: res.records,
    subtreeIds: subtree,
  })
  const contribByAgent = {}
  res.records.forEach((r) => {
    contribByAgent[r.agentId] = r.contributions
  })
  const sheets = buildMfaExcelSheetsData({
    filteredRecords,
    contribByAgent,
    filteredPolicyTraces: filteredTraces,
    monthLabel: 'November 2026',
    allocationLabels: {},
  })

  assert.deepEqual(sheets.summaryRows.map((r) => r['Agent Code']).sort(), ['KB01026', 'KB02001'])
  assert.deepEqual(sheets.contribRows.map((r) => r['Policy Number']), ['APEX-PLN-81638'])
  assert.ok(sheets.cascadeRows.length > 0)
  assert.ok(sheets.cascadeRows.every((r) => r['Policy Number'] === 'APEX-PLN-81638'))

  // Closed month snapshot hierarchy: live profile moved aoA under amB, but snapshot kept aoA under amA
  const movedProfiles = [
    adm,
    amA,
    amB,
    { ...aoA, sponsorId: amB.id },
    aoB,
  ]
  const closedRecords = res.records.map((r) => ({ ...r, sponsorIdSnapshot: r.sponsorId }))
  const closedSubtreeAmA = getMfaSubtreeIds(amA.id, movedProfiles, closedRecords, true)
  assert.equal(closedSubtreeAmA.has(aoA.id), true)
  assert.equal(closedSubtreeAmA.has(aoB.id), false)
})

test('Scenario 16: calculateMonthlyMfaBatch supports normalized record snapshots (mfaTarget/mfaReward aliases)', () => {
  const ao = agent('ao-norm', 'KB01088', 2, null, 'inactive') // Currently promoted Rank 2 & inactive
  const res = calculateMonthlyMfaBatch({
    profiles: [ao],
    policies: [
      policy({ id: 'p-norm', agentId: ao.id, fdAmount: 60000, startDate: '2026-10-12' }),
    ],
    month: 10,
    year: 2026,
    snapshotsByAgentId: {
      // Shape returned by normalizeMfaRecord()
      [ao.id]: {
        agentId: ao.id,
        rankSnapshot: 1,
        rankCodeSnapshot: 'AO',
        mfaTarget: 50000,
        mfaReward: 3000,
        sponsorIdSnapshot: null,
        agentStatusSnapshot: 'active',
        isLocked: true,
      },
    },
    referenceDate: REF_DATE,
  })

  assert.equal(res.records.length, 1)
  assert.equal(res.byAgentId[ao.id].mfaTarget, 50000)
  assert.equal(res.byAgentId[ao.id].ownMfaCreditApplied, 50000)
  assert.equal(res.byAgentId[ao.id].rewardEarned, 3000)
  assert.equal(res.byAgentId[ao.id].agentStatusSnapshot, 'active')
})
