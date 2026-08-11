/**
 * add_rd5y.cjs
 * ============================================================================
 * Adds RD5Y to:
 *  1. plans_master  (plan catalogue entry)
 *  2. config/commissions  (commission rates — confirmed from business chart)
 *
 * Commission rates verified against official chart totals:
 *   Year 1 total  = 17.10%  ✓
 *   Years 2-5 total =  9.35%  ✓
 *
 * Run: node scripts/add_rd5y.cjs
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

// ── Confirmed Commission Rates (from official chart) ─────────────────────────
//
//  Year 1  (5 YEAR RD PLAN column)  — Total = 17.10%
//  Years 2-5 (2-5 YEAR column)      — Total =  9.35%  (same rate for Y2, Y3, Y4, Y5)

const RD5Y_YEAR1 = {
  AO:  9.00, AM:  3.00, ADM: 1.00, DM:  1.00, SDM: 0.50,
  CM:  0.40, AGM: 0.30, GM:  0.25, ZM:  0.20, ED:  0.20,
  SED: 0.20, MD:  0.15, CMD: 0.15, AVP: 0.15, VP:  0.15,
  SVP: 0.15, EVP: 0.15, MGD: 0.15
}

const RD5Y_YEAR2_5 = {
  AO:  5.00, AM:  1.00, ADM: 0.75, DM:  0.50, SDM: 0.40,
  CM:  0.35, AGM: 0.20, GM:  0.15, ZM:  0.10, ED:  0.10,
  SED: 0.10, MD:  0.10, CMD: 0.10, AVP: 0.10, VP:  0.10,
  SVP: 0.10, EVP: 0.10, MGD: 0.10
}

async function run() {
  console.log('\n=== APEX — Adding RD5Y Plan and Commission ===\n')

  // ── Verify totals match chart ─────────────────────────────────────────────
  const y1Total  = Object.values(RD5Y_YEAR1).reduce((a, b) => a + b, 0)
  const y25Total = Object.values(RD5Y_YEAR2_5).reduce((a, b) => a + b, 0)

  console.log(`Year 1 total:   ${y1Total.toFixed(2)}%  (chart: 17.10%)  ${Math.abs(y1Total - 17.10) < 0.001 ? '✓' : '✗ MISMATCH — ABORT'}`)
  console.log(`Years 2-5 total: ${y25Total.toFixed(2)}%  (chart:  9.35%)  ${Math.abs(y25Total - 9.35) < 0.001 ? '✓' : '✗ MISMATCH — ABORT'}`)

  if (Math.abs(y1Total - 17.10) >= 0.001 || Math.abs(y25Total - 9.35) >= 0.001) {
    console.error('\n❌ Commission totals do not match chart. Aborting without writing.\n')
    process.exit(1)
  }

  // ── 1. Add RD5Y to plans_master ───────────────────────────────────────────
  console.log('\n1. Checking plans_master for existing RD5Y...')
  const pmSnap = await db.collection('plans_master').where('code', '==', 'RD5Y').get()

  if (!pmSnap.empty) {
    console.log('   ⚠  RD5Y already exists in plans_master — skipping insert, patching fields only.')
    await pmSnap.docs[0].ref.set(
      { name: 'RD 5 Year', code: 'RD5Y', duration: 5, type: 'RD', status: 'active', updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    console.log('   ✓ Patched existing plans_master/RD5Y')
  } else {
    const newRef = db.collection('plans_master').doc()
    await newRef.set({
      name: 'RD 5 Year',
      code: 'RD5Y',
      duration: 5,
      type: 'RD',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    })
    console.log('   ✓ Created plans_master/' + newRef.id + ' → RD5Y')
  }

  // ── 2. Merge RD5Y into config/commissions ─────────────────────────────────
  console.log('\n2. Reading current config/commissions...')
  const configRef = db.doc('config/commissions')
  const configSnap = await configRef.get()
  const existing = configSnap.exists ? (configSnap.data().commissions || {}) : {}

  console.log('   Existing plan codes in commission master:', Object.keys(existing).join(', ') || '(none)')

  const updatedCommissions = {
    ...existing,
    RD5Y: {
      1: RD5Y_YEAR1,
      2: RD5Y_YEAR2_5,
      3: RD5Y_YEAR2_5,
      4: RD5Y_YEAR2_5,
      5: RD5Y_YEAR2_5,
    }
  }

  await configRef.set(
    { commissions: updatedCommissions, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  console.log('   ✓ Merged RD5Y commission rates into config/commissions')

  // ── 3. Final read-back verification ──────────────────────────────────────
  console.log('\n3. Verifying write...')
  const verifySnap = await configRef.get()
  const verified = verifySnap.data().commissions?.RD5Y

  if (!verified) {
    console.error('   ❌ RD5Y not found after write. Something went wrong.')
    process.exit(1)
  }

  const readbackY1Total = Object.values(verified[1]).reduce((a, b) => a + b, 0)
  console.log(`   ✓ RD5Y Year 1 read-back total: ${readbackY1Total.toFixed(2)}%`)
  console.log('   ✓ Year keys in Firestore:', Object.keys(verified).join(', '))

  // ── 4. Summary ───────────────────────────────────────────────────────────
  console.log('\n============================================')
  console.log('✅ RD5Y Plan and Commission SUCCESSFULLY ADDED')
  console.log('   Plan Code:      RD5Y')
  console.log('   Plan Name:      RD 5 Year')
  console.log('   Type:           RD')
  console.log('   Duration:       5 Years')
  console.log('   Status:         active')
  console.log(`   Year 1 Total:   ${y1Total.toFixed(2)}%`)
  console.log(`   Years 2-5 Total: ${y25Total.toFixed(2)}%`)
  console.log('   No existing plans, customers, or policies were modified.')
  console.log('============================================\n')

  process.exit(0)
}

run().catch((e) => {
  console.error('\n❌ Script failed:', e.message)
  process.exit(1)
})
