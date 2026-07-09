import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore'

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

async function inspect() {
  console.log('Signing in...')
  await signInWithEmailAndPassword(auth, 'admin@apex.com', 'Apex@12345')
  console.log('Signed in!')

  console.log('--- Inspecting Payouts ---')
  const payoutsSnap = await getDocs(query(collection(db, 'payouts'), limit(1)))
  payoutsSnap.forEach(d => {
    console.log('Payout ID:', d.id)
    console.log(JSON.stringify(d.data(), null, 2))
  })

  console.log('\n--- Inspecting Commission Ledger ---')
  const ledgerSnap = await getDocs(query(collection(db, 'commission_ledger'), limit(3)))
  ledgerSnap.forEach(d => {
    console.log('Ledger ID:', d.id)
    console.log(JSON.stringify(d.data(), null, 2))
  })

  await auth.signOut()
}

inspect().catch(console.error)
