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

async function check() {
  console.log('Fetching QA agents...')
  const snap = await getDocs(collection(db, 'users'))
  const qaUsers = []
  snap.forEach(d => {
    const u = d.data()
    if (u.sponsorCode && u.sponsorCode.startsWith('QA')) {
      qaUsers.push({ id: d.id, ...u })
    }
  })
  
  qaUsers.sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0))
  
  console.log(`Found ${qaUsers.length} QA users:`)
  qaUsers.forEach(u => {
    console.log(`DocID: ${u.id} | Code: ${u.sponsorCode} | Name: ${u.name} | Rank: ${u.rank} | referredBy: ${u.referredBy}`)
  })
}

check().catch(console.error)
