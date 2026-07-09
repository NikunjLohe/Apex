import { initializeApp } from 'firebase/app'
import { getFirestore, getDoc, doc } from 'firebase/firestore'

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
  const snap = await getDoc(doc(db, 'config', 'ranks'))
  if (snap.exists()) {
    console.log('Document config/ranks exists!')
    const data = snap.data()
    console.log('Ranks length:', data.ranks?.length)
    if (data.ranks?.length > 0) {
      console.log('Sample rank item:', data.ranks[0])
    }
  } else {
    console.log('Document config/ranks does NOT exist!')
  }
}

run().catch(console.error)
