// ============================================================================
// APEX Cloud Functions (Firebase Functions v2, Node 18+)
// ----------------------------------------------------------------------------
//   • onMonthEnd          — scheduled: calculate every member's earnings
//   • onRankUpdate        — Firestore trigger: promote when BV target crossed
//   • generatePayoutSheet — callable (admin): compile a month's payouts
// ============================================================================

const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')

const {
  calculateEarnings,
  getRankByLevel,
  getNextRank,
  PROMOTION_TARGET,
  buildDynamicTables,
} = require('./compensation')

admin.initializeApp()
const db = admin.firestore()

const REGION = 'asia-south1' // Mumbai

/** Current month key YYYY-MM. */
function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

async function loadOverrides() {
  const snap = await db.doc('config/compensation').get()
  return snap.exists ? snap.data() : {}
}

async function loadRanksList() {
  const snap = await db.doc('config/ranks').get()
  return snap.exists ? snap.data().ranks || [] : []
}

// ----------------------------------------------------------------------------
// onMonthEnd — runs at 23:30 on the last-ish day; recalculates earnings for all
// members for the current month and writes earnings/{uid}/monthly/{YYYY-MM}.
// (Schedule cron set to the 1st 00:30 to finalize the *previous* month.)
// ----------------------------------------------------------------------------
exports.onMonthEnd = onSchedule(
  { schedule: '30 0 1 * *', timeZone: 'Asia/Kolkata', region: REGION },
  async () => {
    const prev = new Date()
    prev.setDate(0) // last day of previous month
    const key = monthKey(prev)
    const overrides = await loadOverrides()
    const ranksList = await loadRanksList()
    const dynamic = ranksList.length > 0 ? buildDynamicTables(ranksList) : null
    const rankByLevelDynamic = dynamic ? dynamic.RANKS.reduce((a, r) => ((a[r.level] = r), a), {}) : null

    const usersSnap = await db.collection('users').get()
    let processed = 0
    const batchLimit = 400
    let batch = db.batch()
    let ops = 0

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data()
      if ((u.status || 'active') !== 'active') continue

      const rank = rankByLevelDynamic ? rankByLevelDynamic[u.rank || 1] : getRankByLevel(u.rank || 1)
      if (!rank) continue

      const earnings = calculateEarnings({
        rankId: rank.id,
        businessVolume: u.businessVolume || 0,
        rdPlan: u.rdPlan || '1Y',
        overrides,
        ranksList,
      })

      const ref = db.doc(`earnings/${userDoc.id}/monthly/${key}`)
      batch.set(
        ref,
        {
          ...earnings,
          businessVolume: u.businessVolume || 0,
          rdPlan: u.rdPlan || '1Y',
          rank: u.rank || 1,
          finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      ops += 1
      processed += 1

      if (ops >= batchLimit) {
        await batch.commit()
        batch = db.batch()
        ops = 0
      }
    }
    if (ops > 0) await batch.commit()

    logger.info(`onMonthEnd: processed ${processed} members for ${key}`)
    return null
  }
)

// ----------------------------------------------------------------------------
// onRankUpdate — when a user's accumulatedVolume/businessVolume changes and
// crosses the next rank's promotion target, auto-promote and log it.
// ----------------------------------------------------------------------------
exports.onRankUpdate = onDocumentWritten(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const after = event.data?.after?.data()
    const before = event.data?.before?.data()
    if (!after) return null

    const ranksList = await loadRanksList()
    const dynamic = ranksList.length > 0 ? buildDynamicTables(ranksList) : null

    const rankByLevelDynamic = dynamic ? dynamic.RANKS.reduce((a, r) => ((a[r.level] = r), a), {}) : null
    const getRankByLevelDynamic = (lvl) => rankByLevelDynamic ? rankByLevelDynamic[lvl] || null : getRankByLevel(lvl)
    const getNextRankDynamic = (lvl) => rankByLevelDynamic ? rankByLevelDynamic[lvl + 1] || null : getNextRank(lvl)
    const promoTargetsDynamic = dynamic ? dynamic.PROMOTION_TARGET : PROMOTION_TARGET

    const currentRank = getRankByLevelDynamic(after.rank || 1)
    if (!currentRank) return null
    const next = getNextRankDynamic(currentRank.level)
    if (!next) return null // already at the top

    const accumulated = after.accumulatedVolume ?? after.businessVolume ?? 0
    const target = promoTargetsDynamic[next.id] || 0

    // Only act when the value actually increased to avoid loops.
    const prevAccumulated = before?.accumulatedVolume ?? before?.businessVolume ?? 0
    if (accumulated <= prevAccumulated) return null

    if (target > 0 && accumulated >= target) {
      const uid = event.params.uid
      await db.doc(`users/${uid}`).update({
        rank: next.level,
        promotedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      await db.collection('users').doc(uid).collection('notifications').add({
        type: 'promotion',
        title: `Promoted to ${next.id}`,
        body: `Congratulations! You reached the target for level ${next.level}.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      })
      logger.info(`onRankUpdate: promoted ${uid} -> L${next.level} (${next.id})`)
    }
    return null
  }
)

// ----------------------------------------------------------------------------
// generatePayoutSheet — callable by admins. Compiles pending payout docs for a
// month from finalized earnings. Returns a summary.
// ----------------------------------------------------------------------------
exports.generatePayoutSheet = onCall({ region: REGION }, async (request) => {
  const role = request.auth?.token?.role
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Admins only.')
  }

  const key = request.data?.month || monthKey()
  const usersSnap = await db.collection('users').get()

  let created = 0
  let totalAmount = 0
  let batch = db.batch()
  let ops = 0

  for (const userDoc of usersSnap.docs) {
    const earnSnap = await db.doc(`earnings/${userDoc.id}/monthly/${key}`).get()
    if (!earnSnap.exists) continue
    const e = earnSnap.data()
    const amount = e.totalEarnings || 0
    if (amount <= 0) continue

    // Skip if a payout for this member+month already exists.
    const existing = await db
      .collection('payouts')
      .where('uid', '==', userDoc.id)
      .where('month', '==', key)
      .limit(1)
      .get()
    if (!existing.empty) continue

    const ref = db.collection('payouts').doc()
    batch.set(ref, {
      uid: userDoc.id,
      memberName: userDoc.data().name || '',
      amount,
      breakdown: {
        MDA: e.MDA || 0,
        FD: e.FD || 0,
        MFA: e.MFA || 0,
        PB: e.PB || 0,
        TA: e.TA || 0,
      },
      status: 'pending',
      month: key,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: null,
    })
    created += 1
    totalAmount += amount
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()

  logger.info(`generatePayoutSheet: ${created} payouts for ${key}, total ${totalAmount}`)
  return { month: key, created, totalAmount }
})
