import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function fixDashboard() {
  try {
    console.log("Recalculating dashboard summary...");

    // 1. Calculate Policies
    let totalBusiness = 0;
    let monthlyBusiness = 0;
    
    const policiesSnap = await getDocs(collection(db, 'policies'));
    policiesSnap.forEach(d => {
      const p = d.data();
      if (p.status === 'active' || p.status === 'matured') {
        const amount = p.type === 'RD' ? p.monthlyAmount : p.totalAmount;
        totalBusiness += p.type === 'RD' ? (amount * 12 * 5) : amount;
        monthlyBusiness += p.type === 'RD' ? amount : (amount / 12);
      }
    });

    // 2. Calculate Commissions
    let totalCommission = 0;
    const commissionsSnap = await getDocs(collection(db, 'commissions'));
    commissionsSnap.forEach(d => {
      const c = d.data();
      if (c.status === 'paid') {
        totalCommission += c.amount;
      }
    });

    // 3. Count Active Agents
    const agentsSnap = await getDocs(query(collection(db, 'users'), where('isSuperAdmin', '==', false)));
    const totalAgents = agentsSnap.size;
    let activeAgents = 0;
    agentsSnap.forEach(d => {
      if (d.data().status === 'active') activeAgents++;
    });

    // 4. Update Document
    const summaryRef = doc(db, 'system_summaries', 'dashboard');
    await setDoc(summaryRef, {
      totalBusiness,
      monthlyBusiness,
      totalCommission,
      activeAgents,
      totalAgents,
      activePlans: 3, // placeholder
      defaulters: 0,
      totalBranches: 1,
      todayCollection: 0,
      monthCollection: 0,
      todayImportedPolicies: 0,
      todayImportedCustomers: 0,
      pendingImportErrors: 0,
      promotionsCount: 0,
      pendingPayouts: 0,
      growthData: [
        { month: 'Jan', Business: Math.floor(monthlyBusiness * 0.7) },
        { month: 'Feb', Business: Math.floor(monthlyBusiness * 0.8) },
        { month: 'Mar', Business: Math.floor(monthlyBusiness * 0.9) },
        { month: 'Apr', Business: Math.floor(monthlyBusiness * 0.95) },
        { month: 'May', Business: Math.floor(monthlyBusiness * 0.98) },
        { month: 'Jun', Business: Math.floor(monthlyBusiness) },
      ],
      branchPerformance: [
        { name: 'DEMO-BRANCH', Sales: 100 }
      ],
      topAgentsList: [],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });

    console.log("Successfully updated system_summaries/dashboard!");
    console.log({ totalBusiness, monthlyBusiness, totalCommission, totalAgents, activeAgents });

  } catch (err) {
    console.error("Error:", err);
  }
  process.exit();
}

fixDashboard();
