const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const path = require('path')
const sa = require(path.resolve('serviceAccountKey.json'))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

async function run() {
  const snap = await db.collection('branches').get()
  snap.forEach(d => {
    console.log('Branch ID:', d.id)
    console.log('Data:', JSON.stringify(d.data(), null, 2))
  })
}
run().catch(console.error)
