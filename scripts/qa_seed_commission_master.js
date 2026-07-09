/**
 * qa_seed_commission_master.js
 * Seeds the default commission master into Firestore so the Live Demo can read it.
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

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
const auth = getAuth(app)

const DEFAULT_COMMISSION_MASTER = {
  RD1Y: {
    1: {
      AO: 8, SAO: 10, DO: 12, SDO: 14, ADO: 16, CADO: 18,
      BM: 20, SBM: 21, ABM: 22, RBM: 23, ZBM: 24, DBM: 25,
      NBM: 26, GM: 27, CGM: 28, VP: 29, SVP: 30, ED: 31
    }
  }
}

async function main() {
  console.log('🔑 Authenticating as Super Admin...')
  try {
    await signInWithEmailAndPassword(auth, 'superadmin@apex.test', 'TestPass@2024!')
    console.log('✅ Authenticated successfully.')
  } catch (err) {
    console.error('❌ Auth failed:', err.message)
    process.exit(1)
  }

  console.log('📡 Seeding Commission Master into Firestore (config/commissions)...')
  try {
    await setDoc(doc(db, 'config', 'commissions'), {
      commissions: DEFAULT_COMMISSION_MASTER,
      updatedAt: serverTimestamp()
    })
    console.log('✅ Successfully seeded config/commissions')
    process.exit(0)
  } catch (err) {
    console.error('❌ Failed to seed commissions:', err)
    process.exit(1)
  }
}

main()
