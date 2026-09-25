// ============================================================================
// APEX Supabase Data Access Layer — Payouts Module
// ============================================================================
import { supabase } from './client'
import { normalizePayout } from './normalize'

export async function listPayouts(filters = {}) {
  let query = supabase.from('payouts').select('*').order('generated_date', { ascending: false })

  if (filters.agentId) query = query.eq('agent_id', filters.agentId)
  if (filters.month) query = query.eq('month', filters.month)
  if (filters.year) query = query.eq('year', filters.year)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizePayout)
}

export async function getPayout(id) {
  const { data, error } = await supabase
    .from('payouts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return normalizePayout(data)
}

/**
 * generateMonthlyPayouts()
 * High-Risk Operation: Monthly payout consolidation via Supabase RPC.
 */
export async function generateMonthlyPayouts(month, year) {
  // Guard: View As Agent mode is strictly read-only
  const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
  if (session?.active || session?.is_read_only) {
    throw new Error('READ-ONLY: Payout generation is strictly disabled in View As Agent mode.')
  }

  const { data, error } = await supabase.rpc('generate_monthly_payouts', {
    p_month: Number(month),
    p_year: Number(year),
  })

  if (error) throw error
  return data
}

export async function updatePayoutStatus(id, status, notes = null) {
  // Guard: View As Agent mode is strictly read-only
  const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
  if (session?.active || session?.is_read_only) {
    throw new Error('READ-ONLY: Payout state updates are strictly disabled in View As Agent mode.')
  }

  // Immutability Check: Paid payouts cannot be modified
  const current = await getPayout(id)
  if (current?.status === 'paid') {
    throw new Error('IMMUTABLE: Paid payouts cannot be modified.')
  }

  const patch = { status, updated_at: new Date().toISOString() }
  if (notes) patch.notes = notes

  const { data, error } = await supabase
    .from('payouts')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data[0] ? normalizePayout(data[0]) : null
}

