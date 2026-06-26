/* ============================================================================
 * Demo data: customers with custom RD & FD plans (varied states) enrolled
 * under the demo agent so the agent + admin panels populate.
 * Run: node scripts/seed-demo.cjs
 * ========================================================================== */
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { addMonths, addYears } = require('date-fns')
const path = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

// FD/pension % at AO baseline (matches app default rateRankIndex = 0)
const FD_RATE = [0.05, 0.055, 0.06, 0.065, 0.07] // 1Y..5Y
const planYears = (t) => Number(String(t).match(/(\d)Y$/)[1])
const isRD = (t) => t.startsWith('RD')

function computePlan(type, amount, start) {
  const years = planYears(type)
  const idx = years - 1
  const rate = FD_RATE[idx]
  const maturityDate = addYears(start, years)
  if (isRD(type)) {
    const totalInstallments = years * 12
    const principal = amount * totalInstallments
    const avg = (amount * (totalInstallments + 1)) / 2
    const maturityAmount = Math.round(principal + avg * rate * years)
    return { years, totalInstallments, maturityDate, maturityAmount, ratePct: rate * 100 }
  }
  return { years, totalInstallments: 1, maturityDate, maturityAmount: Math.round(amount * Math.pow(1 + rate, years)), ratePct: rate * 100 }
}

async function getCounter(name) {
  const snap = await db.doc(`counters/${name}`).get()
  return snap.exists ? snap.data().value || 0 : 0
}

// Demo customers — a spread across RD and FD plans & states.
const DEMO = [
  { name: 'Anil Mehta',    phone: '9810000001', type: 'RD-1Y', amount: 1000,  paid: 12, late: false }, // matured
  { name: 'Sunita Devi',   phone: '9810000002', type: 'RD-2Y', amount: 1500,  paid: 8,  late: false },
  { name: 'Vikram Singh',  phone: '9810000003', type: 'RD-3Y', amount: 2500,  paid: 4,  late: true  }, // defaulter
  { name: 'Meena Iyer',    phone: '9810000004', type: 'RD-5Y', amount: 500,   paid: 15, late: false },
  { name: 'Rajesh Gupta',  phone: '9810000005', type: 'FD-1Y', amount: 50000 },
  { name: 'Farhan Khan',   phone: '9810000006', type: 'FD-3Y', amount: 100000 },
  { name: 'Lakshmi Nair',  phone: '9810000007', type: 'FD-5Y', amount: 200000 },
]

