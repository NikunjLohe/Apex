import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, getDoc, collection, doc } from 'firebase/firestore'
import { RANKS } from './src/data/ranks.js'
import { calculateCommissions } from './src/lib/commissionEngine.js'

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

async function main() {
  console.log('Fetching live users...')
  const usersSnap = await getDocs(collection(db, 'users'))
  
  const idMap = {}
  usersSnap.forEach(d => {
    const u = d.data()
    idMap[d.id] = { id: d.id, name: u.name, rank: u.rank, sponsorCode: u.sponsorCode, referredBy: u.referredBy }
  })

  // QA01
  const baseAgent = Object.values(idMap).find(a => a.sponsorCode?.toLowerCase() === 'qa01')

  console.log('Fetching live config/commissions...')
  let commConfig = null
  const commSnap = await getDoc(doc(db, 'config', 'commissions'))
  if (commSnap.exists()) {
    commConfig = commSnap.data().commissions
    console.log('Found config/commissions in Firestore!')
  }

  // Same logic as live ImportData.jsx
  if (commConfig && commConfig.RD1Y && commConfig.RD1Y[1] && commConfig.RD1Y[1].AM !== undefined) {
    // using fetched
  } else {
    commConfig = {
      RD1Y: {
        1: { AO: 8, AM: 10, ADM: 12, DM: 14, SDM: 16, CM: 18, AGM: 20, GM: 21, ZM: 22, ED: 23, SED: 24, MD: 25, CMD: 26, AVP: 27, VP: 28, SVP: 29, EVP: 30, MGD: 31 }
      }
    }
  }

  console.log('Fetching live config/ranks...')
  const ranksSnap = await getDoc(doc(db, 'config', 'ranks'))
  let activeRanks = RANKS
  if (ranksSnap.exists() && ranksSnap.data().ranks) {
    activeRanks = [...ranksSnap.data().ranks].sort((a, b) => Number(a.rank) - Number(b.rank))
  }

  console.log('------------------------------------------------')
  console.log('Seller:')
  console.log('Agent Name:', baseAgent.name)
  console.log('Agent Code:', baseAgent.sponsorCode)
  console.log('Rank:', baseAgent.rank)
  const code = 'RD1Y'
  const yr = 1
  const getRate = (rCode) => {
    if (commConfig && commConfig[code] && commConfig[code][yr] && commConfig[code][yr][rCode] !== undefined) {
      return Number(commConfig[code][yr][rCode])
    }
    return 0
  }
  console.log('Rate:', getRate(activeRanks.find(r => r.rank == baseAgent.rank)?.code))

  let cur = baseAgent
  let lastRankNum = 0
  let maxEncountered = 0
  let entriesCreated = 0

  while (cur) {
    console.log('\nFind Sponsor...')
    if (!cur.referredBy || !idMap[cur.referredBy]) {
      console.log('next sponsor found (or null): null')
      console.log('reason for stopping: cur.referredBy is null or missing in idMap')
      break
    }
    
    cur = idMap[cur.referredBy]
    const curRankNum = Number(cur.rank)
    const rankObj = activeRanks.find(r => r.rank == curRankNum)
    const rankCode = rankObj ? rankObj.code : 'AO'
    const confRate = getRate(rankCode)
    
    console.log('Sponsor Found:')
    console.log('Agent Name:', cur.name)
    console.log('Agent Code:', cur.sponsorCode)
    console.log('Rank:', cur.rank)
    console.log('Rank Code:', rankCode)
    console.log('Configured Rate:', confRate + '%')
    
    const diff = Math.max(0, confRate - maxEncountered)
    console.log('Calculated Differential:', diff + '%')
    
    if (diff > 0) {
      console.log('Ledger Entry Created? YES')
      entriesCreated++
      maxEncountered = confRate
    } else {
      console.log('Ledger Entry Created? NO')
    }
    console.log('Move to Next Sponsor...')
  }

  console.log('------------------------------------------------')
  const results = calculateCommissions({
    businessAmount: 120000,
    plan: { planCode: 'RD1Y', planType: 'RD', policyYear: 1 },
    baseAgent,
    usersMap: idMap,
    commissionMaster: commConfig,
    ranksList: activeRanks,
    customer: { id: 'c1', name: 'N', account: 'A' },
    policyInfo: { id: 'p1', number: 'P1' },
    monthNum: 7, yearNum: 2026
  })
  console.log('total number of commission objects returned by calculateCommissions():', results.length)

  process.exit(0)
}
main()
