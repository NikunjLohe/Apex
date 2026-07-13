/* ===========================================================================
 * APEX – Production Database Reset (No Backup)
 * Run: node scripts/production_reset.cjs
 * =========================================================================== */

const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth }              = require('firebase-admin/auth')
const { getFirestore }         = require('firebase-admin/firestore')
const path     = require('path')
const fs       = require('fs')
const readline = require('readline')

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json')
if (!fs.existsSync(keyPath)) {
  console.error('\nERROR: serviceAccountKey.json not found in project root.')
  console.error('Firebase Console -> Project Settings -> Service accounts')
  console.error('-> Generate new private key -> save as serviceAccountKey.json\n')
  process.exit(1)
}

const serviceAccount = require(keyPath)
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db   = getFirestore()

const TRANSACTIONAL_COLLECTIONS = [
  'customers', 'plans', 'payments', 'receipts',
  'commission_ledger', 'payouts', 'notifications', 'imports',
]

const COUNTERS_TO_RESET = [
  { doc: 'agents',    field: 'seq',   value: 0 },
  { doc: 'customers', field: 'value', value: 0 },
  { doc: 'plans',     field: 'value', value: 0 },
  { doc: 'receipts',  field: 'value', value: 0 },
]

async function deleteCollection(colName) {
  let deleted = 0
  let snap
  do {
    snap = await db.collection(colName).limit(400).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    deleted += snap.size
  } while (!snap.empty)
  return deleted
}

async function getSuperAdminUids() {
  console.log('\n[1] Identifying Super Admin...')
  const snap = await db.collection('users').where('isSuperAdmin', '==', true).get()
  if (snap.empty) throw new Error('No super admin found! Aborting to prevent total wipe.')
  const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  admins.forEach(a => console.log('    PROTECTED: ' + a.name + ' <' + a.email + '>'))
  return admins.map(a => a.id)
}

async function deleteAgentDocs(superAdminUids) {
  console.log('\n[2] Deleting agent Firestore docs...')
  const snap = await db.collection('users').get()
  const toDelete = snap.docs.filter(d => !superAdminUids.includes(d.id))
  if (toDelete.length === 0) { console.log('    (none found)'); return [] }
  let i = 0
  while (i < toDelete.length) {
    const batch = db.batch()
    toDelete.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
    i += 400
  }
  console.log('    Deleted ' + toDelete.length + ' agent docs')
  return toDelete.map(d => d.id)
}

async function deleteAuthUsers(uids) {
  console.log('\n[3] Deleting Firebase Auth accounts...')
  if (uids.length === 0) { console.log('    (none found)'); return }
  let deleted = 0
  let i = 0
  while (i < uids.length) {
    const result = await auth.deleteUsers(uids.slice(i, i + 1000))
    deleted += result.successCount
    result.errors.forEach(e => console.warn('    WARNING: ' + uids[i + e.index] + ': ' + e.error.message))
    i += 1000
  }
  console.log('    Deleted ' + deleted + ' Auth accounts')
}

async function deleteTransactional() {
  console.log('\n[4] Deleting transactional data...')
  for (const col of TRANSACTIONAL_COLLECTIONS) {
    process.stdout.write('    ' + col + '...')
    const count = await deleteCollection(col)
    console.log(' ' + count + ' deleted')
  }
}

async function resetCounters() {
  console.log('\n[5] Resetting counters...')
  for (const c of COUNTERS_TO_RESET) {
    await db.doc('counters/' + c.doc).set({ [c.field]: c.value })
    console.log('    counters/' + c.doc + ' -> ' + c.field + ' = ' + c.value)
  }
}

async function verify() {
  console.log('\n[6] Verifying...')
  const usersSnap = await db.collection('users').get()
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const superAdmins = users.filter(u => u.isSuperAdmin)
  const agents = users.filter(u => !u.isSuperAdmin)
  console.log('    Super Admins : ' + superAdmins.length + (superAdmins.length === 1 ? ' PASS' : ' FAIL'))
  console.log('    Agents left  : ' + agents.length + (agents.length === 0 ? ' PASS' : ' FAIL'))

  const results = {}
  for (const col of TRANSACTIONAL_COLLECTIONS) {
    const snap = await db.collection(col).get()
    results[col] = snap.size
    console.log('    ' + col.padEnd(22) + ': ' + snap.size + (snap.size === 0 ? ' PASS' : ' FAIL'))
  }

  const agentCounterSnap = await db.doc('counters/agents').get()
  const agentSeq = agentCounterSnap.exists ? agentCounterSnap.data().seq : 'MISSING'
  console.log('    counters/agents.seq  = ' + agentSeq + (agentSeq === 0 ? ' PASS' : ' FAIL'))

  const settingsSnap = await db.doc('config/settings').get()
  const prefix = settingsSnap.exists ? (settingsSnap.data().agentPrefix || 'KB') : 'KB'
  const firstCode = prefix + String(1).padStart(6, '0')
  console.log('    Next agent code      = ' + firstCode)

  const allClear = superAdmins.length === 1 && agents.length === 0 &&
    Object.values(results).every(v => v === 0) && agentSeq === 0

  console.log('\n    ============================')
  console.log('    FINAL RESULT: ' + (allClear ? 'PASS' : 'FAIL'))
  console.log('    ============================')

  // Save report
  const report = {
    resetAt: new Date().toISOString(),
    status: allClear ? 'PASS' : 'FAIL',
    remainingUsers: superAdmins.map(u => ({ uid: u.id, name: u.name, email: u.email })),
    agentCount: agents.length,
    counterValues: { 'counters/agents.seq': agentSeq },
    collectionCounts: results,
    firstGeneratedAgentCode: firstCode,
  }
  const reportPath = path.resolve(__dirname, '..', 'production_reset_report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log('    Report saved -> production_reset_report.json')

  return allClear
}

async function main() {
  console.log('\nAPEX Production Database Reset')
  console.log('Project: ' + serviceAccount.project_id)
  console.log('WARNING: Permanently deletes ALL demo agents, customers, policies, payments, payouts.\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise(resolve => {
    rl.question('Type CONFIRM to proceed: ', answer => {
      rl.close()
      if (answer.trim() !== 'CONFIRM') {
        console.log('\nAborted. Nothing changed.\n')
        process.exit(0)
      }
      resolve()
    })
  })

  try {
    const superAdminUids = await getSuperAdminUids()
    const agentUids = await deleteAgentDocs(superAdminUids)
    await deleteAuthUsers(agentUids)
    await deleteTransactional()
    await resetCounters()
    const passed = await verify()
    console.log('\n' + (passed ? 'Production reset complete!' : 'Reset finished with errors - check report.') + '\n')
  } catch (err) {
    console.error('\nReset FAILED: ' + err.message)
    process.exit(1)
  }

  process.exit(0)
}

main()
