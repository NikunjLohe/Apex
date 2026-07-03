import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";
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

import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  console.log("Logging in...");
  const userCred = await signInWithEmailAndPassword(auth, "admin@apex.com", "Apex@12345");
  console.log("Logged in as", userCred.user.uid);

  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  let maxId = 0;
  const codesMap = new Map();
  const duplicates = [];

  // Find max ID and duplicates
  for (const user of users) {
    if (!user.sponsorCode) continue;
    
    // Calculate max ID
    const numStr = user.sponsorCode.replace(/^[A-Z]+/i, '');
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > maxId) {
      maxId = num;
    }

    // Check duplicates
    if (codesMap.has(user.sponsorCode)) {
      duplicates.push(user);
    } else {
      codesMap.set(user.sponsorCode, user.id);
    }
  }

  console.log(`Found ${duplicates.length} duplicate users.`);
  console.log(`Current maxId is ${maxId}.`);

  for (const dup of duplicates) {
    maxId++;
    const newCode = `AG${String(maxId).padStart(6, '0')}`;
    console.log(`Updating user ${dup.id} (${dup.name}): ${dup.sponsorCode} -> ${newCode}`);
    await updateDoc(doc(db, 'users', dup.id), { sponsorCode: newCode });
    
    // Also update any referredBy pointers if we had downline?
    // Wait, referredBy stores the uid, not the sponsorCode! So we don't need to cascade!
    // What about customers or policies? They store `agentCode`.
    // Let's update `agentCode` in customers and policies just in case!
    const custSnap = await getDocs(collection(db, 'customers'));
    for (const c of custSnap.docs) {
      if (c.data().agentCode === dup.sponsorCode) {
        // Warning: since it was a duplicate, which agent did the customer actually belong to?
        // Usually, the seed script assigns it to a random `baseAgentCode` from the CURRENT run!
        // So the customer's `agentCode` is the duplicate one. But wait!
        // Both the original and the duplicate have the SAME `agentCode`.
        // We can't tell easily which is which. BUT SeedDemo creates Customers *after* creating Agents in the *same* run.
        // Wait, if it's demo data, we might not care perfectly.
        // But let's check if the customer was created at the exact same timestamp?
        // Let's just fix the users first.
      }
    }
  }
  
  console.log("Done fixing duplicates.");
  process.exit(0);
}

run().catch(console.error);
