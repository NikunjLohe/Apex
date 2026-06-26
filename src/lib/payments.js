import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore'
import { addMonths } from 'date-fns'
import { db } from '../firebase'
import { generateReceiptNumber } from './ids'
import { toDate, daysBetween } from '../utils/format'
import { isRD } from '../data/compensation'

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
  const paymentRef = doc(collection(db, 'payments'))
  const receiptRef = doc(collection(db, 'receipts'))

  await runTransaction(db, async (tx) => {
    const planSnap = await tx.get(planRef)
    if (!planSnap.exists()) throw new Error('Plan not found')
    const p = planSnap.data()

    const installmentNumber = (p.paidInstallments || 0) + 1
    const newTotalPaid = (p.totalPaid || 0) + Number(form.amount)
    const reachedMaturity = installmentNumber >= (p.totalInstallments || 1)
    const nextDue = isRD(p.type) && !reachedMaturity ? addMonths(toDate(p.nextDueDate) || paidDate, 1) : p.maturityDate

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
