// ============================================================================
// APEX Supabase Data Access Layer — Payments Module
// ============================================================================
import { supabase } from './client'
import { normalizePayment } from './normalize'

export async function listPayments(filters = {}) {
  let query = supabase
    .from('payments')
    .select('*, customers(name), profiles(name), policies(policy_number)')
    .order('created_at', { ascending: false })

  if (filters.policyId) query = query.eq('policy_id', filters.policyId)
  if (filters.customerId) query = query.eq('customer_id', filters.customerId)
  if (filters.agentId) query = query.eq('agent_id', filters.agentId)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.paymentMode && filters.paymentMode !== 'all') query = query.eq('payment_mode', filters.paymentMode)
  if (filters.fromDate) query = query.gte('paid_date', filters.fromDate)
  if (filters.toDate) query = query.lte('paid_date', filters.toDate)

  const { data, error } = await query
  if (error) {
    let fallback = supabase.from('payments').select('*').order('created_at', { ascending: false })
    if (filters.policyId) fallback = fallback.eq('policy_id', filters.policyId)
    if (filters.customerId) fallback = fallback.eq('customer_id', filters.customerId)
    if (filters.agentId) fallback = fallback.eq('agent_id', filters.agentId)
    if (filters.branchId) fallback = fallback.eq('branch_id', filters.branchId)
    if (filters.paymentMode && filters.paymentMode !== 'all') fallback = fallback.eq('payment_mode', filters.paymentMode)
    const { data: rawData, error: rawErr } = await fallback
    if (rawErr) throw error
    return (rawData || []).map(normalizePayment)
  }
  return (data || []).map(normalizePayment)
}

export async function getPayment(id) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return normalizePayment(data)
}

/**
 * recordPayment()
 * High-Risk Operation: Payment mutation & server-side commission generation via RPC.
 */
export async function recordPayment(payload) {
  // Guard: View As Agent mode is strictly read-only
  const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
  if (session?.active || session?.is_read_only) {
    throw new Error('READ-ONLY: Payment creation is strictly disabled in View As Agent mode.')
  }

  const rpcParams = {
    p_policy_id: payload.p_policy_id || payload.policyId || payload.planId,
    p_amount: Number(payload.p_amount ?? payload.amount),
    p_payment_mode: payload.p_payment_mode || payload.paymentMode,
    p_transaction_ref: payload.p_transaction_ref ?? payload.transactionRef ?? null,
    p_cheque_number: payload.p_cheque_number ?? payload.chequeNumber ?? null,
    p_bank_name: payload.p_bank_name ?? payload.bankName ?? null,
    p_notes: payload.p_notes ?? payload.notes ?? null,
    p_paid_date: payload.p_paid_date || (payload.paidDate ? new Date(payload.paidDate).toISOString() : new Date().toISOString()),
  }

  const { data, error } = await supabase.rpc('record_payment_and_commission', rpcParams)
  if (error) {
    throw new Error(error.message || 'Payment mutation failed')
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Payment recording failed')
  }

  return {
    paymentId: data?.payment_id,
    receiptId: data?.receipt_id,
    receiptNumber: data?.receipt_number,
    installmentNumber: data?.installment_number,
    commissionsGenerated: data?.commissions_generated,
  }
}
