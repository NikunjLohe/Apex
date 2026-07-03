import { doc, setDoc, collection, serverTimestamp, increment, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { generatePlanAccountNumber } from './ids'
import { computePlan } from './calc'
import { isRD } from '../data/compensation'
import { updateDashboardSummary } from './summary'

/**
 * Create a plan for a customer. Computes maturity, schedule fields, and a plan
 * account number, then bumps the customer's plansCount.
 */
export async function createPlan({ form, customer, agent, ranksConfig }) {
  const planAccountNumber = await generatePlanAccountNumber()
  const computed = computePlan({
    type: form.type,
    monthlyAmount: Number(form.monthlyAmount) || 0,
    fdAmount: Number(form.fdAmount) || 0,
    startDate: form.startDate ? new Date(form.startDate) : new Date(),
    ranksConfig,
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
    planType: form.planType || (isRD(form.type) ? 'RD' : 'FD'),
    monthlyAmount: computed.monthlyAmount,
    fdAmount: computed.fdAmount,
    totalInstallments: computed.totalInstallments,
    paidInstallments: 0,
    startDate: computed.startDate,
    maturityDate: computed.maturityDate,
    nextDueDate: computed.nextDueDate,
    paymentDate: isRD(form.type, form.planType) ? Number(form.paymentDate) || 1 : null,
    status: 'active',
    totalPaid: 0,
    maturityAmount: computed.maturityAmount,
    ratePct: computed.ratePct,
    planAccountNumber,
    createdAt: serverTimestamp(),
  }
  await setDoc(ref, payload)
  await updateDoc(doc(db, 'customers', customer.id), { plansCount: increment(1) })

  const isRDPlan = payload.planType === 'RD'
  const baseAmt = isRDPlan ? (computed.monthlyAmount * 12) : computed.fdAmount

  await updateDashboardSummary({
    totalBusiness: baseAmt,
    monthlyBusiness: baseAmt,
    activePlans: 1,
    todayImportedPolicies: 1,
    todayImportedCustomers: (customer.plansCount || 0) === 0 ? 1 : 0
  })
  return { id: ref.id, planAccountNumber, ...computed }
}
