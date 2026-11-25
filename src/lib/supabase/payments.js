// ============================================================================
// APEX Supabase Data Access Layer — Payments Module
// ============================================================================
import { addMonths } from 'date-fns'
import { supabase, adminSupabase } from './client'
import { normalizePayment } from './normalize'
import { getCommissionMaster } from './masterData'
import { calculateCommissions } from '../commissionEngine'
import { getActivePolicyYear, isRD } from '../../data/compensation'
import { RANKS as DEFAULT_RANKS } from '../../data/ranks'

const client = adminSupabase || supabase

function toLedgerInsertRow(entry, paymentId) {
  return {
    agent_id: entry.agentId,
    customer_id: entry.customerId,
    policy_id: entry.policyId,
    payment_id: paymentId || null,
    payout_id: null,
    receiving_rank: entry.receivingRank,
    receiving_rank_code: entry.receivingRankCode,
    plan_code: entry.planCode,
    plan_type: entry.planType,
    policy_year: entry.policyYear,
    installment_number: entry.installment || 1,
    business_amount: entry.businessAmount,
    percentage: entry.percentage,
    amount: entry.amount,
    original_rank: entry.originalRank,
    original_agent_id: entry.originalAgentId,
    commission_type: entry.commissionType,
    compression: Boolean(entry.compression),
    compression_reason: entry.compressionReason || null,
    compressed_from_ranks: Array.isArray(entry.compressedFromRank) ? entry.compressedFromRank : [],
    month: entry.month,
    year: entry.year,
    status: 'unpaid',
    calculation_date: entry.calculationDate || new Date().toISOString(),
  }
}

/**
 * Generates or reconciles commission_ledger rows for a given payment.
 * Handles multi-year RD progression automatically (Installments 1-12 -> Y1, 13-24 -> Y2, etc.).
 */
async function syncCommissionsForPayment({
  paymentId,
  policy,
  installmentNumber = 1,
  paymentAmount,
  paidDate,
  forceReconcile = false,
}) {
  if (!paymentId || !policy) return 0

  const activePolicyYear = getActivePolicyYear(
    {
      planCode: policy.plan_code,
      planType: policy.plan_type,
      policyYear: policy.policy_year,
      totalInstallments: policy.total_installments,
    },
    installmentNumber
  )

  // Check existing ledger rows for this payment
  const { data: existingRows, error: exErr } = await client
    .from('commission_ledger')
    .select('id, policy_year, status, payout_id')
    .eq('payment_id', paymentId)

  if (exErr) throw exErr

  if (existingRows && existingRows.length > 0) {
    if (!forceReconcile) return existingRows.length

    const hasLockedRows = existingRows.some((r) => r.payout_id || r.status === 'paid' || r.status === 'allocated')
    const yearAlreadySynced = existingRows.every((r) => Number(r.policy_year) === Number(activePolicyYear))
    if (hasLockedRows || yearAlreadySynced) {
      return existingRows.length
    }
  }

  // Also ensure no duplicate installment rows exist on this policy (outside a forceReconcile replacement)
  if (!existingRows?.length) {
    const { data: instRows } = await client
      .from('commission_ledger')
      .select('id, status')
      .eq('policy_id', policy.id)
      .eq('installment_number', installmentNumber)

    const activeInstRows = (instRows || []).filter((r) => r.status !== 'reversed')
    if (activeInstRows.length > 0) return activeInstRows.length
  }

  const [commissionMaster, profilesRes, customerRes] = await Promise.all([
    getCommissionMaster(),
    client.from('profiles').select('id, name, rank, sponsor_code, sponsor_id'),
    policy.customers
      ? Promise.resolve({ data: policy.customers })
      : client.from('customers').select('id, name, customer_id').eq('id', policy.customer_id).maybeSingle(),
  ])

  if (profilesRes.error) throw profilesRes.error

  const usersMap = {}
  ;(profilesRes.data || []).forEach((p) => {
    usersMap[p.id] = {
      id: p.id,
      name: p.name,
      rank: p.rank,
      sponsorCode: p.sponsor_code,
      sponsorId: p.sponsor_id,
      referredBy: p.sponsor_id,
    }
  })

  const baseAgent = usersMap[policy.agent_id]
  if (!baseAgent) return 0

  const customerRow = customerRes?.data || {}
  const dt = paidDate ? new Date(paidDate) : new Date()
  const safeDt = isNaN(dt.getTime()) ? new Date() : dt

  const entries = calculateCommissions({
    businessAmount: Number(paymentAmount) || 0,
    plan: {
      planCode: policy.plan_code,
      planType: policy.plan_type,
      policyYear: policy.policy_year,
      totalInstallments: policy.total_installments,
      activePolicyYear,
    },
    baseAgent,
    usersMap,
    commissionMaster,
    ranksList: DEFAULT_RANKS,
    customer: {
      id: policy.customer_id,
      name: customerRow.name || '',
      account: customerRow.customer_id || '',
    },
    policyInfo: {
      id: policy.id,
      number: policy.policy_number || '',
    },
    monthNum: safeDt.getMonth() + 1,
    yearNum: safeDt.getFullYear(),
    installmentNumber,
    paidDate: safeDt.toISOString(),
  })

  if (existingRows && existingRows.length > 0) {
    const { error: delErr } = await client
      .from('commission_ledger')
      .delete()
      .eq('payment_id', paymentId)
    if (delErr) throw delErr
  }

  if (entries.length === 0) return 0

  const insertRows = entries.map((entry) => toLedgerInsertRow(entry, paymentId))
  const { error: insErr } = await client.from('commission_ledger').insert(insertRows)
  if (insErr) throw insErr

  await client
    .from('policies')
    .update({ commission_calculated: true })
    .eq('id', policy.id)

  return insertRows.length
}

