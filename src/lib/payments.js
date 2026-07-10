import { doc, collection, runTransaction, serverTimestamp, getDocs, getDoc } from 'firebase/firestore'
import { addMonths } from 'date-fns'
import { db } from '../firebase'
import { generateReceiptNumber } from './ids'
import { toDate, daysBetween } from '../utils/format'
import { isRD } from '../data/compensation'
import { updateDashboardSummary } from './summary'
import { calculateCommissions } from './commissionEngine'

/**
 * Record a payment atomically:
 *   • create /payments doc
 *   • update plan (paidInstallments++, totalPaid, nextDueDate, status)
 *   • create /receipts doc
 * Returns { paymentId, receiptId, receiptNumber }.
 */
export async function recordPayment({ plan, customer, agent, form }) {
  const receiptNumber = await generateReceiptNumber()
  const paidDate = form.paidDate ? new Date(form.paidDate) : new Date()
  const dueDate = toDate(plan.nextDueDate) || paidDate
  const daysLate = Math.max(0, daysBetween(paidDate, dueDate))
  const isLate = daysLate > 0

  const planRef = doc(db, 'plans', plan.id)
  const receiptRef = doc(collection(db, 'receipts'))
  const paymentRef = doc(collection(db, 'payments'))

  // We need users, commission config, and ranks to calculate commissions
  const [usersSnap, configSnap, ranksSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDoc(doc(db, 'config', 'commissions')),
    getDoc(doc(db, 'config', 'ranks')),
  ])

  const usersMap = {}
  usersSnap.forEach(d => { usersMap[d.id] = { id: d.id, ...d.data() } })
  const commissionMaster = configSnap.exists() ? configSnap.data() : {}
  const ranksList = ranksSnap.exists() ? (ranksSnap.data().ranks || []) : []

  await runTransaction(db, async (tx) => {
    const planSnap = await tx.get(planRef)
    if (!planSnap.exists()) throw new Error('Plan not found')
    const p = planSnap.data()

    const installmentNumber = (p.paidInstallments || 0) + 1
    const newTotalPaid = (p.totalPaid || 0) + Number(form.amount)
    const reachedMaturity = installmentNumber >= (p.totalInstallments || 1)
    const nextDue = isRD(p.type) && !reachedMaturity ? addMonths(toDate(p.nextDueDate) || paidDate, 1) : p.maturityDate

    // Generate commission
    const calculationDate = new Date()
    const monthNum = paidDate.getMonth() + 1
    const yearNum = paidDate.getFullYear()
    const isRDPlan = isRD(p.type)
    
    // Prevent duplicate commission for installment 1 if it was already generated (e.g., via Excel Import)
    const skipCommission = (installmentNumber === 1 && p.commissionCalculated === true)

    // Only generate FD/Pension commission on the first payment
    if (!skipCommission && (isRDPlan || installmentNumber === 1)) {
      const baseAgent = p.agentId && usersMap[p.agentId] ? usersMap[p.agentId] : null
      if (baseAgent) {
        const commissionResults = calculateCommissions({
          businessAmount: Number(form.amount),
          plan: { planCode: p.type, planType: p.planType || (isRDPlan ? 'RD' : 'FD'), policyYear: 1 },
          baseAgent: baseAgent,
          usersMap,
          commissionMaster,
          ranksList,
          customer: { id: customer.id, name: customer.name, account: customer.accountNumber || p.planAccountNumber },
          policyInfo: { id: plan.id, number: p.planAccountNumber },
          monthNum,
          yearNum,
          installmentNumber
        })
        commissionResults.forEach(comm => {
          const commRef = doc(collection(db, 'commission_ledger'))
          tx.set(commRef, comm)
        })
      }
    }

    tx.set(paymentRef, {
      planId: plan.id,
      planAccountNumber: p.planAccountNumber,
      customerId: customer.id,
      customerName: customer.name,
      agentId: agent?.uid || null,
      agentName: agent?.name || '',
      branchId: p.branchId || null,
      installmentNumber,
      amount: Number(form.amount),
      paymentMode: form.paymentMode,
      transactionRef: form.transactionRef || '',
      chequeNumber: form.chequeNumber || '',
      bankName: form.bankName || '',
      chequeDate: form.chequeDate ? new Date(form.chequeDate) : null,
      notes: form.notes || '',
      paidDate,
      dueDate,
      isLate,
      daysLate,
      receiptNumber,
      status: 'completed',
      createdAt: serverTimestamp(),
    })

    tx.update(planRef, {
      paidInstallments: installmentNumber,
      totalPaid: newTotalPaid,
      nextDueDate: nextDue,
      status: reachedMaturity ? 'matured' : 'active',
    })

    tx.set(receiptRef, {
      paymentId: paymentRef.id,
      receiptNumber,
      customerId: customer.id,
      planId: plan.id,
      generatedBy: agent?.uid || null,
      generatedAt: serverTimestamp(),
      pdfUrl: '',
    })
  })



  return { paymentId: paymentRef.id, receiptId: receiptRef.id, receiptNumber }
}
