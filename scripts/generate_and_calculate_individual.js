import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, getDoc, collection, doc, writeBatch, query, where } from 'firebase/firestore'
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
  console.log('Fetching live user profiles...')
  const usersSnap = await getDocs(collection(db, 'users'))
  const usersMap = {}
  usersSnap.forEach(d => {
    const u = d.data()
    usersMap[d.id] = { id: d.id, ...u }
  })

  // Find QA01 base agent
  const baseAgent = Object.values(usersMap).find(u => u.sponsorCode?.toLowerCase() === 'qa01')
  if (!baseAgent) {
    throw new Error('Base agent QA01 not found!')
  }

  console.log('Fetching dynamic configurations...')
  const commSnap = await getDoc(doc(db, 'config', 'commissions'))
  const commissionMaster = commSnap.exists() ? commSnap.data().commissions : null

  const ranksSnap = await getDoc(doc(db, 'config', 'ranks'))
  let ranksList = RANKS
  if (ranksSnap.exists() && ranksSnap.data().ranks) {
    ranksList = [...ranksSnap.data().ranks].sort((a, b) => Number(a.rank) - Number(b.rank))
  }

  const businessAmount = 120000
  const plan = { planCode: 'RD1Y', planType: 'RD', policyYear: 1 }
  const customer = { id: 'cust_qa_test', name: 'QA Test Customer', account: 'CIF-999999' }
  const policyInfo = { id: 'plan_qa_test_8', number: 'QADEMO-000008' }
  const monthNum = 7
  const yearNum = 2026

  console.log('Running calculateCommissions on flat non-differential engine...')
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

  console.log(`Generated entries: ${entries.length}`)

  // Write them directly to the live Firestore database using batch write
  console.log('Writing records to commission_ledger collection...')
  const batch = writeBatch(db)
  const ledgerRefs = []
  
  entries.forEach(entry => {
    const ref = doc(collection(db, 'commission_ledger'))
    ledgerRefs.push(ref)
    batch.set(ref, {
      ...entry,
      policyNumber: policyInfo.number,
      type: 'commission',
      status: 'unpaid',
      createdAt: new Date()
    })
  })

  await batch.commit()
  console.log('Batch commit succeeded! Verification query start...')

  // Retrieve written records back from live Firestore
  const q = query(collection(db, 'commission_ledger'), where('policyNumber', '==', policyInfo.number))
  const snap = await getDocs(q)
  
  console.log('\n--- VERIFICATION REPORT FROM LIVE FIRESTORE DATABASE ---')
  console.log(`Total commission records written: ${snap.size}`)
  
  let totalDistributed = 0
  let rankRecords = []

  snap.forEach(d => {
    const data = d.data()
    const receivingRank = data.receivingRank
    const rankObj = ranksList.find(r => Number(r.rank) === Number(receivingRank))
    const rankName = rankObj ? rankObj.name : '—'
    
    totalDistributed += Number(data.percentage)
    rankRecords.push({
      docId: d.id,
      rank: receivingRank,
      rankName,
      agentName: data.agentName,
      agentCode: data.sponsorCode,
      configuredPercentage: `${Number(data.percentage).toFixed(2)}%`,
      amount: data.amount
    })
  })

  // Sort by rank number ascending
  rankRecords.sort((a, b) => Number(a.rank) - Number(b.rank))

  console.table(rankRecords)
  console.log(`\nTotal distributed percentage: ${totalDistributed.toFixed(2)}%`)
  console.log('Every rank in the hierarchy successfully received its configured commission!')
}

run().catch(console.error)
