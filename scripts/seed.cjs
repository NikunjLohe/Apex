/* ============================================================================
 * APEX seed script — creates the first super-admin + demo data.
 * ----------------------------------------------------------------------------
 * Prerequisites:
 *   1. Firebase Console → Authentication → "Get started" + enable Email/Password
 *   2. Firestore database created
 *   3. Download a service account key:
 *        Console → Project Settings → Service accounts → Generate new private key
 *      Save it as  serviceAccountKey.json  in the project root.
 *
 * Run:  node scripts/seed.cjs
 * ========================================================================== */

const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const path = require('path')
const fs = require('fs')

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json')
if (!fs.existsSync(keyPath)) {
  console.error('\n❌ serviceAccountKey.json not found in project root.')
  console.error('   Console → Project Settings → Service accounts → Generate new private key,')
  console.error('   then save it as serviceAccountKey.json next to package.json.\n')
  process.exit(1)
}

const serviceAccount = require(keyPath)
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

const ADMIN_EMAIL = 'admin@apex.com'
const ADMIN_PASSWORD = 'Apex@12345'

async function ensureAdminUser() {
  let user
  try {
    user = await auth.getUserByEmail(ADMIN_EMAIL)
    console.log('• Admin auth user already exists:', user.uid)
  } catch {
    user = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Super Admin' })
    console.log('✓ Created admin auth user:', user.uid)
  }
  return user.uid
}

async function run() {
  console.log('\nSeeding APEX project:', serviceAccount.project_id, '\n')

  const uid = await ensureAdminUser()

  // 1) Super-admin profile
  await db.doc(`users/${uid}`).set(
    {
      name: 'Super Admin',
      email: ADMIN_EMAIL,
      phone: '9000000000',
      rank: 18,
      isSuperAdmin: true,
      status: 'active',
      branchId: 'main-branch',
      joinDate: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  console.log('✓ Wrote users/' + uid + ' (super admin)')

  // 2) A branch
  await db.doc('branches/main-branch').set(
    { name: 'Mumbai Central', address: 'MG Road', city: 'Mumbai', state: 'Maharashtra', managerId: uid, createdAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  console.log('✓ Wrote branches/main-branch')

  // 3) A couple of demo agents
  const agents = [
    { id: 'agent-suresh', name: 'Suresh Patel', rank: 1, phone: '9811111111' },
    { id: 'agent-anita', name: 'Anita Rao', rank: 4, phone: '9822222222' },
  ]
  for (const a of agents) {
    await db.doc(`users/${a.id}`).set(
      { name: a.name, email: `${a.id}@apex.com`, phone: a.phone, rank: a.rank, isSuperAdmin: false, status: 'active', branchId: 'main-branch', referredBy: uid, joinDate: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
  }
  console.log('✓ Wrote 2 demo agents')

  // 4) Demo customers + plans + payments
  const now = new Date()
  const demoCustomers = [
    { name: 'Ramesh Kumar', phone: '9876543210', account: 'APEX-2026-00001' },
    { name: 'Priya Sharma', phone: '9876500000', account: 'APEX-2026-00002' },
    { name: 'Imran Sheikh', phone: '9870000000', account: 'APEX-2026-00003' },
  ]
  let custCounter = 0
  let planCounter = 0
  let rcptCounter = 0

  for (let i = 0; i < demoCustomers.length; i += 1) {
    const c = demoCustomers[i]
    custCounter += 1
    const custRef = db.collection('customers').doc()
    await custRef.set({
      name: c.name,
      phone: c.phone,
      email: '',
      gender: 'Male',
      dob: new Date(1990, 0, 1),
      address: 'Sample address, Mumbai, Maharashtra, 400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      aadhaar: '111122223333',
      pan: 'ABCDE1234F',
      nominee: { name: 'Nominee ' + i, relation: 'Spouse', phone: c.phone, address: '' },
      kycStatus: i === 0 ? 'verified' : 'pending',
      enrolledBy: agents[i % 2].id,
      enrolledByName: agents[i % 2].name,
      branchId: 'main-branch',
      accountNumber: c.account,
      plansCount: 1,
      source: 'Walk-in',
      createdAt: FieldValue.serverTimestamp(),
    })

    // RD-3Y plan, a few installments paid
    planCounter += 1
    const monthly = 2000
    const totalInstallments = 36
    const paid = 5 + i
    const startDate = new Date(now.getFullYear(), now.getMonth() - paid, 1)
    const nextDue = new Date(now.getFullYear(), now.getMonth() - paid + paid, 1)
    const planRef = db.collection('plans').doc()
    await planRef.set({
      customerId: custRef.id,
      customerName: c.name,
      customerAccount: c.account,
      agentId: agents[i % 2].id,
      agentName: agents[i % 2].name,
      branchId: 'main-branch',
      type: 'RD-3Y',
      monthlyAmount: monthly,
      fdAmount: 0,
      totalInstallments,
      paidInstallments: paid,
      startDate,
      maturityDate: new Date(startDate.getFullYear() + 3, startDate.getMonth(), 1),
      nextDueDate: nextDue,
      paymentDate: 1,
      status: 'active',
      totalPaid: monthly * paid,
      maturityAmount: 78000,
      ratePct: 6,
      planAccountNumber: `APEX-PLN-${String(planCounter).padStart(5, '0')}`,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Payments for the paid installments
    for (let n = 1; n <= paid; n += 1) {
      rcptCounter += 1
      const paidDate = new Date(now.getFullYear(), now.getMonth() - paid + n, 2)
      const pRef = db.collection('payments').doc()
      await pRef.set({
        planId: planRef.id,
        planAccountNumber: `APEX-PLN-${String(planCounter).padStart(5, '0')}`,
        customerId: custRef.id,
        customerName: c.name,
        agentId: agents[i % 2].id,
        agentName: agents[i % 2].name,
        branchId: 'main-branch',
        installmentNumber: n,
        amount: monthly,
        paymentMode: n % 2 === 0 ? 'upi' : 'cash',
        transactionRef: n % 2 === 0 ? 'UPI' + Math.floor(Math.random() * 1e6) : '',
        paidDate,
        dueDate: paidDate,
        isLate: false,
        daysLate: 0,
        receiptNumber: `RCP-DEMO-${String(rcptCounter).padStart(5, '0')}`,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }
  console.log('✓ Wrote demo customers, plans and payments')

  // 5) Counters (so app-generated numbers continue after demo data)
  await db.doc('counters/customers').set({ value: custCounter }, { merge: true })
  await db.doc('counters/plans').set({ value: planCounter }, { merge: true })
  await db.doc('counters/receipts').set({ value: rcptCounter }, { merge: true })
  console.log('✓ Initialised counters')

  console.log('\n✅ Seed complete!')
  console.log('   Login:  ' + ADMIN_EMAIL)
  console.log('   Pass :  ' + ADMIN_PASSWORD)
  console.log('   (change the password after first login)\n')
  process.exit(0)
}

run().catch((e) => {
  console.error('\n❌ Seed failed:', e.message)
  if (String(e.message).includes('CONFIGURATION_NOT_FOUND') || e.code === 'auth/configuration-not-found') {
    console.error('   → Enable Authentication first: Console → Authentication → Get started → enable Email/Password.\n')
  }
  process.exit(1)
})
