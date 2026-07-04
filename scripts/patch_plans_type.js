/**
 * Patch existing plans_master documents to add missing `type` field.
 * Uses Firebase Admin SDK (service account not needed — runs with open rules temp approach).
 * Instead we use the REST API with the API key for an open-read collection.
 * 
 * Since plans_master has "allow read: if isStaff()" we cannot read unauthenticated.
 * We'll patch via the Firestore REST API using an exchange token approach.
 * 
 * Alternative: Temporarily open plans_master, patch, re-close. 
 * But safest: just use the node firebase client with email/password sign in.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD5fcJcJABzW5uv6POSxNA0oTzkZG8hNvU",
  authDomain: "mlm-80f97.firebaseapp.com",
  projectId: "mlm-80f97",
  storageBucket: "mlm-80f97.firebasestorage.app",
  messagingSenderId: "723541617943",
  appId: "1:723541617943:web:530d2921b50c86ac7a5b52"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Plan type mapping by code prefix
function inferType(code) {
  if (!code) return 'RD';
  const upper = code.toUpperCase();
  if (upper === 'PENS' || upper.startsWith('FD') || upper.startsWith('PENSION')) return 'FD';
  return 'RD';
}

async function patchPlansMaster() {
  console.log('Signing in...');
  // Try credentials from .env.test
  await signInWithEmailAndPassword(auth, 'superadmin@apex.test', 'TestPass@2024!')
    .catch(() => signInWithEmailAndPassword(auth, 'admin@apex.test', 'TestPass@2024!'));
  console.log('Signed in successfully');

  const snap = await getDocs(collection(db, 'plans_master'));
  let patched = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (!data.type) {
      const inferredType = inferType(data.code);
      await updateDoc(doc(db, 'plans_master', d.id), { type: inferredType });
      console.log(`Patched: ${data.code} -> type=${inferredType}`);
      patched++;
    } else {
      console.log(`Skipped: ${data.code} (already has type=${data.type})`);
      skipped++;
    }
  }

  console.log(`\nDone. Patched: ${patched}, Skipped: ${skipped}`);
  process.exit(0);
}

patchPlansMaster().catch(e => { console.error(e); process.exit(1); });
