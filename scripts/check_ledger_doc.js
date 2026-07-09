import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyD5fcJcJABzW5uv6POSxNA0oTzkZG8hNvU',
  authDomain:        'mlm-80f97.firebaseapp.com',
  projectId:         'mlm-80f97',
  storageBucket:     'mlm-80f97.firebasestorage.app',
  messagingSenderId: '723541617943',
  appId:             '1:723541617943:web:530d2921b50c86ac7a5b52',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function check() {
  console.log('Querying policy QADEMO-000007 in commission_ledger...')
  const q = query(collection(db, 'commission_ledger'), where('policyNumber', '==', 'QADEMO-000007'))
  const snap = await getDocs(q)
  console.log(`Document count: ${snap.size}`)
  snap.forEach(d => {
    const data = d.data()
    console.log(`DocID: ${d.id} | Agent: ${data.agentName} | Code: ${data.sponsorCode} | Rank: ${data.receivingRank || data.originalRank} | Pct: ${data.percentage}% | Amt: ${data.amount} | Type: ${data.commissionType || data.type}`)
  })
}

check().catch(console.error)
