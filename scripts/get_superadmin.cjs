const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const path = require('path')
const sa = require(path.resolve('serviceAccountKey.json'))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

async function run() {
  const usersSnap = await db.collection('users').where('email', '==', 'admin@apex.com').get()
  if (usersSnap.empty) {
    console.log('No superadmin found')
  } else {
    usersSnap.forEach(d => {
      console.log('Superadmin Doc ID:', d.id)
      console.log('Data:', JSON.stringify(d.data(), null, 2))
    })
  }
}
run().catch(console.error)
