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
import { normalizeMfaRecord, normalizeMfaContribution } from './normalize'
import {
  calculateMonthlyMfaForAgent,
  calculateMonthlyMfaBatch,
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
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('agent_mfa_records') ||
    msg.includes('agent_mfa_contributions') ||
    msg.includes('sync_monthly_mfa_cycle') ||
    msg.includes('could not find the')
  )
}

/**
 * Trigger backend `sync_monthly_mfa_cycle(p_month, p_year)`.
 * Non-admin agents can only sync their own record inside the SECURITY DEFINER RPC.
 */
export async function syncMonthlyMfaCycle(month, year) {
  if (isReadOnlyImpersonation()) {
    return { success: false, backendReady: true, readOnlySkipped: true }
  }
  const m = Number(month) || (new Date().getMonth() + 1)
  const y = Number(year) || new Date().getFullYear()
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
  return { ...(data || { success: true }), backendReady: true }
}

/**
 * Fetch an agent's own MFA records (all historical + current months) & contributions
 * for a selected month/year, enforcing backend RLS via `supabase`.
 */
export async function getAgentMfaDashboardData({ agentProfile, month, year, autoSync = true }) {
  const targetMonth = Number(month) || (new Date().getMonth() + 1)
  const targetYear = Number(year) || new Date().getFullYear()
  const agentId = agentProfile?.id || agentProfile?.uid
  if (!agentId) {
    return { backendReady: true, currentRecord: null, contributions: [], history: [] }
  }

  try {
    const impersonating = isReadOnlyImpersonation()
    if (autoSync && !impersonating) {
      await syncMonthlyMfaCycle(targetMonth, targetYear)
    }

    const readClient = impersonating ? (adminSupabase || supabase) : supabase

    const [recordsRes, contribRes] = await Promise.all([
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
    ])

    if (recordsRes.error) throw recordsRes.error
    if (contribRes.error) throw contribRes.error

    const history = (recordsRes.data || []).map(normalizeMfaRecord)
    const currentRecord =
      history.find((r) => r.month === targetMonth && r.year === targetYear) || null
    const contributions = (contribRes.data || []).map(normalizeMfaContribution)

    return {
      backendReady: true,
      currentRecord,
      contributions,
      history,
    }
  } catch (err) {
    if (!isMissingMfaSchemaError(err)) throw err

    // Pre-migration mirror fallback scoped strictly to this agent's own policies
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

    // Build distinct historical months from the agent's own policies
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
      currentRecord,
      contributions: currentRecord.contributions || [],
      history,
    }
  }
}

/**
 * Admin: Fetch all tracked agent MFA records for a given (month, year) and optional
 * individual contributions / agent history.
 */
export async function listAdminMfaCycle({ month, year, autoSync = true }) {
  const targetMonth = Number(month) || (new Date().getMonth() + 1)
  const targetYear = Number(year) || new Date().getFullYear()

  try {
    if (autoSync) {
      await syncMonthlyMfaCycle(targetMonth, targetYear)
    }

    const [recRes, contribRes] = await Promise.all([
      supabase
        .from('agent_mfa_records')
        .select('*, profiles(id, name, sponsor_code, email, phone, rank, status)')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('total_mfa_credit', { ascending: false }),
      supabase
        .from('agent_mfa_contributions')
        .select('*')
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .order('business_date', { ascending: false }),
    ])

    if (recRes.error) throw recRes.error
    if (contribRes.error) throw contribRes.error

    const records = (recRes.data || []).map(normalizeMfaRecord)
    const contributions = (contribRes.data || []).map(normalizeMfaContribution)
    const contribByAgent = {}
    contributions.forEach((c) => {
      if (!contribByAgent[c.agentId]) contribByAgent[c.agentId] = []
      contribByAgent[c.agentId].push(c)
    })

    const applicableRecs = records.filter((r) => r.applicable)
    const achievedRecs = applicableRecs.filter((r) => r.isQualified)

    return {
      backendReady: true,
      month: targetMonth,
      year: targetYear,
      records,
      contribByAgent,
      totalTracked: applicableRecs.length,
      achievedCount: achievedRecs.length,
      notAchievedCount: Math.max(0, applicableRecs.length - achievedRecs.length),
      totalRewardsEarned: Number(
        achievedRecs.reduce((s, r) => s + Number(r.rewardEarned || 0), 0).toFixed(2)
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
      month: targetMonth,
      year: targetYear,
      records: batch.records.sort((a, b) => b.totalMfaCredit - a.totalMfaCredit),
      contribByAgent,
      totalTracked: batch.totalTracked,
      achievedCount: batch.achievedCount,
      notAchievedCount: batch.notAchievedCount,
      totalRewardsEarned: batch.totalRewardsEarned,
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
