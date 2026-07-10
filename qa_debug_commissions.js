/**
 * qa_debug_commissions.js
 * Debugs why only Rank 1 receives commission
 */
import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, collection, query, where, getDoc, doc } from 'firebase/firestore'
import { calculateCommissions } from './src/lib/commissionEngine.js'
import { RANKS } from './src/data/ranks.js'

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

const DEFAULT_COMMISSION_MASTER = {
  RD1Y: {
    1: { AO: 8, AM: 10, ADM: 12, DM: 14, SDM: 16, CM: 18, AGM: 20, GM: 21, ZM: 22, ED: 23, SED: 24, MD: 25, CMD: 26, AVP: 27, VP: 28, SVP: 29, EVP: 30, MGD: 31 }
  }
}

async function main() {
  console.log('Fetching users...')
  const usersSnap = await getDocs(collection(db, 'users'))
  
  const uMap = {}
  const idMap = {}
  usersSnap.forEach(d => {
    const u = d.data()
    const userObj = { id: d.id, name: u.name, branchId: u.branchId, rank: u.rank, sponsorCode: u.sponsorCode, referredBy: u.referredBy }
    if (u.sponsorCode) {
      uMap[u.sponsorCode.trim().toLowerCase()] = userObj
    }
    idMap[d.id] = userObj
  })

  const baseAgent = uMap['qa01']
  if (!baseAgent) {
    console.log('QA01 agent not found!')
    return
  }

  console.log('\n--- UPLINE TRAVERSAL ---')
  let cur = baseAgent
  let chain = []
  while (cur) {
    chain.push(`Rank ${cur.rank} (${cur.sponsorCode}) -> referredBy: ${cur.referredBy}`)
    if (cur.referredBy && idMap[cur.referredBy]) {
      cur = idMap[cur.referredBy]
    } else {
      break
    }
  }
  console.log(chain.join('\n'))

  console.log('Fetching ranks from Firestore...')
  const ranksSnap = await getDoc(doc(db, 'config', 'ranks'))
  let activeRanks = RANKS
  if (ranksSnap.exists() && ranksSnap.data().ranks) {
    const rawRanks = ranksSnap.data().ranks || []
    activeRanks = [...rawRanks].sort((a, b) => Number(a.rank) - Number(b.rank))
  }

  console.log('\n--- COMMISSION ENGINE RESULTS ---')
  const results = calculateCommissions({
    businessAmount: 120000,
    plan: { planCode: 'RD1Y', planType: 'RD', policyYear: 1 },
    baseAgent: baseAgent,
    usersMap: idMap,
    commissionMaster: DEFAULT_COMMISSION_MASTER,
    ranksList: activeRanks,
    customer: { id: 'cust1', name: 'Test', account: 'act1' },
    policyInfo: { id: 'pol1', number: 'POL1' },
    monthNum: 7,
    yearNum: 2026
  })

  console.table(results.map(r => ({
    Rank: r.receivingRank,
    Code: r.receivingRankCode,
    Pct: r.percentage + '%',
    Amt: r.amount,
    Type: r.commissionType
  })))
  
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
