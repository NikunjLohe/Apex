import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, addDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyD5fcJcJABzW5uv6POSxNA0oTzkZG8hNvU',
  authDomain:        'mlm-80f97.firebaseapp.com',
  projectId:         'mlm-80f97',
  storageBucket:     'mlm-80f97.firebasestorage.app',
  messagingSenderId: '723541617943',
  appId:             '1:723541617943:web:530d2921b50c86ac7a5b52',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function run() {
  console.log('Signing in as admin@apex.com...')
  await signInWithEmailAndPassword(auth, 'admin@apex.com', 'Apex@12345')
  console.log('✓ Signed in successfully!')

  const usersSnap = await getDocs(collection(db, 'users'))
  const managerDoc = usersSnap.docs.find(d => d.data().email === 'manager@apex.test')
  
  if (!managerDoc) {
    console.error('❌ Could not find manager@apex.test in Firestore users collection')
    return
  }

  const managerUid = managerDoc.id
  const managerData = managerDoc.data()
  console.log(`Resolved Manager UID: ${managerUid}`)

  // Create a mock commission ledger entry
  const commRef = collection(db, 'commission_ledger')
  await addDoc(commRef, {
    agentId: managerUid,
    agentName: managerData.name,
    sponsorCode: managerData.sponsorCode,
    receivingRank: managerData.rank,
    receivingRankCode: 'MGR',
    amount: 2500,
    percentage: 0.25,
    policyNumber: 'POL-MOCK-777',
    customerName: 'Alice Smith',
    planCode: 'FD',
    planType: 'FD',
    businessAmount: 10000,
    commissionType: 'differential',
    status: 'paid',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    createdAt: new Date(),
    originalAgentId: managerUid,
    originalRank: 10
  })

  console.log('✓ Successfully created mock commission ledger entry for Manager!')
  await auth.signOut()
}

run().catch(console.error)
