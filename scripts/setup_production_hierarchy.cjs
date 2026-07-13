const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const XLSX = require('xlsx')
const path = require('path')
const sa = require(path.resolve('serviceAccountKey.json'))

initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

const hierarchy = [
  {
    rank: 18,
    name: "Rajesh Kumar",
    code: "MGT000018",
    sponsorCode: "admin@apex.com",
    email: "rajesh.kumar@apex.local",
    password: "Rajesh@Apex2026",
    phone: "9876543210",
    panNumber: "ABCDE1234F"
  },
  {
    rank: 17,
    name: "Sanjay Singhal",
    code: "MGT000017",
    sponsorCode: "MGT000018",
    email: "sanjay.singhal@apex.local",
    password: "Sanjay@Apex2026",
    phone: "9876543211",
    panNumber: "BCDEF2345G"
  },
  {
    rank: 16,
    name: "Vikram Malhotra",
    code: "MGT000016",
    sponsorCode: "MGT000017",
    email: "vikram.malhotra@apex.local",
    password: "Vikram@Apex2026",
    phone: "9876543212",
    panNumber: "CDEFG3456H"
  },
  {
    rank: 15,
    name: "Sunita Deshmukh",
    code: "MGT000015",
    sponsorCode: "MGT000016",
    email: "sunita.deshmukh@apex.local",
    password: "Sunita@Apex2026",
    phone: "9876543213",
    panNumber: "DEFGH4567I"
  },
  {
    rank: 14,
    name: "Pankaj Mishra",
    code: "MGT000014",
    sponsorCode: "MGT000015",
    email: "pankaj.mishra@apex.local",
    password: "Pankaj@Apex2026",
    phone: "9876543214",
    panNumber: "EFGHI5678J"
  },
  {
    rank: 13,
    name: "Aarav Mehta",
    code: "MGT000013",
    sponsorCode: "MGT000014",
    email: "aarav.mehta@apex.local",
    password: "Aarav@Apex2026",
    phone: "9876543215",
    panNumber: "FGHIJ6789K"
  },
  {
    rank: 12,
    name: "Deepak Joshi",
    code: "MGT000012",
    sponsorCode: "MGT000013",
    email: "deepak.joshi@apex.local",
    password: "Deepak@Apex2026",
    phone: "9876543216",
    panNumber: "GHIJK7890L"
  },
  {
    rank: 11,
    name: "Neha Sharma",
    code: "MGT000011",
    sponsorCode: "MGT000012",
    email: "neha.sharma@apex.local",
    password: "Neha@Apex2026",
    phone: "9876543217",
    panNumber: "HIJKL8901M"
  }
]

async function run() {
  console.log('--- STARTING PRODUCTION HIERARCHY SETUP ---')

  // 1. Find Super Admin details
  const superAdminSnap = await db.collection('users').where('email', '==', 'admin@apex.com').get()
  if (superAdminSnap.empty) {
    throw new Error('Super Admin account with email admin@apex.com not found. Run production_reset.cjs first.')
  }
  const superAdminDoc = superAdminSnap.docs[0]
  const superAdminUid = superAdminDoc.id
  console.log(`Found Super Admin: ${superAdminDoc.data().name} (${superAdminUid})`)

  // We will map sponsor code to UIDs to build the referredBy chain
  const codeToUidMap = {
    "admin@apex.com": superAdminUid
  }

  // 2. Clear out any old versions of these users to make this script idempotent
  for (const item of hierarchy) {
    try {
      const existingUser = await auth.getUserByEmail(item.email)
      console.log(`Deleting existing Auth user: ${item.email} (${existingUser.uid})`)
      await auth.deleteUser(existingUser.uid)
      await db.collection('users').doc(existingUser.uid).delete()
    } catch (e) {
      // User doesn't exist, which is fine
    }

    // Also delete by sponsorCode just in case
    const codeSnap = await db.collection('users').where('sponsorCode', '==', item.code).get()
    for (const d of codeSnap.docs) {
      console.log(`Deleting existing Firestore doc: ${d.id} with code ${item.code}`)
      await d.ref.delete()
      try {
        await auth.deleteUser(d.id)
      } catch (e) {}
    }
  }

  // 3. Create the management hierarchy sequentially (to resolve referrers properly)
  for (const item of hierarchy) {
    const parentUid = codeToUidMap[item.sponsorCode]
    if (!parentUid) {
      throw new Error(`Sponsor UID for code ${item.sponsorCode} not found in map.`)
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
      mustChangePassword: false, // let them log in directly
      panNumber: item.panNumber,
      address: "Mumbai, Maharashtra",
      dob: "1980-01-01",
      joinDate: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
  }

  // 4. Set/Ensure counters/agents seq = 0
  console.log('Resetting counters/agents -> seq = 0')
  await db.doc('counters/agents').set({ seq: 0 })

  // 5. Generate Excel file
  console.log('Generating Excel sheet of management accounts...')
  const excelData = hierarchy.map(item => ({
    "Name": item.name,
    "Rank": item.rank,
    "Agent Code": item.code,
    "Sponsor Agent Code": item.sponsorCode,
    "Login Email": item.email,
    "Password": item.password,
    "Phone": item.phone,
    "PAN": item.panNumber
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)
  
  // Set column widths
  const wscols = [
    { wch: 20 }, // Name
    { wch: 8 },  // Rank
    { wch: 15 }, // Agent Code
    { wch: 20 }, // Sponsor Agent Code
    { wch: 28 }, // Login Email
    { wch: 18 }, // Password
    { wch: 15 }, // Phone
    { wch: 15 }  // PAN
  ]
  ws['!cols'] = wscols

  XLSX.utils.book_append_sheet(wb, ws, "Management Hierarchy")
  const xlsxPath = path.resolve('management_hierarchy.xlsx')
  XLSX.writeFile(wb, xlsxPath)
  console.log(`Excel file successfully written to ${xlsxPath}`)

  console.log('--- PRODUCTION HIERARCHY SETUP COMPLETED SUCCESSFULLY ---')
}

run().catch(console.error)
