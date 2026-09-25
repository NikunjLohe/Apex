// ============================================================================
// APEX Supabase Data Access Layer — Field Normalization Helpers
// ============================================================================

export function normalizeProfile(p) {
  if (!p) return null
  return {
    uid: p.id,
    id: p.id,
    email: p.email,
    name: p.name,
    phone: p.phone,
    sponsorCode: p.sponsor_code,
    sponsorId: p.sponsor_id,
    rank: p.rank,
    role: p.role,
    isSuperAdmin: p.is_super_admin,
    isAdmin: p.is_admin,
    branchId: p.branch_id,
    status: p.status,
    panNumber: p.pan_number,
    bankDetails: p.bank_details || {},
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

export function normalizeCustomer(c) {
  if (!c) return null
  return {
    id: c.id,
    customerId: c.customer_id,
    accountNumber: c.customer_id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    branchId: c.branch_id,
    enrolledBy: c.enrolled_by,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}

export function normalizePolicy(pol) {
  if (!pol) return null
  return {
    id: pol.id,
    policyNumber: pol.policy_number,
    planAccountNumber: pol.policy_number,
    customerId: pol.customer_id,
    agentId: pol.agent_id,
    type: pol.plan_code,
    planCode: pol.plan_code,
    planType: pol.plan_type,
    policyYear: pol.policy_year,
    installmentAmount: Number(pol.installment_amount || pol.monthly_amount || 0),
    monthlyAmount: Number(pol.monthly_amount || pol.installment_amount || 0),
    fdAmount: Number(pol.fd_amount || 0),
    totalInstallments: pol.total_installments,
    paidInstallments: pol.paid_installments,
    totalPaid: Number(pol.total_paid || 0),
    maturityAmount: Number(pol.maturity_amount || 0),
    status: pol.status,
    startDate: pol.start_date,
    maturityDate: pol.maturity_date,
    nextDueDate: pol.next_due_date,
    createdAt: pol.created_at,
    customerName: pol.customers?.name || pol.customer_name || pol.customerName || '—',
    customerAccount: pol.customers?.customer_id || pol.customer_account || pol.customerAccount || '—',
    agentName: pol.profiles?.name || pol.agent_name || pol.agentName || '—',
  }
}

export function normalizePayment(pay) {
  if (!pay) return null
  return {
    id: pay.id,
    policyId: pay.policy_id,
    customerId: pay.customer_id,
    agentId: pay.agent_id,
    branchId: pay.branch_id,
    installmentNumber: pay.installment_number,
    amount: Number(pay.amount || 0),
    paymentMode: pay.payment_mode,
    transactionRef: pay.transaction_ref,
    chequeNumber: pay.cheque_number,
    bankName: pay.bank_name,
    notes: pay.notes,
    paidDate: pay.paid_date,
    dueDate: pay.due_date,
    receiptNumber: pay.receipt_number,
    status: pay.status,
    createdAt: pay.created_at,
    customerName: pay.customers?.name || pay.customer_name || pay.customerName || '—',
    agentName: pay.profiles?.name || pay.agent_name || pay.agentName || '—',
    planAccountNumber: pay.policies?.policy_number || pay.policy_number || pay.planAccountNumber || '—',
  }
}

export function normalizePayout(p) {
  if (!p) return null
  return {
    id: p.id,
    agentId: p.agent_id,
    month: p.month,
    year: p.year,
    policiesCount: p.policies_count,
    grossAmount: Number(p.gross_amount || 0),
    tdsAmount: Number(p.tds_amount || 0),
    adminCharge: Number(p.admin_charge || 0),
    netAmount: Number(p.net_amount || 0),
    status: p.status,
    generatedDate: p.generated_date,
    approvedDate: p.approved_date,
    paidDate: p.paid_date,
    approvedBy: p.approved_by,
  }
}

export function normalizeCommissionLedger(c) {
  if (!c) return null
  return {
    id: c.id,
    agentId: c.agent_id,
    customerId: c.customer_id,
    policyId: c.policy_id,
    paymentId: c.payment_id,
    payoutId: c.payout_id,
    receivingRank: c.receiving_rank,
    receivingRankCode: c.receiving_rank_code,
    planCode: c.plan_code,
    planType: c.plan_type,
    policyYear: c.policy_year,
    installmentNumber: c.installment_number,
    businessAmount: Number(c.business_amount || 0),
    percentage: Number(c.percentage || 0),
    amount: Number(c.amount || 0),
    commissionType: c.commission_type,
    compression: c.compression,
    compressionReason: c.compression_reason,
    compressedFromRanks: c.compressed_from_ranks || [],
    month: c.month,
    year: c.year,
    status: c.status,
    calculationDate: c.calculation_date,
  }
}
