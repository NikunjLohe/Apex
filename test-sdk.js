import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, collection, setDoc, runTransaction, getDoc } from "firebase/firestore";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  console.log("Logging in...");
  const userCred = await signInWithEmailAndPassword(auth, "admin@apex.com", "Apex@12345");
  console.log("Logged in as", userCred.user.uid);
  
  const ref = doc(db, 'system_summaries', 'dashboard');
  const snap = await getDoc(ref);
  console.log("Dashboard summary:", JSON.stringify(snap.data(), null, 2));
  process.exit(0);
}

run().catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