function generateReceiptNumber() {
  const d = new Date()
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '')
  const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `RCP-${dateStr}-${randomHex}`
}

export async function listPayments(filters = {}) {
  let query = client
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
    let fallback = client.from('payments').select('*').order('created_at', { ascending: false })
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
  const { data, error } = await client
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

  let commissionsGenerated = data?.commissions_generated
  const paymentId = data?.payment_id
  const installmentNumber = Number(data?.installment_number || 1)

  // Verify RD installment policy_year & commissions against Commission Master
  // (e.g. prevents RD5Y Installment #1 from using Year 5 instead of Year 1)
  if (paymentId && rpcParams.p_policy_id) {
    try {
      const { data: pol } = await client
        .from('policies')
        .select('*, customers(*), profiles(*)')
        .eq('id', rpcParams.p_policy_id)
        .maybeSingle()

      if (pol && isRD(pol.plan_code, pol.plan_type)) {
        commissionsGenerated = await syncCommissionsForPayment({
          paymentId,
          policy: pol,
          installmentNumber,
          paymentAmount: rpcParams.p_amount,
          paidDate: rpcParams.p_paid_date,
          forceReconcile: true,
        })
      }
    } catch (syncErr) {
      console.warn('[Payments] Post-RPC commission year reconciliation warning:', syncErr)
    }
  }

  return {
    paymentId,
    receiptId: data?.receipt_id,
    receiptNumber: data?.receipt_number,
    installmentNumber,
    commissionsGenerated,
  }
}

/**
 * recordInstallmentPayment()
 * High-Precision RD Monthly Installment Collection:
 * - Validates policy, agent, customer, and installment sequence
 * - Prevents duplicate installment submissions
 * - Updates policy paid installments, total paid amount, and next due date
 * - Creates payment and receipt records
 * - Marks policy matured if all installments are completed
 * - Does not duplicate enrollment commissions
 */
