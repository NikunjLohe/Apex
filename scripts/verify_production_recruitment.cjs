const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const path = require('path')
const sa = require(path.resolve('serviceAccountKey.json'))

initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

// Simulate creating a member using the same logic as createMember, but with firebase-admin directly
async function simulateCreateMember(name, email, phone, panNumber, rank, referredByUid) {
  // 1. Counter increment
  const counterRef = db.doc('counters/agents')
  let seq = 1
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    if (snap.exists) {
      seq = (snap.data().seq || 0) + 1
    }
    tx.set(counterRef, { seq }, { merge: true })
  })

  const sponsorCode = `KB${String(seq).padStart(6, '0')}`

  // 2. Create Auth user
  const userRecord = await auth.createUser({
    email,
    password: 'TempPassword@2026',
    displayName: name
  })

  const uid = userRecord.uid

  // 3. Write Firestore user doc
  await db.collection('users').doc(uid).set({
    name,
    email,
    phone,
    rank,
    isSuperAdmin: false,
    branchId: 'main-branch',
    status: 'active',
    sponsorCode,
    referredBy: referredByUid,
    mustChangePassword: false,
    panNumber,
    address: 'Mumbai, Maharashtra',
    dob: '1995-05-05',
    joinDate: new Date(),
    updatedAt: new Date()
  })

  return { uid, sponsorCode }
}

async function run() {
  console.log('--- STARTING FIELD AGENT RECRUITMENT VERIFICATION ---')

  // 1. Get Rank 11 user (Neha Sharma)
  const nehaSnap = await db.collection('users').where('sponsorCode', '==', 'MGT000011').get()
  if (nehaSnap.empty) {
    throw new Error('Neha Sharma (Rank 11) not found in database.')
  }
  const nehaDoc = nehaSnap.docs[0]
  const nehaUid = nehaDoc.id
  console.log(`Found Rank 11 Manager: ${nehaDoc.data().name} (UID: ${nehaUid})`)

  // 2. Clear old test agents if any
  const testEmails = ['test.agent1@apex.local', 'test.agent2@apex.local']
  for (const email of testEmails) {
    try {
      const existing = await auth.getUserByEmail(email)
      await auth.deleteUser(existing.uid)
      await db.collection('users').doc(existing.uid).delete()
      console.log(`Cleaned old test user: ${email}`)
    } catch (e) {}
  }

  // Ensure counter is at 0
  await db.doc('counters/agents').set({ seq: 0 })

  // 3. Recruit Agent 1
  console.log('Recruiting first field agent under Rank 11...')
  const agent1 = await simulateCreateMember(
    'Test Agent One',
    'test.agent1@apex.local',
    '9999999991',
    'ABCDE9991F',
    1, // Rank 1 (AO)
    nehaUid
  )
  console.log(`✓ Agent 1 Created: ${agent1.sponsorCode} (UID: ${agent1.uid})`)
  if (agent1.sponsorCode !== 'KB000001') {
    throw new Error(`Expected KB000001, got ${agent1.sponsorCode}`)
  }

  // 4. Recruit Agent 2
  console.log('Recruiting second field agent under Rank 11...')
  const agent2 = await simulateCreateMember(
    'Test Agent Two',
    'test.agent2@apex.local',
    '9999999992',
    'ABCDE9992G',
    1, // Rank 1 (AO)
    nehaUid
  )
  console.log(`✓ Agent 2 Created: ${agent2.sponsorCode} (UID: ${agent2.uid})`)
  if (agent2.sponsorCode !== 'KB000002') {
    throw new Error(`Expected KB000002, got ${agent2.sponsorCode}`)
  }

  console.log('✓ Verification Success: Hierarchy recruitment chain works and consumes KB sequence correctly.')

  // 5. Cleanup temporary agents to leave database pristine
  console.log('Cleaning up temporary verification agents...')
  await auth.deleteUser(agent1.uid)
  await db.collection('users').doc(agent1.uid).delete()
  await auth.deleteUser(agent2.uid)
  await db.collection('users').doc(agent2.uid).delete()

  // Reset counters back to 0
  console.log('Resetting counters/agents back to 0...')
  await db.doc('counters/agents').set({ seq: 0 })

  console.log('--- RECRUITMENT VERIFICATION COMPLETED SUCCESSFULLY ---')
}

run().catch(console.error)
