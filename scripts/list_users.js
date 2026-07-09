import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

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

async function run() {
  console.log('Querying all users...')
  const snap = await getDocs(collection(db, 'users'))
  console.log(`User count: ${snap.size}`)
  snap.forEach(d => {
    const data = d.data()
    console.log(`DocID: ${d.id} | Name: ${data.name} | Email: ${data.email} | Code: ${data.sponsorCode} | Rank: ${data.rank} | referredBy: ${data.referredBy || 'none'}`)
  })
}

run().catch(console.error)
