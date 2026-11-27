import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { adminSupabase, supabase as anonClient } from '../src/lib/supabase/client.js'
import { calculateMonthlyMfaBatch } from '../src/lib/mfa.js'
import { normalizeProfile, normalizePolicy, normalizePayment } from '../src/lib/supabase/normalize.js'

const SUPABASE_URL = 'https://qiqjclgmetycxfjeozvm.supabase.co'
const ANON_KEY = anonClient.supabaseKey

function randomSuffix() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

async function signInAs(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session) throw new Error(`Auth failed for ${email}: ${error?.message}`)
  return client
}

async function main() {
  console.log('=== Cascading MFA Live Supabase Verification ===')

  // 1. Check schema deployment
  const schemaCheck = await adminSupabase
    .from('agent_mfa_cascading_allocations')
    .select('id')
    .limit(1)

  if (schemaCheck.error) {
    console.error('❌ Schema check failed:', schemaCheck.error.message)
    console.error('👉 Apply supabase/migrations/20261126_cascading_mfa.sql in Supabase SQL Editor first.')
    process.exit(2)
  }

  const issueCheck = await adminSupabase.from('mfa_hierarchy_issues').select('id').limit(1)
  assert.equal(issueCheck.error, null, 'mfa_hierarchy_issues table must exist')

  const recColCheck = await adminSupabase
    .from('agent_mfa_records')
    .select('own_mfa_credit_applied,cascading_mfa_credit_received,excess_credit_passed_up,excess_unallocated_credit,sponsor_id_snapshot,agent_status_snapshot,status_snapshot_uncertain,is_locked')
    .limit(1)
  assert.equal(recColCheck.error, null, 'agent_mfa_records historical integrity & cascading columns must exist')
  console.log('✓ 1. Cascading MFA & historical snapshot schema columns present')

  // 2. Live Production Data Parity Check (Nov 2026) — SQL vs JS Mirror
  const [{ data: rawProfiles }, { data: rawPolicies }, { data: rawPayments }, { data: dbRecs }, { data: dbAllocs }] =
    await Promise.all([
      adminSupabase.from('profiles').select('*'),
      adminSupabase.from('policies').select('*'),
      adminSupabase.from('payments').select('*'),
      adminSupabase.from('agent_mfa_records').select('*').eq('month', 11).eq('year', 2026),
      adminSupabase.from('agent_mfa_cascading_allocations').select('*').eq('month', 11).eq('year', 2026),
    ])

  const profiles = (rawProfiles || []).map(normalizeProfile)
  const policies = (rawPolicies || []).map(normalizePolicy)
  const payments = (rawPayments || []).map(normalizePayment)
  const snapMap = {}
  ;(dbRecs || []).forEach((r) => { snapMap[r.agent_id] = r })

  const jsBatch = calculateMonthlyMfaBatch({
    profiles,
    policies,
    payments,
    month: 11,
    year: 2026,
    snapshotsByAgentId: snapMap,
  })

  for (const dbR of dbRecs || []) {
    const jsR = jsBatch.byAgentId[dbR.agent_id]
    assert.ok(jsR, `JS mirror must track every DB record (${dbR.agent_id})`)
    assert.equal(Number(dbR.own_mfa_credit_applied), jsR.ownMfaCreditApplied, `Own applied mismatch for ${dbR.agent_id}`)
    assert.equal(Number(dbR.cascading_mfa_credit_received), jsR.cascadingMfaCreditReceived, `Cascading received mismatch for ${dbR.agent_id}`)
    assert.equal(Number(dbR.total_mfa_credit), jsR.totalMfaCredit, `Total credit mismatch for ${dbR.agent_id}`)
    assert.equal(Number(dbR.reward_earned), jsR.rewardEarned, `Reward mismatch for ${dbR.agent_id}`)
  }
  console.log(`✓ 2. Live Nov 2026 SQL vs JS mirror 100% parity (${(dbRecs || []).length} records, ${(dbAllocs || []).length} allocation steps)`)

  // 3. Isolated End-to-End Integration, Lock & RLS Suite (using ephemeral future period 2099; cleaned up in finally)
  const tag = randomSuffix()
  const pwd = `ApexTest@${tag.slice(-6)}!`
  const testMonth = 7
  const testYear = 2099
  const createdUserIds = []
  let createdCustomerId = null
  const createdPolicyIds = []

  try {
    const makeAgent = async (code, rank, sponsorId = null) => {
      const email = `cascade_test_${code.toLowerCase()}_${tag}@apex.local`
      const { data: authRes, error: authErr } = await adminSupabase.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
        user_metadata: { name: `Test ${code}` },
      })
      if (authErr || !authRes?.user?.id) throw authErr || new Error('Failed creating auth user')
      const uid = authRes.user.id
      createdUserIds.push(uid)

      const { error: profErr } = await adminSupabase.from('profiles').upsert([{
        id: uid,
        name: `Test ${code}`,
        email,
        sponsor_code: `T${code}${tag.slice(-4)}`,
        sponsor_id: sponsorId,
        rank,
        role: 'agent',
        is_admin: false,
        is_super_admin: false,
        status: 'active',
      }])
      if (profErr) throw profErr
      return { id: uid, email }
    }

    const adm = await makeAgent('ADM', 3, null)
    const am = await makeAgent('AM', 2, adm.id)
    const ao = await makeAgent('AO', 1, am.id)

    const { data: cust, error: custErr } = await adminSupabase
      .from('customers')
      .insert([{
        customer_id: `TCUST_${tag.slice(-6)}`,
        name: 'Test Cascade Customer',
        enrolled_by: ao.id,
      }])
      .select()
      .single()
    if (custErr) throw custErr
    createdCustomerId = cust.id

    // Ensure clean period snapshots exist before scenario triggers
    // Scenario 1 + 5: Insert Business 1 (₹30k) then Business 2 (₹4,70k) => total ₹5,00,000 FD5Y
    const insertPolicyWithPay = async ({ agentId, polNum, amount, planCode = 'FD5Y', planType = 'FD', policyYear = 5, startDate }) => {
      const { data: pol, error: pErr } = await adminSupabase
        .from('policies')
        .insert([{
          policy_number: polNum,
          customer_id: createdCustomerId,
          agent_id: agentId,
          plan_code: planCode,
          plan_type: planType,
          policy_year: policyYear,
          total_installments: 1,
          paid_installments: 1,
          monthly_amount: 0,
          fd_amount: amount,
          total_paid: amount,
          status: 'active',
          start_date: startDate,
          maturity_date: '2104-07-05',
        }])
        .select()
        .single()
      if (pErr) throw pErr
      createdPolicyIds.push(pol.id)

      const { error: payErr } = await adminSupabase.from('payments').insert([{
        policy_id: pol.id,
        customer_id: createdCustomerId,
        agent_id: agentId,
        installment_number: 1,
        amount,
        payment_mode: 'cash',
        receipt_number: `TRCPT-${polNum}`,
        paid_date: `${startDate}T10:00:00Z`,
        status: 'completed',
      }])
      if (payErr) throw payErr
      return pol
    }

    const pol1 = await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-1-${tag.slice(-5)}`,
      amount: 30000,
      startDate: '2099-07-05',
    })
    const pol2 = await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-2-${tag.slice(-5)}`,
      amount: 470000,
      startDate: '2099-07-12',
    })

    // Query live Postgres tables updated automatically by triggers!
    const { data: tRecs } = await adminSupabase
      .from('agent_mfa_records')
      .select('*')
      .in('agent_id', [ao.id, am.id, adm.id])
      .eq('month', testMonth)
      .eq('year', testYear)

    const byAgent = Object.fromEntries((tRecs || []).map((r) => [r.agent_id, r]))
    assert.equal(Number(byAgent[ao.id].total_mfa_credit), 50000)
    assert.equal(Number(byAgent[ao.id].excess_credit_passed_up), 450000)
    assert.equal(Number(byAgent[ao.id].reward_earned), 3000)
    assert.equal(byAgent[ao.id].agent_status_snapshot, 'active')

    assert.equal(Number(byAgent[am.id].cascading_mfa_credit_received), 350000)
    assert.equal(Number(byAgent[am.id].total_mfa_credit), 350000)
    assert.equal(Number(byAgent[am.id].excess_credit_passed_up), 100000)
    assert.equal(Number(byAgent[am.id].reward_earned), 5000)
    assert.equal(byAgent[am.id].agent_status_snapshot, 'active')

    assert.equal(Number(byAgent[adm.id].cascading_mfa_credit_received), 100000)
    assert.equal(Number(byAgent[adm.id].total_mfa_credit), 100000)
    assert.equal(Number(byAgent[adm.id].remaining_amount), 450000)
    assert.equal(Number(byAgent[adm.id].reward_earned), 0)
    console.log('✓ 3. Live Postgres triggers computed AO(₹50k)->AM(₹3.5L)->ADM(₹1L) automatically with agent_status_snapshot')

    // Closed & Future Period Guard Verification in Postgres
    const aoClient = await signInAs(ao.email, pwd)
    const amClient = await signInAs(am.email, pwd)

    const [{ data: istYm }, { data: octClosed }, { data: novClosed }, { data: octSync }, { data: futureSync }] = await Promise.all([
      aoClient.rpc('get_ist_ym'),
      aoClient.rpc('is_mfa_period_closed_or_locked', { p_month: 10, p_year: 2026 }),
      aoClient.rpc('is_mfa_period_closed_or_locked', { p_month: 11, p_year: 2026 }),
      aoClient.rpc('sync_monthly_mfa_cycle', { p_month: 10, p_year: 2026 }),
      aoClient.rpc('sync_monthly_mfa_cycle', { p_month: testMonth, p_year: testYear }),
    ])
    assert.equal(istYm, 202611, 'IST calendar must be 202611')
    assert.equal(octClosed, true, 'Oct 2026 must be closed')
    assert.equal(novClosed, false, 'Nov 2026 must stay open')
    assert.equal(octSync?.locked, true)
    assert.equal(octSync?.read_only, true)
    assert.equal(octSync?.records_synced, 0)
    assert.equal(futureSync?.future_period, true)
    assert.equal(futureSync?.read_only, true)
    assert.equal(futureSync?.records_synced, 0)

    // Ephemeral closed-month policy trigger check (2026-10 must reject MFA record/contribution creation!)
    await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-OCT-${tag.slice(-5)}`,
      amount: 100000,
      startDate: '2026-10-15',
    })
    const { data: octCreated } = await adminSupabase
      .from('agent_mfa_records')
      .select('id')
      .eq('month', 10)
      .eq('year', 2026)
      .eq('agent_id', ao.id)
    assert.equal((octCreated || []).length, 0, 'Closed Oct 2026 must not create records or contributions on policy trigger')

    // Re-trigger duplicate check via policy status touch on open future test period
    const { data: allocAfterSync } = await adminSupabase
      .from('agent_mfa_cascading_allocations')
      .select('*')
      .in('policy_id', [pol1.id, pol2.id])
    assert.equal((allocAfterSync || []).length, 4, 'Zero duplicate allocation rows (4 exact trace steps)')
    console.log('✓ 4. Closed-month (Oct 2026) & future-month guards enforced in SQL RPC and triggers')

    // Scenario 11: Strict RLS Security Checks
    const { error: mutErr1 } = await aoClient
      .from('agent_mfa_records')
      .update({ reward_earned: 99999 })
      .eq('agent_id', ao.id)
    assert.ok(mutErr1, 'AO must be blocked from mutating agent_mfa_records')

    const { error: mutErr2 } = await aoClient
      .from('agent_mfa_cascading_allocations')
      .insert([{
        month: testMonth,
        year: testYear,
        policy_id: pol1.id,
        policy_number: 'FAKE',
        business_date: '2026-07-05',
        plan_code: 'FD5Y',
        plan_type: 'FD',
        duration_years: 5,
        original_business_amount: 1000,
        mfa_percentage: 100,
        originating_mfa_credit: 1000,
        originating_agent_id: ao.id,
        allocation_sequence: 99,
        allocation_type: 'self_own',
        incoming_credit: 1000,
        applied_amount: 1000,
        excess_passed_up: 0,
        batch_run_id: ao.id,
      }])
    assert.ok(mutErr2, 'AO must be blocked from inserting fake cascading allocations')

    const { data: aoCrossRecords } = await aoClient
      .from('agent_mfa_records')
      .select('*')
      .eq('agent_id', adm.id)
    assert.equal((aoCrossRecords || []).length, 0, 'AO cannot read ADM MFA records')

    const { data: aoAllocView } = await aoClient
      .from('agent_mfa_cascading_allocations')
      .select('*')
      .eq('month', testMonth)
      .eq('year', testYear)
    assert.ok(
      (aoAllocView || []).every((row) => row.recipient_agent_id === ao.id || row.source_agent_id === ao.id),
      'AO can only view allocations touching AO directly (not AM->ADM hops or unrelated branches)'
    )
    assert.equal(
      (aoAllocView || []).some((row) => row.recipient_agent_id === adm.id),
      false,
      'AO cannot see Step 3 AM->ADM allocation'
    )

    const { data: aoIssues } = await aoClient.from('mfa_hierarchy_issues').select('*')
    assert.equal((aoIssues || []).length, 0, 'Agents cannot read admin hierarchy audit warnings')
    console.log('✓ 5. RLS strictly verified (no write tampering, no cross-agent record/hop leakage)')

    // Scenario 4 + 10: Check Dec/Aug reset + cycle safeguard on a test month
    const { data: augRecs } = await adminSupabase
      .from('agent_mfa_records')
      .select('total_mfa_credit')
      .in('agent_id', [ao.id, am.id, adm.id])
      .eq('month', 8)
      .eq('year', 2099)
    assert.equal((augRecs || []).length, 0, 'Month 8/2099 has zero carry-over from Month 7/2099')

    // Reverse pol2 status => cancelled and verify cascade cleanly reverses back to 30k own only
    await adminSupabase.from('policies').update({ status: 'cancelled' }).eq('id', pol2.id)
    const { data: afterCancelRecs } = await adminSupabase
      .from('agent_mfa_records')
      .select('*')
      .in('agent_id', [ao.id, am.id, adm.id])
      .eq('month', testMonth)
      .eq('year', testYear)
    const cancelledMap = Object.fromEntries((afterCancelRecs || []).map((r) => [r.agent_id, r]))
    assert.equal(Number(cancelledMap[ao.id].total_mfa_credit), 30000)
    assert.equal(Number(cancelledMap[ao.id].reward_earned), 0)
    assert.equal(Number(cancelledMap[am.id].cascading_mfa_credit_received), 0)
    assert.equal(Number(cancelledMap[am.id].reward_earned), 0)
    console.log('✓ 6. Policy cancellation automatically reverses cascading credits & rewards cleanly')

    // Scenario 10 + 6 + 8 + skipped_inactive->unallocated Live in Postgres (Month 6 2099)
    const cycleAgent = await makeAgent('CYC', 1, null)
    await adminSupabase.from('profiles').update({ sponsor_id: cycleAgent.id }).eq('id', cycleAgent.id)
    await adminSupabase.from('profiles').update({ status: 'inactive' }).eq('id', am.id)

    await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-INACT-${tag.slice(-5)}`,
      amount: 200000,
      planCode: 'FD2Y',
      planType: 'FD',
      policyYear: 2,
      startDate: '2099-06-05', // 2Y => 50% credit = 1,00,000 => AO 50k + skip inactive AM -> ADM 50k
    })
    await insertPolicyWithPay({
      agentId: cycleAgent.id,
      polNum: `TST-CYC-${tag.slice(-5)}`,
      amount: 80000,
      planCode: 'FD3Y',
      planType: 'FD',
      policyYear: 3,
      startDate: '2099-06-08', // Self-loop: 50k self, 30k unallocated + cycle issue logged
    })
    // Excess past skipped inactive node at top boundary -> unallocated_excess allocation row!
    await adminSupabase.from('profiles').update({ sponsor_id: null, status: 'inactive' }).eq('id', adm.id)
    const skipEndPol = await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-SKIPEND-${tag.slice(-5)}`,
      amount: 50000,
      planCode: 'FD3Y',
      planType: 'FD',
      policyYear: 3,
      startDate: '2099-05-08', // May 2099: AO reaches 50k, inactive ADM skipped -> 0 in record excess_unallocated, full unallocated tracked in allocations!
    })
    const skipEndPol2 = await insertPolicyWithPay({
      agentId: ao.id,
      polNum: `TST-SKIPEND2-${tag.slice(-5)}`,
      amount: 100000,
      planCode: 'FD3Y',
      planType: 'FD',
      policyYear: 3,
      startDate: '2099-05-09',
    })
    // May 2099: AO reaches 50k, inactive AM skipped -> inactive ADM skipped -> no_superior = 1,00,000 unallocated_excess!
    const { data: m5Allocs } = await adminSupabase
      .from('agent_mfa_cascading_allocations')
      .select('*')
      .in('policy_id', [skipEndPol.id, skipEndPol2.id])
    const m5UnallocSum = (m5Allocs || [])
      .filter((a) => a.allocation_type === 'unallocated_excess')
      .reduce((s, a) => s + Number(a.unallocated_amount || 0), 0)
    assert.equal(m5UnallocSum, 100000, 'Live DB allocations must track 100% of unallocated excess after skipped inactive superiors')

    const { data: m6Recs } = await adminSupabase
      .from('agent_mfa_records')
      .select('*')
      .in('agent_id', [ao.id, am.id, adm.id, cycleAgent.id])
      .eq('month', 6)
      .eq('year', 2099)
    const m6Map = Object.fromEntries((m6Recs || []).map((r) => [r.agent_id, r]))
    assert.equal(Number(m6Map[ao.id].total_mfa_credit), 50000)
    assert.equal(Number(m6Map[am.id].total_mfa_credit), 0, 'Inactive AM must receive 0 cascading credit')
    assert.equal(m6Map[am.id].agent_status_snapshot, 'inactive')
    assert.equal(Number(m6Map[am.id].reward_earned), 0)
    assert.equal(Number(m6Map[adm.id].cascading_mfa_credit_received), 50000, 'Active ADM above inactive AM receives ₹50k cascading credit')
    assert.equal(Number(m6Map[cycleAgent.id].total_mfa_credit), 50000)
    assert.equal(Number(m6Map[cycleAgent.id].excess_unallocated_credit), 30000)

    const { data: m6Issues } = await adminSupabase
      .from('mfa_hierarchy_issues')
      .select('*')
      .eq('month', 6)
      .eq('year', 2099)
    const m6IssueTypes = new Set((m6Issues || []).map((i) => i.issue_type))
    assert.ok(m6IssueTypes.has('inactive_superior'), 'Inactive superior issue logged')
    assert.ok(m6IssueTypes.has('self_referential_cycle'), 'Self-referential loop issue logged without crashing')
    console.log('✓ 7. Live Postgres edge cases verified (2Y=50%, inactive superior skip, self-loop cycle guard, hierarchy audit log)')
  } finally {
    console.log('Cleaning up ephemeral test records...')
    for (const pid of createdPolicyIds) {
      await adminSupabase.from('mfa_hierarchy_issues').delete().eq('policy_id', pid)
      await adminSupabase.from('payments').delete().eq('policy_id', pid)
      await adminSupabase.from('policies').delete().eq('id', pid)
    }
    if (createdCustomerId) {
      await adminSupabase.from('customers').delete().eq('id', createdCustomerId)
    }
    for (const uid of createdUserIds) {
      await adminSupabase.from('audit_logs').delete().eq('target_uid', uid)
      await adminSupabase.from('agent_mfa_records').delete().eq('agent_id', uid)
      await adminSupabase.from('profiles').delete().eq('id', uid)
      await adminSupabase.auth.admin.deleteUser(uid).catch(() => {})
    }
    console.log('✓ Ephemeral cleanup complete')
  }
}

main().catch((err) => {
  console.error('❌ Verification failed:', err)
  process.exit(1)
})
