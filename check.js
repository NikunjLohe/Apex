import { initializeApp } from 'firebase/app';
import { getFirestore, getDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkRanks() {
  try {
    const snap = await getDoc(doc(db, 'config', 'ranks'));
    if (snap.exists()) {
      console.log('Ranks configuration:', JSON.stringify(snap.data(), null, 2));
    } else {
      console.log('No ranks config found.');
    }
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit();
}

checkRanks();