async function run() {
  const agent = await auth.getUserByEmail('agent@apex.com').catch(() => null)
  const admin = await auth.getUserByEmail('admin@apex.com').catch(() => null)
  if (!agent && !admin) throw new Error('Run seed.cjs / create-agent.cjs first.')
  const agentRef = { uid: agent?.uid || admin.uid, name: agent ? 'Ravi Agent' : 'Super Admin' }

  let custN = await getCounter('customers')
  let planN = await getCounter('plans')
  let rcptN = await getCounter('receipts')
  const year = new Date().getFullYear()
  const now = new Date()

  for (const d of DEMO) {
    custN += 1
    const accountNumber = `APEX-${year}-${String(custN).padStart(5, '0')}`
    const custRef = db.collection('customers').doc()
    await custRef.set({
      name: d.name, phone: d.phone, email: '', gender: 'Male',
      dob: new Date(1988, 4, 12),
      address: 'Demo street, Mumbai, Maharashtra, 400001',
      city: 'Mumbai', state: 'Maharashtra', pincode: '400001',
      aadhaar: '111122223333', pan: 'ABCDE1234F',
      nominee: { name: 'Nominee', relation: 'Spouse', phone: d.phone, address: '' },
      kycStatus: 'verified',
      enrolledBy: agentRef.uid, enrolledByName: agentRef.name,
      branchId: 'main-branch', accountNumber, plansCount: 1, source: 'Agent',
      createdAt: FieldValue.serverTimestamp(),
    })

    planN += 1
    const planAccountNumber = `APEX-PLN-${String(planN).padStart(5, '0')}`
    const rd = isRD(d.type)

    if (rd) {
      const paid = d.paid
      // start so that `paid` installments have elapsed; if late, push next due into the past
      const start = new Date(now.getFullYear(), now.getMonth() - paid - (d.late ? 1 : 0), 1)
      const comp = computePlan(d.type, d.amount, start)
      const matured = paid >= comp.totalInstallments
      const nextDue = matured ? comp.maturityDate : addMonths(start, paid)
      const planRef = db.collection('plans').doc()
      await planRef.set({
        customerId: custRef.id, customerName: d.name, customerAccount: accountNumber,
        agentId: agentRef.uid, agentName: agentRef.name, branchId: 'main-branch',
        type: d.type, monthlyAmount: d.amount, fdAmount: 0,
        totalInstallments: comp.totalInstallments, paidInstallments: paid,
        startDate: start, maturityDate: comp.maturityDate, nextDueDate: nextDue, paymentDate: 1,
        status: matured ? 'matured' : 'active', totalPaid: d.amount * paid,
        maturityAmount: comp.maturityAmount, ratePct: comp.ratePct,
        planAccountNumber, createdAt: FieldValue.serverTimestamp(),
      })
      // installment payments
      for (let n = 1; n <= paid; n += 1) {
        rcptN += 1
        const paidDate = addMonths(start, n - 1)
        await db.collection('payments').doc().set({
          planId: planRef.id, planAccountNumber, customerId: custRef.id, customerName: d.name,
          agentId: agentRef.uid, agentName: agentRef.name, branchId: 'main-branch',
          installmentNumber: n, amount: d.amount,
          paymentMode: n % 3 === 0 ? 'upi' : 'cash', transactionRef: n % 3 === 0 ? 'UPI' + (100000 + n) : '',
          paidDate, dueDate: paidDate, isLate: false, daysLate: 0,
          receiptNumber: `RCP-${year}-${String(rcptN).padStart(5, '0')}`,
          status: 'completed', createdAt: FieldValue.serverTimestamp(),
        })
      }
    } else {
      // FD: single lump-sum deposit
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 5)
      const comp = computePlan(d.type, d.amount, start)
      const planRef = db.collection('plans').doc()
      await planRef.set({
        customerId: custRef.id, customerName: d.name, customerAccount: accountNumber,
        agentId: agentRef.uid, agentName: agentRef.name, branchId: 'main-branch',
        type: d.type, monthlyAmount: 0, fdAmount: d.amount,
        totalInstallments: 1, paidInstallments: 1,
        startDate: start, maturityDate: comp.maturityDate, nextDueDate: comp.maturityDate, paymentDate: null,
        status: 'active', totalPaid: d.amount, maturityAmount: comp.maturityAmount, ratePct: comp.ratePct,
        planAccountNumber, createdAt: FieldValue.serverTimestamp(),
      })
      rcptN += 1
      await db.collection('payments').doc().set({
        planId: planRef.id, planAccountNumber, customerId: custRef.id, customerName: d.name,
        agentId: agentRef.uid, agentName: agentRef.name, branchId: 'main-branch',
        installmentNumber: 1, amount: d.amount, paymentMode: 'cheque',
        chequeNumber: 'CHQ' + (10000 + planN), bankName: 'HDFC Bank',
        paidDate: start, dueDate: start, isLate: false, daysLate: 0,
        receiptNumber: `RCP-${year}-${String(rcptN).padStart(5, '0')}`,
        status: 'completed', createdAt: FieldValue.serverTimestamp(),
      })
    }
    console.log(`✓ ${d.name} — ${d.type} (${accountNumber})`)
  }

  await db.doc('counters/customers').set({ value: custN }, { merge: true })
  await db.doc('counters/plans').set({ value: planN }, { merge: true })
  await db.doc('counters/receipts').set({ value: rcptN }, { merge: true })

  console.log(`\n✅ Added ${DEMO.length} demo customers (RD + FD) under ${agentRef.name}.\n`)
  process.exit(0)
}
run().catch((e) => { console.error('❌', e.message); process.exit(1) })
