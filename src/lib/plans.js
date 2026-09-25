import { generatePlanAccountNumber } from './ids'
import { computePlan } from './calc'
import { isRD, isPension, getPensionPolicyYear, planYears } from '../data/compensation'
import { createPolicy } from './supabase/policies'

/**
 * Create a plan for a customer using Supabase DAL. Computes maturity, schedule fields,
 * and a plan account number.
 */
export async function createPlan({ form, customer, agent, ranksConfig }) {
  const isPensionPlan = isPension(form.type, form.planType)
  const isRDPlan = isRD(form.type, form.planType)
  const derivedPlanType = isRDPlan ? 'RD' : (isPensionPlan ? 'PENS' : 'FD')
  let policyYear = null
  if (isPensionPlan) {
    policyYear = getPensionPolicyYear(form.type, form.policyYear)
    if (!policyYear) {
      throw new Error(`Explicit Pension duration required (PENS1Y–PENS5Y). Cannot create Pension policy without explicit duration.`)
    }
  } else {
    policyYear = planYears(form.type) || (form.policyYear ? Number(form.policyYear) : 1)
  }

  const planAccountNumber = await generatePlanAccountNumber()
  const computed = computePlan({
    type: form.type,
    monthlyAmount: Number(form.monthlyAmount) || 0,
    fdAmount: Number(form.fdAmount) || 0,
    startDate: form.startDate ? new Date(form.startDate) : new Date(),
    ranksConfig,
    policyYear,
  })

  const payload = {
    planAccountNumber,
    policyNumber: planAccountNumber,
    customerId: customer.id,
    agentId: agent?.id || agent?.uid || null,
    planCode: form.type,
    planType: derivedPlanType,
    policyYear,
    installmentAmount: computed.monthlyAmount || 0,
    fdAmount: computed.fdAmount || 0,
    totalInstallments: computed.totalInstallments || 1,
    paidInstallments: 0,
    totalPaid: 0,
    status: 'active',
    startDate: computed.startDate ? new Date(computed.startDate).toISOString() : new Date().toISOString(),
    maturityDate: computed.maturityDate ? new Date(computed.maturityDate).toISOString() : null,
    nextDueDate: computed.nextDueDate ? new Date(computed.nextDueDate).toISOString() : null,
  }

  const createdPolicy = await createPolicy(payload)

  return { id: createdPolicy.id, planAccountNumber, ...computed }
}
