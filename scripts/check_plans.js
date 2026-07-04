// Script to check what fields plans_master collection has in Firestore
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function check() {
  console.log('\n=== plans_master collection ===');
  const snap = await getDocs(collection(db, 'plans_master'));
  snap.forEach(d => {
    console.log(JSON.stringify({ id: d.id, ...d.data() }));
  });

  console.log('\n=== Looking for RD1Y, RD2Y, RD3Y, PENS in plans_master ===');
  const codes = ['RD1Y', 'RD2Y', 'RD3Y', 'PENS'];
  const plans = [];
  snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
  codes.forEach(c => {
    const found = plans.find(p => 
      (p.code && p.code.toUpperCase() === c) ||
      (p.id && p.id.toUpperCase() === c)
    );
    console.log(`${c}: ${found ? 'FOUND -> ' + JSON.stringify(found) : 'NOT FOUND'}`);
  });

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
