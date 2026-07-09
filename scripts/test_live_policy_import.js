import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore'
import { calculateCommissions } from '../src/lib/commissionEngine.js'

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

async function test() {
  console.log('Fetching live config/commissions...')
  const commSnap = await getDoc(doc(db, 'config', 'commissions'))
  const commissionMaster = commSnap.exists() ? commSnap.data().commissions : null
  
  console.log('Fetching live config/ranks...')
  const ranksSnap = await getDoc(doc(db, 'config', 'ranks'))
  const ranksList = ranksSnap.exists() ? ranksSnap.data().ranks : []
  
  console.log(`ranksList length: ${ranksList.length}`)
  console.log('ranksList:', JSON.stringify(ranksList, null, 2))

  console.log('Fetching live users to build usersMap...')
  const usersSnap = await getDocs(collection(db, 'users'))
  const idMap = {}
  usersSnap.forEach(d => {
    const u = d.data()
    idMap[d.id] = { id: d.id, name: u.name, branchId: u.branchId, rank: u.rank, sponsorCode: u.sponsorCode, referredBy: u.referredBy }
  })

  const baseAgent = Object.values(idMap).find(a => a.sponsorCode === 'QA01')
  console.log(`Base Agent found: ${baseAgent.name} (Rank: ${baseAgent.rank})`)

  const commissionResults = calculateCommissions({
    businessAmount: 4800 * 12,
    plan: {
      planCode: 'RD1Y',
      planType: 'RD',
      policyYear: 1
    },
    baseAgent,
    usersMap: idMap,
    commissionMaster,
    ranksList,
    customer: { id: 'cust-test', name: 'Test Customer', account: 'CIF-TEST' },
    policyInfo: { id: 'pol-test', number: 'QADEMO-TEST-001' },
    monthNum: 7,
    yearNum: 2026
  })

  console.log(`calculateCommissions() returned ${commissionResults.length} records.`)
  commissionResults.forEach(c => {
    console.log(`Agent: ${c.agentName} | Rank: ${c.receivingRankCode} | Type: ${c.commissionType} | Pct: ${c.percentage}% | Amt: ${c.amount}`)
  })
}

test().catch(console.error)
