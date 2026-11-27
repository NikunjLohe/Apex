// ============================================================================
// APEX Supabase Data Access Layer — Standalone Monthly MFA Module
// ============================================================================
// Uses authenticated Supabase client (`supabase`) for reads & RPC calls so
// RLS (`agent_id = auth.uid()` for agents, full read for admins) and backend
// authorization (`sync_monthly_mfa_cycle` checking `auth.uid()`) are enforced
// at the PostgreSQL layer!
// When the SQL migration (20261125_mfa_system.sql) hasn't been applied yet on
// the target database, gracefully returns `{ backendReady: false }` so UI pages
// can compute an accurate read-only mirror preview + display migration status.
// ============================================================================
import { supabase, adminSupabase } from './client'
import {
  normalizeMfaRecord,
  normalizeMfaContribution,
  normalizeMfaCascadingAllocation,
  normalizeMfaHierarchyIssue,
} from './normalize'
import {
  calculateMonthlyMfaForAgent,
  calculateMonthlyMfaBatch,
  getCurrentIstPeriod,
  isClosedMfaPeriod,
  isFutureMfaPeriod,
} from '../mfa'
import { listProfiles } from './profiles'
import { listPolicies } from './policies'
import { listPayments } from './payments'

function isReadOnlyImpersonation() {
  try {
    if (typeof sessionStorage === 'undefined') return false
    const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
    return Boolean(session?.active || session?.is_read_only)
  } catch {
    return false
  }
}

function isMissingMfaSchemaError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase()
  const code = String(err?.code || '')
  return (
    code === '42P01' ||
    code === '42883' ||
    code === '42703' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('agent_mfa_records') ||
    msg.includes('agent_mfa_contributions') ||
    msg.includes('agent_mfa_cascading_allocations') ||
    msg.includes('mfa_hierarchy_issues') ||
    msg.includes('sync_monthly_mfa_cycle') ||
    msg.includes('could not find the')
  )
}

function isMissingCascadingSchemaError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase()
  const code = String(err?.code || '')
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST205' ||
    msg.includes('agent_mfa_cascading_allocations') ||
    msg.includes('mfa_hierarchy_issues') ||
    msg.includes('cascading_mfa_credit_received') ||
    msg.includes('could not find the')
  )
}

/**
 * Trigger backend `sync_monthly_mfa_cycle(p_month, p_year)`.
 * Non-admin agents can only sync their own contributions inside the SECURITY DEFINER RPC.
 */
export async function syncMonthlyMfaCycle(month, year) {
  if (isReadOnlyImpersonation()) {
    return { success: false, backendReady: true, readOnlySkipped: true }
  }
  const istNow = getCurrentIstPeriod()
  const m = Number(month) || istNow.month
  const y = Number(year) || istNow.year
  if (isClosedMfaPeriod(m, y)) {
    return {
      success: false,
      backendReady: true,
      locked: true,
      readOnlySkipped: true,
      reason: 'closed_month_locked',
      month: m,
      year: y,
    }
  }
  if (isFutureMfaPeriod(m, y)) {
    return {
      success: false,
      backendReady: true,
      futurePeriod: true,
      readOnlySkipped: true,
      reason: 'future_month_not_started',
      month: m,
      year: y,
    }
  }
  const { data, error } = await supabase.rpc('sync_monthly_mfa_cycle', {
    p_month: m,
    p_year: y,
  })
  if (error) {
    if (isMissingMfaSchemaError(error)) {
      return { success: false, backendReady: false, reason: error.message }
    }
    throw error
  }
  return {
    ...(data || { success: true }),
    backendReady: true,
    cascadingReady: Boolean(data?.cascading_enabled),
  }
}

function splitAgentAllocations(allocList, agentId) {
  const selfByPolicyId = new Map()
  const cascadingIncoming = []
  const cascadingOutgoing = []

  ;(allocList || []).forEach((a) => {
    if (a.allocationType === 'self_own' && a.recipientAgentId === agentId) {
      selfByPolicyId.set(a.policyId, a)
    } else if (a.allocationType === 'cascading_from_downline' && a.recipientAgentId === agentId) {
      cascadingIncoming.push(a)
    } else if (a.sourceAgentId === agentId && a.allocationType !== 'self_own') {
      cascadingOutgoing.push(a)
    }
  })

  return { selfByPolicyId, cascadingIncoming, cascadingOutgoing }
}

/**
 * Fetch an agent's own MFA records (all historical + current months), own policy
 * contributions, incoming cascading credits, and outgoing excess allocations
 * for a selected month/year, enforcing backend RLS via `supabase`.
 */
