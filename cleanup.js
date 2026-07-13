import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, collection, getDocs, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environmental configuration
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

const COLLECTIONS_TO_CLEAN = [
  'customers',
  'plans',
  'payments',
  'receipts',
  'commission_ledger',
  'payouts',
  'imports',
  'notifications'
];

async function run() {
  console.log("==================================================");
  console.log("STEP 1: LOGGING IN AS SUPER ADMIN...");
  console.log("==================================================");
  
  // Login as admin@apex.com / Apex@12345
  const userCred = await signInWithEmailAndPassword(auth, "admin@apex.com", "Apex@12345");
  console.log("Logged in successfully as Super Admin UID:", userCred.user.uid);

  console.log("\n==================================================");
  console.log("STEP 2: BACKING UP DEMO BUSINESS DATA...");
  console.log("==================================================");
  
  const backupData = {};
  
  for (const colName of COLLECTIONS_TO_CLEAN) {
    console.log(`Fetching collection: "${colName}"...`);
    const snap = await getDocs(collection(db, colName));
    backupData[colName] = [];
    snap.forEach(doc => {
      backupData[colName].push({
        id: doc.id,
        ...doc.data()
      });
    });
    console.log(`-> Found ${backupData[colName].length} documents in "${colName}".`);
  }

  // Use absolute scratch directory for backups so they are stored in the artifact storage
  const scratchDir = 'C:/Users/User/.gemini/antigravity-ide/brain/8f9ca0ca-4688-4f8c-a40e-e7d9fd9fb8e1/scratch';
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  
  const backupPath = path.join(scratchDir, 'backup_demo.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\nDemo business data backed up successfully to: ${backupPath}`);

  console.log("\n==================================================");
  console.log("STEP 3: DELETING TRANSACTIONAL DATA...");
  console.log("==================================================");

  for (const colName of COLLECTIONS_TO_CLEAN) {
    const docs = backupData[colName];
    if (docs.length === 0) {
      console.log(`Collection "${colName}" is already empty. Skipping delete.`);
      continue;
    }
    
    console.log(`Deleting ${docs.length} documents from "${colName}"...`);
    
    // Delete in batches of 200 to stay safely within Firestore limit of 500
    let batch = writeBatch(db);
    let count = 0;
    
    for (const d of docs) {
      batch.delete(doc(db, colName, d.id));
      count++;
      
      if (count % 200 === 0) {
        await batch.commit();
        console.log(`  committed batch of 200 deletions...`);
        batch = writeBatch(db);
      }
    }
    
    if (count % 200 !== 0) {
      await batch.commit();
    }
    console.log(`-> Purged all documents in "${colName}".`);
  }

  console.log("\n==================================================");
  console.log("STEP 4: COUNTING SYSTEM STRUCTURAL COUNTS...");
  console.log("==================================================");

  // Count active agents (users)
  console.log("Counting agents from 'users' collection...");
  const usersSnap = await getDocs(collection(db, 'users'));
  let agentsCount = 0;
  usersSnap.forEach(d => {
    const data = d.data();
    if (data.rank !== undefined) {
      agentsCount++;
    }
  });
  console.log(`-> Total Agents remaining: ${agentsCount}`);

  // Count total branches
  console.log("Counting branches from 'branches' collection...");
  const branchesSnap = await getDocs(collection(db, 'branches'));
  const branchesCount = branchesSnap.size;
  console.log(`-> Total Branches remaining: ${branchesCount}`);

  console.log("\n==================================================");
  console.log("STEP 5: RESETTING DASHBOARD SUMMARIES...");
  console.log("==================================================");

  const dashboardRef = doc(db, 'system_summaries', 'dashboard');
  await setDoc(dashboardRef, {
    totalBusiness: 0,
    monthlyBusiness: 0,
    totalCommission: 0,
    pendingPayouts: 0,
    activeAgents: agentsCount,
    activePlans: 0,
    todayCollection: 0,
    monthCollection: 0,
    defaulters: 0,
    totalAgents: agentsCount,
    totalBranches: branchesCount,
    todayImportedPolicies: 0,
    todayImportedCustomers: 0,
    pendingImportErrors: 0,
    promotionsCount: 0,
    growthData: [],
    branchPerformance: [],
    topAgentsList: [],
    lastUpdated: serverTimestamp()
  });
  console.log("-> Dashboard system summary document reset to 0 business stats.");

  console.log("\n==================================================");
  console.log("STEP 6: DATABASE CLEAN STATE VERIFICATION REPORT");
  console.log("==================================================");

  // Re-verify the counts are indeed 0
  const verificationCounts = {};
  for (const colName of COLLECTIONS_TO_CLEAN) {
    const snap = await getDocs(collection(db, colName));
    verificationCounts[colName] = snap.size;
  }

  console.log(`Agents Remaining:             ${agentsCount}`);
  console.log(`Customers Remaining:          ${verificationCounts['customers']} (expected 0)`);
  console.log(`Policies Remaining:           ${verificationCounts['plans']} (expected 0)`);
  console.log(`Payments Remaining:           ${verificationCounts['payments']} (expected 0)`);
  console.log(`Commission Ledger Remaining:  ${verificationCounts['commission_ledger']} (expected 0)`);
  console.log(`Payouts Remaining:            ${verificationCounts['payouts']} (expected 0)`);
  console.log(`Receipts Remaining:           ${verificationCounts['receipts']} (expected 0)`);
  console.log(`Notifications Remaining:      ${verificationCounts['notifications']} (expected 0)`);

  const failedVerification = Object.values(verificationCounts).some(c => c > 0);
  if (failedVerification) {
    console.error("\n❌ VERIFICATION FAILED: Some collections still have transactional records!");
    process.exit(1);
  } else {
    console.log("\n✅ VERIFICATION PASSED: Database is completely clean and ready for final client demo!");
    process.exit(0);
  }
}

run().catch(e => {
  console.error("\n❌ ERROR DURING CLEANUP:", e);
  process.exit(1);
});
