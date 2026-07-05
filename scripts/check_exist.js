import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function checkExist() {
  const policyNos = ['POL1001', 'POL1002', 'POL1003', 'POL1004'];
  const customerIds = ['CUST1001', 'CUST1002', 'CUST1003', 'CUST1004'];

  console.log('=== Checking Policies in DB ===');
  for (const pol of policyNos) {
    const q = query(collection(db, 'plans'), where('policyNumber', '==', pol));
    const snap = await getDocs(q);
    console.log(`Policy ${pol}: ${snap.empty ? 'NOT EXISTS' : 'EXISTS (' + snap.docs.length + ' documents)'}`);
  }

  console.log('\n=== Checking Customers in DB ===');
  for (const cust of customerIds) {
    const q = query(collection(db, 'customers'), where('customerId', '==', cust));
    const snap = await getDocs(q);
    console.log(`Customer ${cust}: ${snap.empty ? 'NOT EXISTS' : 'EXISTS (' + snap.docs.length + ' documents)'}`);
  }

  process.exit(0);
}

checkExist().catch(e => {
  console.error(e);
  process.exit(1);
});
