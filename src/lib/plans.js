import { doc, setDoc, collection, serverTimestamp, increment, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { generatePlanAccountNumber } from './ids'
import { computePlan } from './calc'
import { isRD, isPension, getPensionPolicyYear, planYears } from '../data/compensation'
import { updateDashboardSummary } from './summary'

/**
 * Create a plan for a customer. Computes maturity, schedule fields, and a plan
 * account number, then bumps the customer's plansCount.
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

  const ref = doc(collection(db, 'plans'))
  const payload = {
    customerId: customer.id,
    customerName: customer.name,
    customerAccount: customer.accountNumber,
    agentId: agent?.uid || null,
    agentName: agent?.name || '',
    branchId: agent?.branchId || customer.branchId || null,
    type: form.type,
    planType: derivedPlanType,
    policyYear,
    duration: policyYear,
    monthlyAmount: computed.monthlyAmount,
    fdAmount: computed.fdAmount,
    totalInstallments: computed.totalInstallments,
    paidInstallments: 0,
    startDate: computed.startDate,
    maturityDate: computed.maturityDate,
    nextDueDate: computed.nextDueDate,
    paymentDate: isRDPlan ? Number(form.paymentDate) || 1 : null,
    status: 'active',
    totalPaid: 0,
    maturityAmount: computed.maturityAmount,
    ratePct: computed.ratePct,
    planAccountNumber,
    createdAt: serverTimestamp(),
  }
  await setDoc(ref, payload)
  await updateDoc(doc(db, 'customers', customer.id), { plansCount: increment(1) })

  return { id: ref.id, planAccountNumber, ...computed }
}
