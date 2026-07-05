/**
 * Diagnostic: Check which records from production_demo.xlsx already exist in Firestore.
 * Checks plans (by policyNumber) and customers (by customerId).
 * Also verifies agentCode resolution and plans_master codes.
 *
 * Run: node scripts/diagnose_import.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import xlsxPkg from 'xlsx';
const xlsx = xlsxPkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Read the demo excel
const xlsxPath = path.join(__dirname, '..', 'production_demo.xlsx');
const wb = xlsx.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws);

console.log('\n=== Excel rows ===');
rows.forEach((r, i) => console.log(`Row ${i+2}:`, JSON.stringify(r)));

async function diagnose() {
  // 1. Check plans_master
  console.log('\n=== plans_master codes ===');
  try {
    const pmSnap = await getDocs(collection(db, 'plans_master'));
    pmSnap.forEach(d => console.log(JSON.stringify({ id: d.id, ...d.data() })));
  } catch(e) {
    console.error('plans_master read failed (permission?):', e.message);
  }

  // 2. Check agents
  console.log('\n=== Agent code lookup ===');
  const agentCodes = [...new Set(rows.map(r => String(r['Agent Code'] || '').trim()))];
  console.log('Agent codes in Excel:', agentCodes);
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const agentMap = {};
    usersSnap.forEach(d => {
      const data = d.data();
      if (data.sponsorCode) agentMap[data.sponsorCode.trim().toLowerCase()] = { id: d.id, name: data.name, sponsorCode: data.sponsorCode };
    });
    agentCodes.forEach(code => {
      const found = agentMap[code.toLowerCase()];
      console.log(`${code}: ${found ? 'FOUND -> ' + found.name : 'NOT FOUND'}`);
    });
  } catch(e) {
    console.error('users read failed:', e.message);
  }

  // 3. Check duplicate policy numbers
  console.log('\n=== Duplicate Policy Number check ===');
  const policyNos = rows.map(r => String(r['Policy Number'] || '').trim());
  console.log('Policy numbers in Excel:', policyNos);
  try {
    const q = query(collection(db, 'plans'), where('policyNumber', 'in', policyNos.filter(Boolean)));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log('None of the policy numbers already exist in DB — no duplicates');
    } else {
      snap.forEach(d => console.log('DUPLICATE POLICY FOUND:', d.data().policyNumber));
    }
  } catch(e) {
    console.error('policy check failed:', e.message);
  }

  // 4. Check duplicate customer CIDs
  console.log('\n=== Duplicate Customer CID check ===');
  const custIds = rows.map(r => String(r['Customer ID'] || '').trim());
  console.log('Customer IDs in Excel:', custIds);
  try {
    const q = query(collection(db, 'customers'), where('customerId', 'in', custIds.filter(Boolean)));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log('None of the customer IDs already exist in DB — no duplicates');
    } else {
      snap.forEach(d => console.log('DUPLICATE CUSTOMER FOUND:', d.data().customerId));
    }
  } catch(e) {
    console.error('customer check failed:', e.message);
  }

  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
