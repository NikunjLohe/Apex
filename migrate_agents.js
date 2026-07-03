import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  console.log('Starting agent migration...');
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Create a map of agentCode -> uid (since in seeded data, agentCode is their true ID)
  const codeToUid = {};
  users.forEach(u => {
    if (u.agentCode) {
      codeToUid[u.agentCode] = u.id;
    }
  });

  const batch = writeBatch(db);
  let count = 0;

  for (const u of users) {
    if (u.agentCode) {
      // In seeded data: 
      // u.agentCode is their actual ID.
      // u.sponsorCode is the upline's ID.
      const actualOwnCode = u.agentCode;
      const actualUplineCode = u.sponsorCode;
      
      const updateData = {
        sponsorCode: actualOwnCode // Set sponsorCode to their OWN code
      };
      
      if (actualUplineCode && codeToUid[actualUplineCode]) {
        updateData.referredBy = codeToUid[actualUplineCode];
      } else {
        updateData.referredBy = null;
      }
      
      batch.update(doc(db, 'users', u.id), updateData);
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Migrated ${count} agents successfully.`);
  } else {
    console.log('No agents needed migration.');
  }
}

migrate().catch(console.error);
