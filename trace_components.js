import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
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

  // Build adjacency list for undirected graph (referredBy is the edge)
  const adj = {};
  users.forEach(u => {
    adj[u.id] = adj[u.id] || [];
    if (u.referredBy && userMap[u.referredBy]) {
      adj[u.referredBy] = adj[u.referredBy] || [];
      adj[u.referredBy].push(u.id);
      adj[u.id].push(u.referredBy);
    }
  });

  // Find components using DFS
  const visited = new Set();
  const components = [];

  for (const u of users) {
    if (u.isSuperAdmin || u.email === 'admin@apex.com') continue;
    if (!visited.has(u.id)) {
      const comp = [];
      const queue = [u.id];
      visited.add(u.id);
      
      while (queue.length > 0) {
        const curr = queue.shift();
        comp.push(userMap[curr]);
        
        const neighbors = adj[curr] || [];
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      components.push(comp);
    }
  }

  console.log(`Found ${components.length} agent components (excluding Super Admin):\n`);
  
  components.forEach((comp, idx) => {
    const rankCounts = {};
    comp.forEach(u => {
      const r = u.rank || 1;
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    });
    
    // Sort rank counts
    const sortedRanks = Object.keys(rankCounts).sort((a,b) => b-a);
    
    const representative = comp.find(u => !u.referredBy || !userMap[u.referredBy]);
    const repName = representative ? representative.name : 'Unknown';
    const repCode = representative ? (representative.agentCode || representative.sponsorCode) : 'Unknown';
    
    console.log(`Component #${idx + 1} | Size: ${comp.length} | Root: ${repName} (${repCode})`);
    console.log("Rank distribution:", rankCounts);
    console.log("-----------------------------------------");
  });
}

run().catch(console.error);
