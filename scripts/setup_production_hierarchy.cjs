const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const XLSX = require('xlsx')
const path = require('path')
const sa = require(path.resolve('serviceAccountKey.json'))

initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

// Official designation names from Rank Master
const hierarchy = [
  {
    rank: 18,
    name: "Managing Director",
    code: "MGT000018",
    sponsorCode: "admin@apex.com",
    email: "mgd@apex.local",
    password: "MGD@Apex2026",
    phone: "9800000018",
    panNumber: "MGDIR0018A"
  },
  {
    rank: 17,
    name: "Executive Vice President",
    code: "MGT000017",
    sponsorCode: "MGT000018",
    email: "evp@apex.local",
    password: "EVP@Apex2026",
    phone: "9800000017",
    panNumber: "EVPRE0017B"
  },
  {
    rank: 16,
    name: "Senior Vice President",
    code: "MGT000016",
    sponsorCode: "MGT000017",
    email: "svp@apex.local",
    password: "SVP@Apex2026",
    phone: "9800000016",
    panNumber: "SVPRE0016C"
  },
  {
    rank: 15,
    name: "Vice President",
    code: "MGT000015",
    sponsorCode: "MGT000016",
    email: "vp@apex.local",
    password: "VP@Apex20261",
    phone: "9800000015",
    panNumber: "VPPRE0015D"
  },
  {
    rank: 14,
    name: "Asst. Vice President",
    code: "MGT000014",
    sponsorCode: "MGT000015",
    email: "avp@apex.local",
    password: "AVP@Apex2026",
    phone: "9800000014",
    panNumber: "AVPRE0014E"
  },
  {
    rank: 13,
    name: "Chief Marketing Director",
    code: "MGT000013",
    sponsorCode: "MGT000014",
    email: "cmd@apex.local",
    password: "CMD@Apex2026",
    phone: "9800000013",
    panNumber: "CMDRE0013F"
  },
  {
    rank: 12,
    name: "Marketing Director",
    code: "MGT000012",
    sponsorCode: "MGT000013",
    email: "md@apex.local",
    password: "MD@Apex20261",
    phone: "9800000012",
    panNumber: "MDPRE0012G"
  },
  {
    rank: 11,
    name: "Sr. Executive Director",
    code: "MGT000011",
    sponsorCode: "MGT000012",
    email: "sed@apex.local",
    password: "SED@Apex2026",
    phone: "9800000011",
    panNumber: "SEDRE0011H"
  }
]

async function run() {
  console.log('--- STARTING PRODUCTION HIERARCHY SETUP ---')

  // 1. Find Super Admin
  const superAdminSnap = await db.collection('users').where('email', '==', 'admin@apex.com').get()
  if (superAdminSnap.empty) {
    throw new Error('Super Admin account with email admin@apex.com not found.')
  }
  const superAdminDoc = superAdminSnap.docs[0]
  const superAdminUid = superAdminDoc.id
  console.log(`Found Super Admin: ${superAdminDoc.data().name} (${superAdminUid})`)

  // 2. Delete ALL existing non-super-admin users to start clean
  console.log('Deleting ALL existing non-super-admin users...')
  const allUsersSnap = await db.collection('users').get()
  for (const d of allUsersSnap.docs) {
    if (!d.data().isSuperAdmin) {
      console.log(`  Deleting Firestore user: ${d.data().name} (${d.id})`)
      await d.ref.delete()
      try {
        await auth.deleteUser(d.id)
        console.log(`  Deleted Auth user: ${d.id}`)
      } catch (e) {
        // Already deleted or not found
      }
    }
  }

  // 3. Build sponsor code → UID map
  const codeToUidMap = {
    "admin@apex.com": superAdminUid
  }

  // 4. Create management hierarchy sequentially
  for (const item of hierarchy) {
    const parentUid = codeToUidMap[item.sponsorCode]
    if (!parentUid) {
      throw new Error(`Sponsor UID for code ${item.sponsorCode} not found.`)
    }

    console.log(`Creating Auth user: ${item.name} <${item.email}>...`)
    const userRecord = await auth.createUser({
      email: item.email,
      password: item.password,
      displayName: item.name,
      emailVerified: true
    })

    const uid = userRecord.uid
    codeToUidMap[item.code] = uid

    console.log(`Creating Firestore doc for ${item.name} (${uid}) under sponsor ${item.sponsorCode} (${parentUid})...`)
    await db.collection('users').doc(uid).set({
      name: item.name,
      email: item.email,
      phone: item.phone,
      rank: item.rank,
      isSuperAdmin: false,
      branchId: "main-branch",
      status: "active",
      sponsorCode: item.code,
      referredBy: parentUid,
      mustChangePassword: false,
      panNumber: item.panNumber,
      address: "Mumbai, Maharashtra",
      dob: "1980-01-01",
      joinDate: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
  }

  // 5. Reset agent counter — NEXT agent will be KB000001
  console.log('Resetting counters/agents -> seq = 0 (next agent = KB000001)')
  await db.doc('counters/agents').set({ seq: 0 })

  // 6. Generate Excel credentials sheet
  console.log('Generating Excel credentials sheet...')
  const excelData = [
    {
      "Name": "Super Admin",
      "Rank": 99,
      "Agent Code": "SUPER-ADMIN",
      "Sponsor": "Root",
      "Login Email": "admin@apex.com",
      "Password": "Apex@12345",
      "Phone": "N/A",
      "PAN": "N/A"
    },
    ...hierarchy.map(item => ({
      "Name": item.name,
      "Rank": item.rank,
      "Agent Code": item.code,
      "Sponsor": item.sponsorCode,
      "Login Email": item.email,
      "Password": item.password,
      "Phone": item.phone,
      "PAN": item.panNumber
    }))
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)

  const wscols = [
    { wch: 26 }, // Name
    { wch: 8 },  // Rank
    { wch: 15 }, // Agent Code
    { wch: 20 }, // Sponsor
    { wch: 24 }, // Login Email
    { wch: 18 }, // Password
    { wch: 15 }, // Phone
    { wch: 15 }  // PAN
  ]
  ws['!cols'] = wscols

  XLSX.utils.book_append_sheet(wb, ws, "Management Hierarchy")
  const xlsxPath = path.resolve('management_hierarchy.xlsx')
  XLSX.writeFile(wb, xlsxPath)
  console.log(`Excel file written to ${xlsxPath}`)

  // 7. Final audit
  console.log('\n=== FINAL DATABASE STATE ===')
  const finalSnap = await db.collection('users').get()
  const sorted = finalSnap.docs.sort((a, b) => (b.data().rank || 0) - (a.data().rank || 0))
  sorted.forEach(d => {
    const data = d.data()
    console.log(`  Rank ${String(data.rank).padStart(2, ' ')} | ${data.sponsorCode || 'N/A'} | ${data.name} <${data.email}>`)
  })

  const counterSnap = await db.doc('counters/agents').get()
  const nextSeq = (counterSnap.data().seq || 0) + 1
  console.log(`\n  Next generated field agent code: KB${String(nextSeq).padStart(6, '0')}`)
  console.log('\n--- PRODUCTION HIERARCHY SETUP COMPLETED SUCCESSFULLY ---')
}

run().catch(console.error)