export async function recordInstallmentPayment(payload) {
  // Guard: View As Agent mode is strictly read-only
  const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
  if (session?.active || session?.is_read_only) {
    throw new Error('READ-ONLY: Payment creation is strictly disabled in View As Agent mode.')
  }

  const policyId = payload.policyId || payload.policy_id || payload.planId
  const amount = Number(payload.amount ?? payload.installmentAmount)
  const paymentMode = (payload.paymentMode || 'cash').toLowerCase()
  const transactionRef = payload.transactionRef || payload.transactionId || null
  const paidDate = payload.paidDate ? new Date(payload.paidDate) : new Date()
  const notes = payload.notes || payload.remarks || null

  if (!policyId) throw new Error('Policy ID is required.')
  if (isNaN(amount) || amount <= 0) throw new Error('Valid installment amount is required.')

  // 1. Fetch current policy record
  const { data: policy, error: polErr } = await client
    .from('policies')
    .select('*, customers(*), profiles(*)')
    .eq('id', policyId)
    .single()

  if (polErr || !policy) throw new Error('RD Policy not found.')

  const totalInstallments = Number(policy.total_installments) || 1
  const currentPaid = Number(policy.paid_installments) || 0

  if (currentPaid >= totalInstallments || policy.status === 'matured') {
    throw new Error(`Policy #${policy.policy_number} is already fully paid or matured (${currentPaid}/${totalInstallments} installments completed).`)
  }

  const nextInstallmentNumber = currentPaid + 1

  // 2. Idempotency & Duplicate check: Ensure this exact installment number hasn't been collected already
  const { data: existingPayments } = await client
    .from('payments')
    .select('id, receipt_number, status')
    .eq('policy_id', policyId)
    .eq('installment_number', nextInstallmentNumber)

  const activeExistingPayment = (existingPayments || []).find(p => p.status !== 'reversed')

  if (activeExistingPayment) {
    throw new Error(`Installment #${nextInstallmentNumber} for Policy #${policy.policy_number} has already been recorded (Receipt: ${activeExistingPayment.receipt_number}). Duplicate collection is blocked.`)
  }

  // 3. Generate unique receipt number
  const receiptNumber = generateReceiptNumber()

  // 4. Determine current user for audit tracking
  let authUserId = null
  try {
    const { data: authData } = await supabase.auth.getUser()
    authUserId = authData?.user?.id || null
  } catch {
    authUserId = null
  }

  // 5. Insert payment record into public.payments
  const insertPaymentData = {
    policy_id: policy.id,
    customer_id: policy.customer_id,
    agent_id: policy.agent_id,
    branch_id: policy.branch_id,
    installment_number: nextInstallmentNumber,
    amount: amount,
    payment_mode: paymentMode,
    transaction_ref: transactionRef || (notes ? `NOTE: ${notes}` : null),
    receipt_number: receiptNumber,
    paid_date: paidDate.toISOString(),
    due_date: policy.next_due_date || paidDate.toISOString(),
    is_late: false,
    days_late: 0,
    status: 'completed',
  }

  const { data: newPayment, error: payErr } = await client
    .from('payments')
    .insert([insertPaymentData])
    .select()
    .single()

  if (payErr) {
    throw new Error(`Failed to record installment payment: ${payErr.message}`)
  }

  // 6. Insert receipt into public.receipts
  try {
    await client.from('receipts').insert([{
      payment_id: newPayment.id,
      receipt_number: receiptNumber,
      customer_id: policy.customer_id,
      generated_by: authUserId || policy.agent_id
    }])
  } catch (recErr) {
    console.warn('Receipt record warning:', recErr)
  }

  // 7. Calculate next due date and new policy status
  const startDate = policy.start_date ? new Date(policy.start_date) : new Date()
  const nextDueDate = addMonths(startDate, nextInstallmentNumber)
  const isMatured = nextInstallmentNumber >= totalInstallments
  const newStatus = isMatured ? 'matured' : (policy.status || 'active')
  const newTotalPaid = Number(policy.total_paid || 0) + amount

  // 8. Update policy progress
  const { error: updErr } = await client
    .from('policies')
    .update({
      paid_installments: nextInstallmentNumber,
      total_paid: newTotalPaid,
      next_due_date: nextDueDate.toISOString().slice(0, 10),
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', policy.id)

  if (updErr) {
    console.error('Failed to update policy installment progress:', updErr)
    throw new Error(`Payment saved, but policy update failed: ${updErr.message}`)
  }

  // 9. Generate commissions for this installment (switches automatically at Year 2+, i.e. inst 13+)
  const activePolicyYear = getActivePolicyYear(
    {
      planCode: policy.plan_code,
      planType: policy.plan_type,
      policyYear: policy.policy_year,
      totalInstallments: policy.total_installments,
    },
    nextInstallmentNumber
  )

  let commissionsGenerated = 0
  try {
    commissionsGenerated = await syncCommissionsForPayment({
      paymentId: newPayment.id,
      policy,
      installmentNumber: nextInstallmentNumber,
      paymentAmount: amount,
      paidDate,
      forceReconcile: false,
    })
  } catch (commErr) {
    console.warn('[Payments] Commission generation warning on installment:', commErr)
  }

  return {
    success: true,
    paymentId: newPayment.id,
    receiptNumber: receiptNumber,
    installmentNumber: nextInstallmentNumber,
    activePolicyYear,
    commissionsGenerated,
    isMatured,
    totalPaid: newTotalPaid,
    remainingInstallments: Math.max(0, totalInstallments - nextInstallmentNumber)
  }
}

/**
 * reversePayment()
 * Reverses an installment payment without deleting history.
 */
export async function reversePayment(paymentId, reason = 'Administrative Reversal') {
  const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
  if (session?.active || session?.is_read_only) {
    throw new Error('READ-ONLY: Payment reversal is disabled in View As Agent mode.')
  }

  const { data: payment, error: pErr } = await client
    .from('payments')
    .select('*, policies(*)')
    .eq('id', paymentId)
    .single()

  if (pErr || !payment) throw new Error('Payment record not found.')
  if (payment.status === 'reversed') throw new Error('This payment is already marked as reversed.')

  const policy = payment.policies
  if (!policy) throw new Error('Associated policy not found for payment reversal.')

  // 1. Mark payment as reversed
  const { error: updPayErr } = await client
    .from('payments')
    .update({
      status: 'reversed',
      transaction_ref: payment.transaction_ref ? `${payment.transaction_ref} [REVERSED: ${reason}]` : `[REVERSED: ${reason}]`
    })
    .eq('id', paymentId)

  if (updPayErr) throw updPayErr

  // 2. Adjust policy progress safely
  const newPaidCount = Math.max(0, (policy.paid_installments || 0) - 1)
  const newTotalPaid = Math.max(0, (policy.total_paid || 0) - Number(payment.amount || 0))
  const startDate = policy.start_date ? new Date(policy.start_date) : new Date()
  const recalibratedDueDate = addMonths(startDate, newPaidCount)

  await client
    .from('policies')
    .update({
      paid_installments: newPaidCount,
      total_paid: newTotalPaid,
      next_due_date: recalibratedDueDate.toISOString().slice(0, 10),
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', policy.id)

  // 3. Remove any unallocated commission rows linked to this reversed payment
  await client
    .from('commission_ledger')
    .delete()
    .eq('payment_id', paymentId)
    .eq('status', 'unpaid')
    .is('payout_id', null)

  return { success: true, reversedPaymentId: paymentId }
}

