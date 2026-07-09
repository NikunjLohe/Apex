import { initializeApp } from 'firebase/app'
import { getFirestore, setDoc, doc, serverTimestamp } from 'firebase/firestore'
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

// The default values mapped directly from the Promotion Quota & Monthly Incentive Structure:
const DEFAULTS = {
  AO:  { mfa: 400,   mfaTarget: 20000,   pb: 0,     pbTarget: 0,        ta: 0,    cmd: 3000,    cmdTarget: 300000,    promoTarget: 0 },
  AM:  { mfa: 500,   mfaTarget: 40000,   pb: 0,     pbTarget: 0,        ta: 500,  cmd: 9000,    cmdTarget: 900000,    promoTarget: 50000 },
  ADM: { mfa: 600,   mfaTarget: 60000,   pb: 0,     pbTarget: 0,        ta: 1000, cmd: 15000,   cmdTarget: 1500000,   promoTarget: 150000 },
  DM:  { mfa: 750,   mfaTarget: 80000,   pb: 3000,  pbTarget: 200000,   ta: 1000, cmd: 25000,   cmdTarget: 2500000,   promoTarget: 300000 },
  SDM: { mfa: 1000,  mfaTarget: 200000,  pb: 4000,  pbTarget: 500000,   ta: 1500, cmd: 40000,   cmdTarget: 4000000,   promoTarget: 500000 },
  CM:  { mfa: 1500,  mfaTarget: 300000,  pb: 6000,  pbTarget: 800000,   ta: 1500, cmd: 60000,   cmdTarget: 6000000,   promoTarget: 750000 },
  AGM: { mfa: 2000,  mfaTarget: 400000,  pb: 7000,  pbTarget: 1000000,  ta: 2000, cmd: 80000,   cmdTarget: 8000000,   promoTarget: 1500000 },
  GM:  { mfa: 2500,  mfaTarget: 600000,  pb: 8000,  pbTarget: 1500000,  ta: 2500, cmd: 100000,  cmdTarget: 10000000,  promoTarget: 2000000 },
  ZM:  { mfa: 3000,  mfaTarget: 800000,  pb: 9000,  pbTarget: 2000000,  ta: 2500, cmd: 150000,  cmdTarget: 15000000,  promoTarget: 3000000 },
  ED:  { mfa: 3500,  mfaTarget: 1000000, pb: 10000, pbTarget: 3000000,  ta: 3000, cmd: 200000,  cmdTarget: 20000000,  promoTarget: 4500000 },
  SED: { mfa: 4000,  mfaTarget: 1200000, pb: 15000, pbTarget: 4000000,  ta: 3000, cmd: 225000,  cmdTarget: 30000000,  promoTarget: 6000000 },
  MD:  { mfa: 5000,  mfaTarget: 1500000, pb: 20000, pbTarget: 5000000,  ta: 3500, cmd: 300000,  cmdTarget: 40000000,  promoTarget: 7500000 },
  CMD: { mfa: 6000,  mfaTarget: 1800000, pb: 25000, pbTarget: 6000000,  ta: 3500, cmd: 412500,  cmdTarget: 55000000,  promoTarget: 90000000 },
  AVP: { mfa: 7500,  mfaTarget: 2100000, pb: 32500, pbTarget: 7500000,  ta: 4500, cmd: 525000,  cmdTarget: 70000000,  promoTarget: 120000000 },
  VP:  { mfa: 9000,  mfaTarget: 2500000, pb: 40000, pbTarget: 9000000,  ta: 6000, cmd: 675000,  cmdTarget: 90000000,  promoTarget: 150000000 },
  SVP: { mfa: 12000, mfaTarget: 3000000, pb: 50000, pbTarget: 10500000, ta: 7000, cmd: 550000,  cmdTarget: 110000000, promoTarget: 180000000 },
  EVP: { mfa: 15000, mfaTarget: 3500000, pb: 60000, pbTarget: 12000000, ta: 9000, cmd: 750000,  cmdTarget: 150000000, promoTarget: 210000000 },
  MGD: { mfa: 20000, mfaTarget: 4000000, pb: 75000, pbTarget: 13500000, ta: 12000,cmd: 1000000, cmdTarget: 200000000, promoTarget: 250000000 },
}

async function run() {
  console.log('Seeding config/ranks default targets and amounts...')

  const updatedRanks = RANKS.map(r => {
    const val = DEFAULTS[r.code] || { mfa: 0, mfaTarget: 0, pb: 0, pbTarget: 0, ta: 0, cmd: 0, cmdTarget: 0, promoTarget: 0 }
    return {
      rank: Number(r.rank),
      code: r.code,
      name: r.name,
      mfa: val.mfa,
      mfaTarget: val.mfaTarget,
      ta: val.ta,
      pbTarget: val.pbTarget,
      pbAmount: val.pb,
      promoTarget: val.promoTarget,
      cmdTarget: val.cmdTarget,
      cmdAmount: val.cmd,
      mdaY1: [0, 0, 0, 0, 0],
      mdaY2: [null, 0, 0, 0, 0],
      fdPension: [0, 0, 0, 0, 0],
      recruitPermission: Number(r.rank) > 1,
      promoDesc: '',
      status: 'active'
    }
  })

  const ref = doc(db, 'config', 'ranks')
  await setDoc(ref, {
    ranks: updatedRanks,
    updatedAt: serverTimestamp()
  })

  console.log('Seeding ranks configuration completed successfully!')
}

run().catch(console.error)
