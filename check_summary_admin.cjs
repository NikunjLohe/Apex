const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

admin.initializeApp({
  projectId: process.env.VITE_FIREBASE_PROJECT_ID
});

const db = getFirestore();

async function run() {
  try {
    const ref = db.collection('system_summaries').doc('dashboard');
    const snap = await ref.get();
    if (snap.exists) {
      console.log("Document data:", snap.data());
    } else {
      console.log("No such document!");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
