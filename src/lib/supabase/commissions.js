// ============================================================================
// APEX Supabase Data Access Layer — Commission Ledger Module
// ============================================================================
import { supabase, adminSupabase } from './client'
import { normalizeCommissionLedger } from './normalize'

const client = adminSupabase || supabase

function applyCommissionFilters(query, filters) {
  let q = query
  if (filters.agentId) q = q.eq('agent_id', filters.agentId)
  if (filters.policyId) q = q.eq('policy_id', filters.policyId)
  if (filters.month) q = q.eq('month', filters.month)
  if (filters.year) q = q.eq('year', filters.year)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.payoutId) q = q.eq('payout_id', filters.payoutId)
  return q
}

export async function listCommissionLedger(filters = {}) {
  const joinedSelect =
    '*, policies(policy_number, agent_id), customers(name, customer_id), agent:profiles!commission_ledger_agent_id_fkey(name, sponsor_code), original_agent:profiles!commission_ledger_original_agent_id_fkey(name, sponsor_code)'

  const query = applyCommissionFilters(
    client.from('commission_ledger').select(joinedSelect).order('calculation_date', { ascending: false }),
    filters
  )

  const { data, error } = await query
  if (error) {
    const fallback = applyCommissionFilters(
      client.from('commission_ledger').select('*').order('calculation_date', { ascending: false }),
      filters
    )
    const { data: rawData, error: rawErr } = await fallback
    if (rawErr) throw error
    return (rawData || []).map(normalizeCommissionLedger)
  }
  return (data || []).map(normalizeCommissionLedger)
}

export const listCommissions = listCommissionLedger

