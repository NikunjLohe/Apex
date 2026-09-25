// ============================================================================
// APEX Supabase Data Access Layer — Commission Ledger Module
// ============================================================================
import { supabase } from './client'
import { normalizeCommissionLedger } from './normalize'

export async function listCommissionLedger(filters = {}) {
  let query = supabase.from('commission_ledger').select('*').order('calculation_date', { ascending: false })

  if (filters.agentId) query = query.eq('agent_id', filters.agentId)
  if (filters.month) query = query.eq('month', filters.month)
  if (filters.year) query = query.eq('year', filters.year)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.payoutId) query = query.eq('payout_id', filters.payoutId)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeCommissionLedger)
}

export const listCommissions = listCommissionLedger

