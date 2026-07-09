import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "apex-branch-ops",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || ""
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function debug() {
  console.log('Fetching users...')
  const snap = await getDocs(collection(db, 'users'))
  const users = []
  snap.forEach(d => {
    users.push({ id: d.id, ...d.data() })
  })
  
  console.log(`Loaded ${users.length} users:`)
  users.forEach(u => {
    console.log(`UID: ${u.id} | Name: ${u.name} | Code: ${u.sponsorCode} | Rank: ${u.rank} | ReferredBy: ${u.referredBy}`)
  })
}

debug()
