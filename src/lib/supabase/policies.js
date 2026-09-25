// ============================================================================
// APEX Supabase Data Access Layer — Policies Module
// ============================================================================
import { supabase } from './client'
import { normalizePolicy } from './normalize'

export async function getPolicy(id) {
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return normalizePolicy(data)
}

export async function listPolicies(filters = {}) {
  let query = supabase
    .from('policies')
    .select('*, customers(name, customer_id), profiles(name)')
    .order('created_at', { ascending: false })

  if (filters.agentId) query = query.eq('agent_id', filters.agentId)
  if (filters.customerId) query = query.eq('customer_id', filters.customerId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.planType) query = query.eq('plan_type', filters.planType)
  if (filters.overdueBefore) query = query.lt('next_due_date', filters.overdueBefore)
  if (filters.maturingBefore) query = query.lte('maturity_date', filters.maturingBefore)
  if (filters.maturingAfter) query = query.gte('maturity_date', filters.maturingAfter)

  const { data, error } = await query
  if (error) {
    let fallback = supabase.from('policies').select('*').order('created_at', { ascending: false })
    if (filters.agentId) fallback = fallback.eq('agent_id', filters.agentId)
    if (filters.customerId) fallback = fallback.eq('customer_id', filters.customerId)
    if (filters.status) fallback = fallback.eq('status', filters.status)
    if (filters.planType) fallback = fallback.eq('plan_type', filters.planType)
    const { data: rawData, error: rawErr } = await fallback
    if (rawErr) throw error
    return (rawData || []).map(normalizePolicy)
  }
  return (data || []).map(normalizePolicy)
}

export async function createPolicy(payload) {
  const insertData = {
    policy_number: payload.policyNumber || payload.planAccountNumber,
    customer_id: payload.customerId,
    agent_id: payload.agentId,
    plan_code: payload.planCode || payload.type,
    plan_type: payload.planType,
    policy_year: payload.policyYear,
    monthly_amount: payload.installmentAmount || payload.monthlyAmount || 0,
    fd_amount: payload.fdAmount || 0,
    total_installments: payload.totalInstallments || 1,
    paid_installments: payload.paidInstallments || 0,
    total_paid: payload.totalPaid || 0,
    status: payload.status || 'active',
    start_date: payload.startDate || new Date().toISOString(),
    maturity_date: payload.maturityDate || null,
    next_due_date: payload.nextDueDate || null,
  }

  const { data, error } = await supabase
    .from('policies')
    .insert([insertData])
    .select()

  if (error) throw error
  return data && data.length > 0 ? normalizePolicy(data[0]) : null
}
