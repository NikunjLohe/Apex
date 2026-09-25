/**
 * create_historical_adjustments.cjs
 * ============================================================================
 * Creates supplementary gap commission adjustments for the 2 historical client policies.
 * 
 * Policy 1 (ACN 0206200000001 - RD1Y): +₹62.50 (6.25%)
 * Policy 2 (ACN 0206200000002 - RD5Y): +₹420.00 (14.00%)
 * 
 * Rules:
 * - Leaves original entries XAmw4HrpA428D1Nvz0z0 and kOAh2O8CT4LBHE4U7kpL untouched.
 * - Prevents duplicate adjustment entries.
 * - Sets commissionType: "adjustment", status: "unpaid".
 * ============================================================================
 */

const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const path = require('path')
const fs = require('fs')

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json')
if (!fs.existsSync(keyPath)) {
  console.error('\n❌ serviceAccountKey.json not found in project root.\n')
  process.exit(1)
}

const serviceAccount = require(keyPath)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function run() {
  console.log('\n=== CREATING HISTORICAL GAP COMMISSION ADJUSTMENTS ===\n')

  // 1. Check for existing adjustments to prevent duplicates
  const existingAdjSnap = await db.collection('commission_ledger')
    .where('commissionType', '==', 'adjustment')
    .get()

  if (existingAdjSnap.size > 0) {
    console.log(`⚠️ Found ${existingAdjSnap.size} existing adjustment entry/entries. Checking details...`)
    existingAdjSnap.forEach(d => console.log('   Doc ID:', d.id, '| Policy:', d.data().policyNumber, '| Amt: ₹' + d.data().amount))
  }

  // Define Policy 1 Adjustment Data
  const p1AdjData = {
    agentId: 'ME8uYwDVAeUqqHniwxU29wXZdv53',
    agentName: 'Dinesh Kashinath Barve',
    sponsorCode: 'KB000011',
    receivingRank: 5,
    receivingRankCode: 'SDM',
    customerId: 'xLDalMKr1g8gnyaEQyky',
    customerName: 'BARVE DINESH KASHINATH',
    customerAccount: '20902',
    policyId: '9yWUiQV4Ri4zxQruVyMN',
    policyNumber: 'ACN 0206200000001',
    planCode: 'RD1Y',
    planType: 'RD',
    policyYear: 1,
    installment: 1,
    businessAmount: 1000,
    percentage: 6.25,
    amount: 62.50,
    originalRank: 5,
    originalAgentId: 'ME8uYwDVAeUqqHniwxU29wXZdv53',
    commissionType: 'adjustment',
    compression: true,
    compressionReason: 'Gap Commission Adjustment (AO+AM+ADM+DM Vacant Lower Ranks)',
    compressedFromRank: [1, 2, 3, 4],
    month: 7,
    year: 2026,
    status: 'unpaid',
    calculationDate: FieldValue.serverTimestamp(),
  }

  // Define Policy 2 Adjustment Data
  const p2AdjData = {
    agentId: 'ME8uYwDVAeUqqHniwxU29wXZdv53',
    agentName: 'Dinesh Kashinath Barve',
    sponsorCode: 'KB000011',
    receivingRank: 5,
    receivingRankCode: 'SDM',
    customerId: 't0qRiPAadoRbKqfmek8q',
    customerName: 'VARSHA SIDDHARTH KAMBLE',
    customerAccount: '21002',
    policyId: 'LXZXEyGvGNR5PILEr64T',
    policyNumber: 'ACN 0206200000002',
    planCode: 'RD5Y',
    planType: 'RD',
    policyYear: 1,
    installment: 1,
    businessAmount: 3000,
    percentage: 14.00,
    amount: 420.00,
    originalRank: 5,
    originalAgentId: 'ME8uYwDVAeUqqHniwxU29wXZdv53',
    commissionType: 'adjustment',
    compression: true,
    compressionReason: 'Gap Commission Adjustment (AO+AM+ADM+DM Vacant Lower Ranks)',
    compressedFromRank: [1, 2, 3, 4],
    month: 7,
    year: 2026,
    status: 'unpaid',
    calculationDate: FieldValue.serverTimestamp(),
  }

  let p1DocId = null
  let p2DocId = null

  // Create Policy 1 Adjustment if not existing
  const p1Existing = existingAdjSnap.docs.find(d => d.data().policyNumber === 'ACN 0206200000001')
  if (p1Existing) {
    console.log('  ℹ Policy 1 Adjustment already exists:', p1Existing.id)
    p1DocId = p1Existing.id
  } else {
    const ref1 = db.collection('commission_ledger').doc()
    await ref1.set(p1AdjData)
    p1DocId = ref1.id
    console.log('  ✓ Created Policy 1 Adjustment:', p1DocId, '-> ₹62.50')
  }

  // Create Policy 2 Adjustment if not existing
  const p2Existing = existingAdjSnap.docs.find(d => d.data().policyNumber === 'ACN 0206200000002')
  if (p2Existing) {
    console.log('  ℹ Policy 2 Adjustment already exists:', p2Existing.id)
    p2DocId = p2Existing.id
  } else {
    const ref2 = db.collection('commission_ledger').doc()
    await ref2.set(p2AdjData)
    p2DocId = ref2.id
    console.log('  ✓ Created Policy 2 Adjustment:', p2DocId, '-> ₹420.00')
  }

  console.log('\n=== CREATION FINISHED ===')
  console.log('Policy 1 Adjustment ID:', p1DocId)
  console.log('Policy 2 Adjustment ID:', p2DocId)

  process.exit(0)
}

run().catch(e => {
  console.error('\n❌ Error creating adjustments:', e)
  process.exit(1)
})