export async function getAgentMfaDashboardData({ agentProfile, month, year, autoSync = true }) {
  const istNow = getCurrentIstPeriod()
  const targetMonth = Number(month) || istNow.month
  const targetYear = Number(year) || istNow.year
  const closedPeriod = isClosedMfaPeriod(targetMonth, targetYear)
  const futurePeriod = isFutureMfaPeriod(targetMonth, targetYear)
  const agentId = agentProfile?.id || agentProfile?.uid
  if (!agentId) {
    return {
      backendReady: true,
      cascadingReady: true,
      isClosedPeriod: closedPeriod,
      isFuturePeriod: futurePeriod,
      periodLocked: closedPeriod,
      currentRecord: null,
      contributions: [],
      cascadingIncoming: [],
      cascadingOutgoing: [],
      history: [],
    }
  }

  try {
    const impersonating = isReadOnlyImpersonation()
    if (autoSync && !impersonating && !closedPeriod && !futurePeriod) {
      await syncMonthlyMfaCycle(targetMonth, targetYear)
    }

    const readClient = impersonating ? (adminSupabase || supabase) : supabase

    const [recordsRes, contribRes, cascadeRes] = await Promise.all([
      readClient
        .from('agent_mfa_records')
        .select('*')
        .eq('agent_id', agentId)
        .order('year', { ascending: false })
        .order('month', { ascending: false }),
      readClient
        .from('agent_mfa_contributions')
        .select('*')
        .eq('agent_id', agentId)
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('business_date', { ascending: false }),
      readClient
        .from('agent_mfa_cascading_allocations')
        .select('*')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .or(`recipient_agent_id.eq.${agentId},source_agent_id.eq.${agentId}`)
        .order('business_date', { ascending: false })
        .order('allocation_sequence', { ascending: true }),
    ])

    if (recordsRes.error) throw recordsRes.error
    if (contribRes.error) throw contribRes.error

    const cascadingReady = !cascadeRes.error
    if (cascadeRes.error && !isMissingCascadingSchemaError(cascadeRes.error)) {
      throw cascadeRes.error
    }

    const history = (recordsRes.data || []).map(normalizeMfaRecord)
    const currentRecord =
      history.find((r) => r.month === targetMonth && r.year === targetYear) || null

    const rawContribs = (contribRes.data || []).map(normalizeMfaContribution)
    const allocations = cascadingReady
      ? (cascadeRes.data || []).map(normalizeMfaCascadingAllocation)
      : []

    const { selfByPolicyId, cascadingIncoming, cascadingOutgoing } = splitAgentAllocations(allocations, agentId)

    const contributions = rawContribs.map((c) => {
      const selfAlloc = selfByPolicyId.get(c.policyId)
      return {
        ...c,
        appliedToSelf: selfAlloc ? selfAlloc.appliedAmount : c.mfaCredit,
        excessPassedUp: selfAlloc ? selfAlloc.excessPassedUp : 0,
      }
    })

    return {
      backendReady: true,
      cascadingReady,
      isClosedPeriod: closedPeriod,
      isFuturePeriod: futurePeriod,
      periodLocked: closedPeriod || Boolean(currentRecord?.isLocked),
      currentRecord,
      contributions,
      cascadingIncoming,
      cascadingOutgoing,
      history,
    }
  } catch (err) {
    if (!isMissingMfaSchemaError(err)) throw err

    const [polList, payList] = await Promise.all([
      listPolicies({ agentId }).catch(() => []),
      listPayments({ agentId }).catch(() => []),
    ])

    const currentRecord = calculateMonthlyMfaForAgent({
      agent: agentProfile,
      policies: polList,
      payments: payList,
      month: targetMonth,
      year: targetYear,
    })

    const periodKeys = new Set([`${targetYear}-${targetMonth}`])
    ;(polList || []).forEach((p) => {
      const d = p.startDate ? new Date(p.startDate) : (p.createdAt ? new Date(p.createdAt) : null)
      if (d && !isNaN(d.getTime())) {
        periodKeys.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
      }
    })
    const history = Array.from(periodKeys)
      .map((k) => {
        const [y, m] = k.split('-').map(Number)
        return calculateMonthlyMfaForAgent({
          agent: agentProfile,
          policies: polList,
          payments: payList,
          month: m,
          year: y,
        })
      })
      .sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month))

    return {
      backendReady: false,
      cascadingReady: false,
      isClosedPeriod: closedPeriod,
      isFuturePeriod: futurePeriod,
      periodLocked: closedPeriod || Boolean(currentRecord?.isLocked),
      currentRecord,
      contributions: currentRecord.contributions || [],
      cascadingIncoming: currentRecord.cascadingIncoming || [],
      cascadingOutgoing: currentRecord.cascadingOutgoing || [],
      history,
    }
  }
}

