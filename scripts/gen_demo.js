import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import * as xlsx from 'xlsx';
import fs from 'fs';
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

async function generateDemo() {
  console.log('Fetching agents...');
  const usersRef = collection(db, 'users');
  const q = query(usersRef, limit(20));
  const snapshot = await getDocs(q);
  
  const agents = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.sponsorCode && data.sponsorCode.startsWith('AG')) {
      agents.push(data.sponsorCode);
    }
  });

  if (agents.length === 0) {
    console.log('No AG agents found! Defaulting to AG000001, AG000002');
    agents.push('AG000001', 'AG000002');
  } else {
    console.log('Found AG agents:', agents.join(', '));
  }

  const data = [
    {
      "Customer ID": "CUST2001",
      "Customer Name": "Rahul Verma",
      "Mobile": "9876543210",
      "Address": "Mumbai",
      "Agent Code": agents[0] || "AG000001",
      "Policy Number": "POL2001",
      "Plan Code": "RD1Y",
      "Monthly Amount": 1000,
      "Total Amount": 12000,
      "Start Date": "2024-01-15"
    },
    {
      "Customer ID": "CUST2002",
      "Customer Name": "Priya Sharma",
      "Mobile": "9876543211",
      "Address": "Delhi",
      "Agent Code": agents[1 % agents.length] || "AG000002",
      "Policy Number": "POL2002",
      "Plan Code": "RD2Y",
      "Monthly Amount": 2000,
      "Total Amount": 48000,
      "Start Date": "2024-02-01"
    },
    {
      "Customer ID": "CUST2003",
      "Customer Name": "Amit Kumar",
      "Mobile": "9876543212",
      "Address": "Pune",
      "Agent Code": agents[2 % agents.length] || "AG000003",
      "Policy Number": "POL2003",
      "Plan Code": "PENS",
      "Monthly Amount": 5000,
      "Total Amount": 300000,
      "Start Date": "2024-03-10"
    },
    {
      "Customer ID": "CUST2004",
      "Customer Name": "Neha Gupta",
      "Mobile": "9876543213",
      "Address": "Bangalore",
      "Agent Code": agents[0] || "AG000001",
      "Policy Number": "POL2004",
      "Plan Code": "RD3Y",
      "Monthly Amount": 1500,
      "Total Amount": 54000,
      "Start Date": "2024-04-05"
    }
  ];

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Imports");
  
  const outPath = path.join(__dirname, '..', 'production_demo.xlsx');
  xlsx.writeFile(wb, outPath);
  console.log("Generated demo excel at:", outPath);
  process.exit(0);
}

generateDemo().catch(console.error);
