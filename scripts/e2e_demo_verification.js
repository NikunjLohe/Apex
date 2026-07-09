import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, getDoc, collection, doc, writeBatch, query, where, setDoc } from 'firebase/firestore'
import { calculateCommissions } from '../src/lib/commissionEngine.js'
import { RANKS } from '../src/data/ranks.js'

const firebaseConfig = {
  apiKey:            'AIzaSyD5fcJcJABzW5uv6POSxNA0oTzkZG8hNvU',
  authDomain:        'mlm-80f97.firebaseapp.com',
  projectId:         'mlm-80f97',
  storageBucket:     'mlm-80f97.firebasestorage.app',
  messagingSenderId: '723541617943',
  appId:             '1:723541617943:web:530d2921b50c86ac7a5b52',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function run() {
  console.log('1. Starting E2E Client Demo Verification on LIVE Firestore Database...')
  const batch = writeBatch(db)

  // Step A: Create Customer
  const customerId = 'cust_e2e_demo_9'
  const customerRef = doc(db, 'customers', customerId)
  const customerData = {
    name: 'E2E Demo Customer',
    account: 'CIF-888888',
    phone: '9876543210',
    email: 'e2e@demo.test',
    status: 'active',
    createdAt: new Date()
  }
  console.log('2. Preparing customer creation document...')
  batch.set(customerRef, customerData)

  // Step B: Create Policy
  const policyId = 'plan_e2e_demo_9'
  const policyRef = doc(db, 'plans', policyId)
  
  // Find QA01 base agent from Firestore
  console.log('3. Fetching live users to identify base agent QA01...')
  const usersSnap = await getDocs(collection(db, 'users'))
  const usersMap = {}
  usersSnap.forEach(d => {
    const u = d.data()
    usersMap[d.id] = { id: d.id, ...u }
  })
  const baseAgent = Object.values(usersMap).find(u => u.sponsorCode?.toLowerCase() === 'qa01')
  if (!baseAgent) {
    throw new Error('Base agent QA01 not found!')
  }

  const policyData = {
    policyNumber: 'QADEMO-000009',
    customerId: customerId,
    customerName: customerData.name,
    customerAccount: customerData.account,
    agentId: baseAgent.id,
    agentName: baseAgent.name,
    type: 'RD1Y',
    duration: 1,
    monthlyAmount: 10000,
    status: 'active',
    startDate: new Date(),
    createdAt: new Date()
  }
  console.log('4. Preparing policy creation document...')
  batch.set(policyRef, policyData)

  // Step C: Calculate Commissions
  console.log('5. Loading commission master configuration...')
  const commSnap = await getDoc(doc(db, 'config', 'commissions'))
  const commissionMaster = commSnap.exists() ? commSnap.data().commissions : null

  const ranksSnap = await getDoc(doc(db, 'config', 'ranks'))
  let ranksList = RANKS
  if (ranksSnap.exists() && ranksSnap.data().ranks) {
    ranksList = [...ranksSnap.data().ranks].sort((a, b) => Number(a.rank) - Number(b.rank))
  }

  const businessAmount = 120000 // 10000 * 12 * 1
  const plan = { planCode: 'RD1Y', planType: 'RD', policyYear: 1 }
  const customer = { id: customerId, name: customerData.name, account: customerData.account }
  const policyInfo = { id: policyId, number: policyData.policyNumber }
  const monthNum = 7
  const yearNum = 2026

  console.log('6. Mapped policy stats: RD1Y plan, premium = 1,20,000')
  const entries = calculateCommissions({
    businessAmount,
    plan,
    baseAgent,
    usersMap,
    commissionMaster,
    ranksList,
    customer,
    policyInfo,
    monthNum,
    yearNum
  })

  console.log(`7. Calculating commissions. Generated entries count: ${entries.length}`)
  
  entries.forEach(entry => {
    const ledgerRef = doc(collection(db, 'commission_ledger'))
    batch.set(ledgerRef, {
      ...entry,
      createdAt: new Date()
    })
  })

  console.log('8. Committing E2E transaction batch to LIVE database...')
  await batch.commit()
  console.log('9. Batch write transaction committed successfully!')

  // Step D: Verify Ledger Entries
  console.log('10. Querying created ledger documents back to verify details...')
  const q = query(collection(db, 'commission_ledger'), where('policyNumber', '==', policyData.policyNumber))
  const snap = await getDocs(q)
  
  console.log(`11. Total ledger entries retrieved: ${snap.size}`)

  let directCount = 0
  let uplineCount = 0
  let totalDistributed = 0
  let verificationTable = []

  snap.forEach(d => {
    const data = d.data()
    const isDirect = (data.commissionType === 'Direct' || data.commissionType === 'direct')
    if (isDirect) directCount++
    else uplineCount++

    totalDistributed += Number(data.percentage)
    
    const rankObj = ranksList.find(r => Number(r.rank) === Number(data.receivingRank))
    const rankCode = rankObj ? rankObj.code : `Rank ${data.receivingRank}`

    verificationTable.push({
      docId: d.id,
      rank: data.receivingRank,
      rankCode,
      agentName: data.agentName,
      agentCode: data.sponsorCode,
      percentage: `${Number(data.percentage).toFixed(2)}%`,
      amount: `₹${Number(data.amount).toLocaleString('en-IN')}`,
      type: isDirect ? 'Direct' : 'Upline Commission'
    })
  })

  verificationTable.sort((a, b) => Number(a.rank) - Number(b.rank))
  console.table(verificationTable)

  console.log('\n--- VERIFICATION STATUS CHECK ---')
  const passCustomer = snap.size === 18 ? 'PASS' : 'FAIL'
  const passDirect = directCount === 1 ? 'PASS' : 'FAIL'
  const passUpline = uplineCount === 17 ? 'PASS' : 'FAIL'
  const passPercentage = totalDistributed.toFixed(2) === '8.65' ? 'PASS' : 'FAIL'

  console.log(`Customer & Policy Creation: PASS`)
  console.log(`Commission Record Count (Expected 18): ${passCustomer} (Count: ${snap.size})`)
  console.log(`Direct Commission Assigned (Expected 1): ${passDirect} (Count: ${directCount})`)
  console.log(`Upline Commission Assigned (Expected 17): ${passUpline} (Count: ${uplineCount})`)
  console.log(`Total Distributed Commission (Expected 8.65%): ${passPercentage} (Actual: ${totalDistributed.toFixed(2)}%)`)
}

run().catch(console.error)
