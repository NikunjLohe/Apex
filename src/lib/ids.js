// ============================================================================
// Atomic sequential ID generation using Firestore transactions on /counters.
// ============================================================================
import { doc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'

/** Atomically increment a named counter and return the new integer value. */
export async function nextCounter(name) {
  const ref = doc(db, 'counters', name)
  console.log(`nextCounter Step 1: starting runTransaction for ${name}`)
  try {
    const nextVal = await runTransaction(db, async (tx) => {
      console.log(`nextCounter Step 2: inside transaction for ${name}, calling tx.get`)
      const snap = await tx.get(ref)
      console.log(`nextCounter Step 3: got snapshot for ${name}, exists?`, snap.exists())
      const current = snap.exists() ? snap.data().value || 0 : 0
      const next = current + 1
      console.log(`nextCounter Step 4: writing next value ${next} for ${name}`)
      tx.set(ref, { value: next }, { merge: true })
      return next
    })
    console.log(`nextCounter Step 5: transaction finished successfully for ${name}, returning ${nextVal}`)
    return nextVal
  } catch (err) {
    console.error(`nextCounter Error in runTransaction for ${name}:`, err)
    throw err
  }
}

/** Customer account number: APEX-YYYY-00001 */
export async function generateAccountNumber() {
  const n = await nextCounter('customers')
  return `APEX-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`
}

/** Plan account number: APEX-PLN-00001 */
export async function generatePlanAccountNumber() {
  const n = await nextCounter('plans')
  return `APEX-PLN-${String(n).padStart(5, '0')}`
}

/** Receipt number: RCP-YYYYMMDD-00001 */
export async function generateReceiptNumber() {
  const n = await nextCounter('receipts')
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `RCP-${ymd}-${String(n).padStart(5, '0')}`
}
