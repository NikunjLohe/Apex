const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const path = require('path')
const fs = require('fs')

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json')
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found.')
  process.exit(1)
}

const serviceAccount = require(keyPath)
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

const TEST_USERS = [
  {
    email: 'superadmin@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Super Admin',
    rank: 18,
    isSuperAdmin: true,
    sponsorCode: 'QASUPER',
    phone: '9999999000',
  },
  {
    email: 'admin@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Admin',
    rank: 14,
    isSuperAdmin: false,
    sponsorCode: 'QAADMIN',
    phone: '9999999001',
  },
  {
    email: 'manager@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Manager',
    rank: 10,
    isSuperAdmin: false,
    sponsorCode: 'QAMANAGER',
    phone: '9999999002',
  },
  {
    email: 'agent@apex.test',
    password: 'TestPass@2024!',
    name: 'QA Agent',
    rank: 1,
    isSuperAdmin: false,
    sponsorCode: 'QAAGENT',
    phone: '9999999003',
  }
]

async function run() {
  console.log('Starting creation of test users...')
  
  // Find a branch to associate
  const branchesSnap = await db.collection('branches').limit(1).get()
  let branchId = 'main-branch'
  if (!branchesSnap.empty) {
    branchId = branchesSnap.docs[0].id
  }
  console.log(`Using branch ID: ${branchId}`)

  for (const tu of TEST_USERS) {
    let authUser
    try {
      authUser = await auth.getUserByEmail(tu.email)
      console.log(`• Auth user already exists: ${tu.email} (${authUser.uid})`)
    } catch {
      authUser = await auth.createUser({
        email: tu.email,
        password: tu.password,
        displayName: tu.name,
      })
      console.log(`✓ Created auth user: ${tu.email} (${authUser.uid})`)
    }

    const userRef = db.collection('users').doc(authUser.uid)
    const userSnap = await userRef.get()
    
    if (!userSnap.exists) {
      await userRef.set({
        name: tu.name,
        email: tu.email,
        phone: tu.phone,
        rank: tu.rank,
        sponsorCode: tu.sponsorCode,
        isSuperAdmin: tu.isSuperAdmin,
        status: 'active',
        branchId: branchId,
        referredBy: null,
        joinDate: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        bankDetails: {
          accountHolderName: tu.name,
          bankName: 'HDFC Bank',
          branch: 'Mumbai Branch',
          accountNumber: '123456789012',
          ifscCode: 'HDFC0000001'
        },
        panNumber: 'ABCDE1234F'
      })
      console.log(`✓ Created Firestore document for: ${tu.name}`)
    } else {
      console.log(`• Firestore document already exists for: ${tu.name}`)
      // Let's update it to ensure correct details
      await userRef.update({
        rank: tu.rank,
        sponsorCode: tu.sponsorCode,
        isSuperAdmin: tu.isSuperAdmin,
        bankDetails: {
          accountHolderName: tu.name,
          bankName: 'HDFC Bank',
          branch: 'Mumbai Branch',
          accountNumber: '123456789012',
          ifscCode: 'HDFC0000001'
        },
        panNumber: 'ABCDE1234F'
      })
    }
  }
  console.log('Finished test users setup!')
}

run().catch(console.error)