function groupAllocations(allocations) {
  const allocationsByPolicy = {}
  const allocationsByAgent = {}
  ;(allocations || []).forEach((a) => {
    if (!allocationsByPolicy[a.policyId]) allocationsByPolicy[a.policyId] = []
    allocationsByPolicy[a.policyId].push(a)
    if (a.recipientAgentId) {
      if (!allocationsByAgent[a.recipientAgentId]) allocationsByAgent[a.recipientAgentId] = []
      allocationsByAgent[a.recipientAgentId].push(a)
    }
  })
  return { allocationsByPolicy, allocationsByAgent }
}

/**
 * Admin: Fetch all tracked agent MFA records, policy contributions, complete
 * cascading allocation history, and hierarchy issue audit warnings for a (month, year).
 */
export async function listAdminMfaCycle({ month, year, autoSync = true }) {
  const istNow = getCurrentIstPeriod()
  const targetMonth = Number(month) || istNow.month
  const targetYear = Number(year) || istNow.year
  const closedPeriod = isClosedMfaPeriod(targetMonth, targetYear)
  const futurePeriod = isFutureMfaPeriod(targetMonth, targetYear)

  try {
    if (autoSync && !closedPeriod && !futurePeriod) {
      await syncMonthlyMfaCycle(targetMonth, targetYear)
    }

    const [recRes, contribRes, cascadeRes, issuesRes] = await Promise.all([
      supabase
        .from('agent_mfa_records')
        .select('*, profiles(id, name, sponsor_code, sponsor_id, email, phone, rank, status)')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('total_mfa_credit', { ascending: false }),
      supabase
        .from('agent_mfa_contributions')
        .select('*')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('business_date', { ascending: false }),
      supabase
        .from('agent_mfa_cascading_allocations')
        .select('*')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('business_date', { ascending: true })
        .order('allocation_sequence', { ascending: true }),
      supabase
        .from('mfa_hierarchy_issues')
        .select('*')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('detected_at', { ascending: false }),
    ])

    if (recRes.error) throw recRes.error
    if (contribRes.error) throw contribRes.error

    const cascadingSchemaMissing =
      (cascadeRes.error && isMissingCascadingSchemaError(cascadeRes.error)) ||
      (issuesRes.error && isMissingCascadingSchemaError(issuesRes.error))

    if (cascadeRes.error && !isMissingCascadingSchemaError(cascadeRes.error)) throw cascadeRes.error
    if (issuesRes.error && !isMissingCascadingSchemaError(issuesRes.error)) throw issuesRes.error

    const existingSnapshots = {}
    ;(recRes.data || []).forEach((r) => {
      existingSnapshots[r.agent_id] = normalizeMfaRecord(r)
    })

    // If base MFA tables exist (20261125) but 20261126_cascading_mfa.sql has not yet been applied,
    // compute an accurate live Cascading preview using snapshotted records + full hierarchy.
    if (cascadingSchemaMissing) {
      const [profilesList, policiesList, paymentsList] = await Promise.all([
        listProfiles().catch(() => []),
        listPolicies().catch(() => []),
        listPayments().catch(() => []),
      ])
      const batch = calculateMonthlyMfaBatch({
        profiles: profilesList,
        policies: policiesList,
        payments: paymentsList,
        month: targetMonth,
        year: targetYear,
        snapshotsByAgentId: existingSnapshots,
      })
      const contribByAgent = {}
      batch.records.forEach((r) => {
        contribByAgent[r.agentId] = r.contributions || []
      })
      return {
        backendReady: true,
        cascadingReady: false,
        isClosedPeriod: closedPeriod,
        isFuturePeriod: futurePeriod,
        periodLocked: closedPeriod || Object.values(existingSnapshots).some((s) => Boolean(s?.isLocked)),
        month: targetMonth,
        year: targetYear,
        records: batch.records.sort((a, b) => b.totalMfaCredit - a.totalMfaCredit),
        contribByAgent,
        allocations: batch.allocations,
        allocationsByPolicy: batch.allocationsByPolicy,
        allocationsByAgent: batch.allocationsByAgent,
        hierarchyIssues: batch.hierarchyIssues,
        profiles: profilesList,
        totalTracked: batch.totalTracked,
        achievedCount: batch.achievedCount,
        notAchievedCount: batch.notAchievedCount,
        totalRewardsEarned: batch.totalRewardsEarned,
        totalCascadedCredit: batch.totalCascadedCredit,
        totalUnallocatedCredit: batch.totalUnallocatedCredit,
      }
    }

    const profilesList = await listProfiles().catch(() => [])
    const records = (recRes.data || []).map(normalizeMfaRecord)
    const contributions = (contribRes.data || []).map(normalizeMfaContribution)
    const allocations = (cascadeRes.data || []).map(normalizeMfaCascadingAllocation)
    const hierarchyIssues = (issuesRes.data || []).map(normalizeMfaHierarchyIssue)
    const { allocationsByPolicy, allocationsByAgent } = groupAllocations(allocations)

    const selfAllocByPolicy = new Map()
    allocations.forEach((a) => {
      if (a.allocationType === 'self_own') selfAllocByPolicy.set(a.policyId, a)
    })

    const contribByAgent = {}
    contributions.forEach((c) => {
      if (!contribByAgent[c.agentId]) contribByAgent[c.agentId] = []
      const selfA = selfAllocByPolicy.get(c.policyId)
      contribByAgent[c.agentId].push({
        ...c,
        appliedToSelf: selfA ? selfA.appliedAmount : c.mfaCredit,
        excessPassedUp: selfA ? selfA.excessPassedUp : 0,
      })
    })

    const applicableRecs = records.filter((r) => r.applicable)
    const achievedRecs = applicableRecs.filter((r) => r.isQualified)

    return {
      backendReady: true,
      cascadingReady: true,
      isClosedPeriod: closedPeriod,
      isFuturePeriod: futurePeriod,
      periodLocked: closedPeriod || records.some((r) => Boolean(r.isLocked)),
      month: targetMonth,
      year: targetYear,
      records,
      contribByAgent,
      allocations,
      allocationsByPolicy,
      allocationsByAgent,
      hierarchyIssues,
      profiles: profilesList,
      totalTracked: applicableRecs.length,
      achievedCount: achievedRecs.length,
      notAchievedCount: Math.max(0, applicableRecs.length - achievedRecs.length),
      totalRewardsEarned: Number(
        achievedRecs.reduce((s, r) => s + Number(r.rewardEarned || 0), 0).toFixed(2)
      ),
      totalCascadedCredit: Number(
        records.reduce((s, r) => s + Number(r.cascadingMfaCreditReceived || 0), 0).toFixed(2)
      ),
      totalUnallocatedCredit: Number(
        allocations
          .filter((a) => a.allocationType === 'unallocated_excess')
          .reduce((s, a) => s + Number(a.unallocatedAmount || 0), 0)
          .toFixed(2)
      ),
    }
  } catch (err) {
    if (!isMissingMfaSchemaError(err)) throw err

    const [profilesList, policiesList, paymentsList] = await Promise.all([
      listProfiles().catch(() => []),
      listPolicies().catch(() => []),
      listPayments().catch(() => []),
    ])

    const batch = calculateMonthlyMfaBatch({
      profiles: profilesList,
      policies: policiesList,
      payments: paymentsList,
      month: targetMonth,
      year: targetYear,
    })

    const contribByAgent = {}
    batch.records.forEach((r) => {
      contribByAgent[r.agentId] = r.contributions || []
    })

    return {
      backendReady: false,
      cascadingReady: false,
      isClosedPeriod: closedPeriod,
      isFuturePeriod: futurePeriod,
      periodLocked: closedPeriod,
      month: targetMonth,
      year: targetYear,
      records: batch.records.sort((a, b) => b.totalMfaCredit - a.totalMfaCredit),
      contribByAgent,
      allocations: batch.allocations,
      allocationsByPolicy: batch.allocationsByPolicy,
      allocationsByAgent: batch.allocationsByAgent,
      hierarchyIssues: batch.hierarchyIssues,
      profiles: profilesList,
      totalTracked: batch.totalTracked,
      achievedCount: batch.achievedCount,
      notAchievedCount: batch.notAchievedCount,
      totalRewardsEarned: batch.totalRewardsEarned,
      totalCascadedCredit: batch.totalCascadedCredit,
      totalUnallocatedCredit: batch.totalUnallocatedCredit,
    }
  }
}

/**
 * Admin: Fetch an agent's complete multi-month historical MFA records (read-only view).
 */
export async function getAgentMfaHistoryAdmin(agentId, agentProfile = null) {
  if (!agentId) return []
  try {
    const { data, error } = await supabase
      .from('agent_mfa_records')
      .select('*')
      .eq('agent_id', agentId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (error) throw error
    return (data || []).map(normalizeMfaRecord)
  } catch (err) {
    if (!isMissingMfaSchemaError(err)) throw err
    if (!agentProfile) return []
    const [polList, payList] = await Promise.all([
      listPolicies({ agentId }).catch(() => []),
      listPayments({ agentId }).catch(() => []),
    ])
    const now = new Date()
    const keys = new Set([`${now.getFullYear()}-${now.getMonth() + 1}`])
    ;(polList || []).forEach((p) => {
      const d = p.startDate ? new Date(p.startDate) : null
      if (d && !isNaN(d.getTime())) keys.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    })
    return Array.from(keys)
      .map((k) => {
        const [y, m] = k.split('-').map(Number)
        return calculateMonthlyMfaForAgent({
          agent: agentProfile,
          policies: polList,
          payments: payList,
          month: m,
          year: y,
        })
      })
      .sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month))
  }
}
