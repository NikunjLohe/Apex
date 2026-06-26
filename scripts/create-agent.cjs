/* Create a demo AGENT with a real login, placed under the super-admin as sponsor.
 * Run: node scripts/create-agent.cjs */
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const path = require('path')

const serviceAccount = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

const EMAIL = 'agent@apex.com'
const PASSWORD = 'Agent@12345'

async function run() {
  // sponsor = the super admin we created earlier
  const admin = await auth.getUserByEmail('admin@apex.com').catch(() => null)
  const sponsorUid = admin?.uid || null

  let user
  try {
    user = await auth.getUserByEmail(EMAIL)
  } catch {
    user = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: 'Ravi Agent' })
  }

  await db.doc(`users/${user.uid}`).set(
    {
      name: 'Ravi Agent',
      email: EMAIL,
      phone: '9001234567',
      rank: 1, // AO — agent level
      isSuperAdmin: false,
      status: 'active',
      branchId: 'main-branch',
      referredBy: sponsorUid, // placed under admin in the MLM tree
      sponsorCode: 'RAVI1001',
      joinDate: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  console.log('\n✅ Agent login ready')
  console.log('   Email:', EMAIL)
  console.log('   Pass :', PASSWORD)
  console.log('   Rank : 1 (AO) · sponsor =', sponsorUid || 'none', '\n')
  process.exit(0)
}
run().catch((e) => { console.error('❌', e.message); process.exit(1) })
