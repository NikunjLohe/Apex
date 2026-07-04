import { useState } from 'react'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth'
import { collection, getDocs, writeBatch, doc, serverTimestamp, getDoc, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { updateDashboardSummary } from '../../lib/summary'
import toast from 'react-hot-toast'
import { IReport, IAlert } from '../../components/ui/icons'

// We need a secondary app instance to create users without logging out the Super Admin
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Generate deterministic random strings/numbers
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const randomEl = (arr) => arr[randomInt(0, arr.length - 1)]

const NAMES = [
  'Rahul Sharma', 'Priya Desai', 'Amit Patel', 'Sneha Iyer', 'Vikram Singh',
  'Neha Gupta', 'Anand Joshi', 'Kavita Reddy', 'Suresh Kumar', 'Pooja Nair',
  'Ravi Verma', 'Deepa Menon', 'Kiran Shah', 'Meera Rao', 'Sanjay Mishra',
  'Anjali Dubey', 'Rohit Chawla', 'Shruti Bansal', 'Rajesh Kulkarni', 'Swati Bhat',
  'Tarun Mehra', 'Nisha Bajaj', 'Gaurav Jain', 'Tanvi Mahajan', 'Alok Pandey'
]

const CITIES = ['Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Ahmedabad']

export default function SeedDemo() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])

  const log = (msg) => {
    console.log(msg)
    setLogs(prev => [...prev, msg])
  }

  const handleSeed = async () => {
    if (!window.confirm("This will add more demo data (Agents, Customers, Policies, etc) to your application. Proceed?")) return

    setLoading(true)
    setLogs(['Starting Seed Process...'])
    try {
      const settingsSnap = await getDoc(doc(db, 'config', 'settings'))
      const agentPrefix = settingsSnap.exists() ? (settingsSnap.data().agentPrefix || 'KB') : 'KB'
      // Ensure secondary app exists for auth creation
      const secondaryApp = getApps().length > 1 ? getApp('SecondaryApp') : initializeApp(firebaseConfig, 'SecondaryApp')
      const secondaryAuth = getAuth(secondaryApp)
      await setPersistence(secondaryAuth, inMemoryPersistence)

      // Get master data
      log('Fetching master data (Branches, Plans, Ranks)...')
      const branchSnap = await getDocs(collection(db, 'branches'))
      let branches = []
      branchSnap.forEach(d => branches.push(d.id))
      if (branches.length === 0) branches = ['DEMO-BRANCH'] // fallback

      const planSnap = await getDocs(collection(db, 'plans_master'))
      let plans = []
      planSnap.forEach(d => plans.push({ id: d.id, ...d.data() }))
      if (plans.length === 0) throw new Error("No plans in plans_master! Please create at least one plan.")

      // Fetch Existing Counters to continue numbering
      const agentsSnap = await getDocs(collection(db, 'users'))
      let maxAgentId = 1000
      agentsSnap.forEach(d => {
        const u = d.data()
        if (u.sponsorCode) {
          const num = parseInt(u.sponsorCode.replace(/^[A-Z]+/i, ''), 10)
          if (!isNaN(num) && num > maxAgentId) maxAgentId = num
        }
      })
      let agentCounter = maxAgentId + 1

      const custCounterDoc = await getDoc(doc(db, 'counters', 'customers'))
      let custCounter = custCounterDoc.exists() ? custCounterDoc.data().seq : 1000

      const polCounterDoc = await getDoc(doc(db, 'counters', 'policies'))
      let polCounter = polCounterDoc.exists() ? polCounterDoc.data().seq : 1000

      // We will do batched writes for Firestore
      const BATCH_SIZE = 400
      let batch = writeBatch(db)
      let operationCount = 0

      const commitBatch = async () => {
        if (operationCount > 0) {
          await batch.commit()
          batch = writeBatch(db)
          operationCount = 0
        }
      }

      const addToBatch = async (docRef, data) => {
        batch.set(docRef, data)
        operationCount++
        if (operationCount >= BATCH_SIZE) await commitBatch()
      }

      // --- CREATE AGENTS (20) ---
      // Hierarchy: 1 Manager (Rank 10) -> 4 Officers (Rank 5) -> 15 Agents (Rank 1)
      log('Creating 20 Agents...')
      const agents = []
      
      const createAgent = async (rank, sponsorCode = null, indexStr) => {
        const code = `${agentPrefix}${agentCounter++}`
        const randId = Math.floor(Math.random() * 99999)
        const email = `agent${code.toLowerCase()}_${randId}@apex.test`
        const pw = '123456'
        const name = randomEl(NAMES) + ' ' + indexStr
        
        // Create Auth User
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pw)
        const uid = userCred.user.uid

        const agentData = {
          name, email,
          phone: `98${randomInt(10000000, 99999999)}`,
          rank: rank,
          sponsorCode: code,
          referredBy: sponsorCode ? (agents.find(a => a.sponsorCode === sponsorCode)?.uid || null) : null,
          branchId: randomEl(branches),
          status: 'active',
          isSuperAdmin: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }

        await addToBatch(doc(db, 'users', uid), agentData)
        agents.push({ ...agentData, uid })
        return code
      }

      // 1 Top Manager
      const mgrCode = await createAgent(10, null, '(Mgr)')
      // 4 Officers
      const officerCodes = []
      for(let i=0; i<4; i++) officerCodes.push(await createAgent(5, mgrCode, '(Off)'))
      // 15 Agents
      const baseAgentCodes = []
      for(let i=0; i<15; i++) baseAgentCodes.push(await createAgent(1, randomEl(officerCodes), '(Agt)'))

      await commitBatch()
      log(`Created 20 Agents.`)

      // --- CREATE CUSTOMERS (50) ---
      log('Creating 50 Customers...')
      const customerIds = []
      for(let i=0; i<50; i++) {
        const cId = `CUS${custCounter++}`
        const agent = randomEl(baseAgentCodes)
        await addToBatch(doc(db, 'customers', cId), {
          customerId: cId,
          name: randomEl(NAMES),
          phone: `91${randomInt(10000000, 99999999)}`,
          email: `cust${cId}@demo.com`,
          address1: '123 Demo St',
          city: randomEl(CITIES),
          state: 'Maharashtra',
          pincode: '400001',
          agentCode: agent,
          createdAt: serverTimestamp()
        })
        customerIds.push({ cId, agent })
      }
      await commitBatch()
      log('Created 50 Customers.')

      let seedTotalBusiness = 0
      let seedMonthlyBusiness = 0
      let seedTotalCommission = 0

      // --- CREATE POLICIES (75) ---
      log('Creating 75 Policies...')
      const policies = []
      for(let i=0; i<75; i++) {
        const plan = randomEl(plans)
        const planType = plan.code.toUpperCase().startsWith('RD') ? 'RD' : 'FD'
        const isRD = planType === 'RD'
        const pId = `${isRD ? 'RD' : 'FD'}-${polCounter++}`
        const cust = randomEl(customerIds)
        
        const statuses = ['active', 'active', 'active', 'active', 'active', 'matured', 'defaulter']
        const status = randomEl(statuses)
        
        let amount = isRD ? randomEl([1000, 2000, 5000]) : randomEl([10000, 50000, 100000])

        if (status === 'active' || status === 'matured') {
          seedTotalBusiness += isRD ? (amount * 12 * 5) : amount // Approx total for RD is monthly * 12 * 5
          seedMonthlyBusiness += isRD ? amount : (amount / 12)
        }

        const polData = {
          policyNumber: pId,
          customerId: cust.cId,
          agentCode: cust.agent,
          planCode: plan.code,
          type: planType,
          status,
          monthlyAmount: isRD ? amount : 0,
          totalAmount: isRD ? 0 : amount,
          installmentsPaid: isRD ? randomInt(1, 10) : 1,
          paymentDate: 5,
          createdAt: serverTimestamp()
        }
        await addToBatch(doc(db, 'policies', pId), polData)
        policies.push(polData)
      }
      await commitBatch()
      log('Created 75 Policies.')

      // --- CREATE COMMISSIONS & PAYOUTS ---
      log('Generating Commissions & Payouts...')
      let commCount = 0
      
      const generateCommissionsForPolicy = async (pol) => {
        // Create 2 paid commissions (historical) and 1 unpaid (current)
        const agent = agents.find(a => a.agentCode === pol.agentCode)
        if(!agent) return

        const amount = pol.type === 'RD' ? pol.monthlyAmount * 0.05 : pol.totalAmount * 0.02
        
        // Paid
        for(let i=1; i<=2; i++) {
          await addToBatch(doc(collection(db, 'commissions')), {
            policyNumber: pol.policyNumber,
            agentCode: pol.agentCode,
            agentName: agent.name,
            amount: amount,
            month: new Date().getMonth() - i, // Previous months
            year: new Date().getFullYear(),
            status: 'paid',
            createdAt: serverTimestamp()
          })
          seedTotalCommission += amount
          commCount++
        }
        
        // Unpaid
        await addToBatch(doc(collection(db, 'commissions')), {
          policyNumber: pol.policyNumber,
          agentCode: pol.agentCode,
          agentName: agent.name,
          amount: amount,
          month: new Date().getMonth() + 1, // Current month
          year: new Date().getFullYear(),
          status: 'unpaid',
          createdAt: serverTimestamp()
        })
        commCount++
      }

      for (const pol of policies) {
        await generateCommissionsForPolicy(pol)
      }
      
      // Generate some payouts for the previous month
      for (const ag of agents) {
        await addToBatch(doc(collection(db, 'payouts')), {
          agentCode: ag.agentCode,
          agentName: ag.name,
          totalAmount: randomInt(500, 5000),
          month: new Date().getMonth(),
          year: new Date().getFullYear(),
          status: 'paid',
          generatedDate: serverTimestamp()
        })
      }
      await commitBatch()
      log(`Created ${commCount} Commissions and 20 Payout records.`)

      // Update counters
      await addToBatch(doc(db, 'counters', 'agents'), { seq: agentCounter })
      await addToBatch(doc(db, 'counters', 'customers'), { seq: custCounter })
      await addToBatch(doc(db, 'counters', 'policies'), { seq: polCounter })
      await commitBatch()

      // Update Dashboard Summary
      await updateDashboardSummary({
        totalBusiness: seedTotalBusiness,
        monthlyBusiness: seedMonthlyBusiness,
        totalCommission: seedTotalCommission,
        activeAgents: 20,
        totalAgents: 20,
        growthData: [
          { month: 'Jan', Business: Math.floor(seedMonthlyBusiness * 0.7) },
          { month: 'Feb', Business: Math.floor(seedMonthlyBusiness * 0.8) },
          { month: 'Mar', Business: Math.floor(seedMonthlyBusiness * 0.9) },
          { month: 'Apr', Business: Math.floor(seedMonthlyBusiness * 0.95) },
          { month: 'May', Business: Math.floor(seedMonthlyBusiness * 0.98) },
          { month: 'Jun', Business: Math.floor(seedMonthlyBusiness) },
        ],
        branchPerformance: [
          { name: 'DEMO-BRANCH', Sales: 100 }
        ]
      })

      log('🎉 SEED COMPLETED SUCCESSFULLY!')
      toast.success('Demo data seeded successfully')
    } catch (err) {
      console.error(err)
      toast.error('Seed failed: ' + err.message)
      log('ERROR: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client Demo Seeder</h1>
          <p className="text-gray-500">Generate realistic, interconnected data for a flawless presentation.</p>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 flex gap-3">
        <IAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-bold">WARNING: Destructive Operation</p>
          <p>Running this script will permanently delete all existing Agents, Customers, Policies, Commissions, and Payouts. It will then generate a fresh batch of realistic demo data.</p>
        </div>
      </div>

      <button
        onClick={handleSeed}
        disabled={loading}
        className="btn btn-primary w-full py-4 text-lg"
      >
        {loading ? 'Seeding Database...' : 'Run Demo Data Seeder (v3)'}
      </button>

      {logs.length > 0 && (
        <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded h-64 overflow-y-auto">
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
