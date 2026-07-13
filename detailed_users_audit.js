import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
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
  await signInWithEmailAndPassword(auth, "admin@apex.com", "Apex@12345");
  const snap = await getDocs(collection(db, 'users'));
  
  const users = [];
  snap.forEach(d => {
    users.push({ id: d.id, ...d.data() });
  });

  const userMap = {};
  users.forEach(u => {
    userMap[u.id] = u;
  });

  console.log(`Total users in Firestore: ${users.length}\n`);

  // Build parent -> children map
  const childrenMap = {};
  users.forEach(u => {
    if (u.referredBy) {
      if (!childrenMap[u.referredBy]) {
        childrenMap[u.referredBy] = [];
      }
      childrenMap[u.referredBy].push(u.id);
    }
  });

  // Print all users and trace their path to a root
  users.forEach(u => {
    let path = [];
    let curr = u;
    let loopProtect = 0;
    while (curr && curr.referredBy && userMap[curr.referredBy] && loopProtect < 20) {
      path.push(curr.referredBy);
      curr = userMap[curr.referredBy];
      loopProtect++;
    }
    const rootName = curr ? curr.name : 'None';
    const rootCode = curr ? (curr.agentCode || curr.sponsorCode) : 'None';
    console.log(`User: ${u.name.padEnd(25)} | Code: ${(u.agentCode || u.sponsorCode || 'N/A').padEnd(10)} | Rank: ${String(u.rank).padEnd(2)} | Root: ${rootName.padEnd(20)} (${rootCode}) | Path len: ${path.length}`);
  });
}

run().catch(console.error);
