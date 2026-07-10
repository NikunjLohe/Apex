// ============================================================================
// Admin operations: member + branch management.
// Members are created via a *secondary* Firebase app so the admin's own auth
// session is not replaced when provisioning a new account.
// ============================================================================
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp, runTransaction, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { updateDashboardSummary } from './summary'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

function secondaryAuth() {
  const name = 'apex-secondary'
  const app = getApps().find((a) => a.name === name) || initializeApp(firebaseConfig, name)
  return getAuth(app)
}

/**
 * Create a member: a Firebase Auth account (temp password) + /users/{uid} doc.
 * Enforces backend transaction and strict unique checks for PAN, Phone, and Email.
 * Auto-generates unique sequential Agent Codes (e.g. KB000001) and emails.
 */
export async function createMember(form, tempPassword) {
  const cleanForm = { ...form }

  // 1. Backend Uniqueness check for PAN Number (if provided)
  if (cleanForm.panNumber) {
    const panClean = cleanForm.panNumber.trim().toUpperCase()
    const panSnap = await getDocs(query(collection(db, 'users'), where('panNumber', '==', panClean)))
    if (!panSnap.empty) {
      throw new Error(`PAN Number "${panClean}" is already registered to another agent.`)
    }
    cleanForm.panNumber = panClean
  }

  // 2. Backend Uniqueness check for Phone Number
  const phoneClean = cleanForm.phone.trim()
  const phoneSnap = await getDocs(query(collection(db, 'users'), where('phone', '==', phoneClean)))
  if (!phoneSnap.empty) {
    throw new Error(`Phone number "${phoneClean}" is already registered to another agent.`)
  }
  cleanForm.phone = phoneClean

  // 3. Rank restriction checks (Sponsor hierarchy)
  if (cleanForm.referredBy) {
    const sponsorSnap = await getDoc(doc(db, 'users', cleanForm.referredBy))
    if (sponsorSnap.exists()) {
      const sponsorRank = Number(sponsorSnap.data().rank || 1)
      const recruitRank = Number(cleanForm.rank)
      if (recruitRank >= sponsorRank) {
        throw new Error(`Recruitment rank violation: Sponsor at Rank ${sponsorRank} cannot recruit an agent at Rank ${recruitRank}.`)
      }
    }
  }

  // 4. Retrieve settings for Prefix and Domain
  const settingsSnap = await getDoc(doc(db, 'config', 'settings'))
  const settings = settingsSnap.exists() ? settingsSnap.data() : {}
  const prefix = settings.agentPrefix || 'KB'
  const domain = settings.agentEmailDomain || 'apex.local'

  // 5. Transaction-safe Agent Code generation using counters/agents
  const counterRef = doc(db, 'counters', 'agents')
  let nextSeq = 1

  // If counter doesn't exist, calculate initial sequence from highest number across all existing agents
  const counterSnap = await getDoc(counterRef)
  if (!counterSnap.exists()) {
    const usersSnap = await getDocs(collection(db, 'users'))
    let maxNum = 0
    usersSnap.forEach(d => {
      const u = d.data()
      if (u.sponsorCode) {
        const numStr = u.sponsorCode.replace(/^[A-Z]+/i, '')
        const num = parseInt(numStr, 10)
        if (!isNaN(num) && num > maxNum) {
          maxNum = num
        }
      }
    })
    nextSeq = maxNum + 1
  }

  let sponsorCode = ''
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    let seq = nextSeq
    if (snap.exists()) {
      seq = (snap.data().seq || 0) + 1
    }
    tx.set(counterRef, { seq }, { merge: true })
    sponsorCode = `${prefix}${String(seq).padStart(6, '0')}`
  })

  cleanForm.sponsorCode = sponsorCode

  // 6. Generate dynamic email if not explicitly provided
  if (!cleanForm.email || !cleanForm.email.trim()) {
    cleanForm.email = `${sponsorCode.toLowerCase()}@${domain}`
  } else {
    cleanForm.email = cleanForm.email.trim().toLowerCase()
  }

  // 7. Backend Uniqueness check for Email Address
  const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanForm.email)))
  if (!emailSnap.empty) {
    throw new Error(`Email address "${cleanForm.email}" is already registered.`)
  }

  // 8. Create Firebase Auth user
  const auth2 = secondaryAuth()
  const cred = await createUserWithEmailAndPassword(auth2, cleanForm.email, tempPassword)
  const uid = cred.user.uid

  // 9. Write the User document
  try {
    await setDoc(doc(db, 'users', uid), {
      name: cleanForm.name,
      email: cleanForm.email,
      phone: cleanForm.phone,
      rank: Number(cleanForm.rank),
      isSuperAdmin: Boolean(cleanForm.isSuperAdmin),
      branchId: cleanForm.branchId || null,
      status: cleanForm.status || 'active',
      sponsorCode: cleanForm.sponsorCode,
      referredBy: cleanForm.referredBy || null,
      mustChangePassword: true,
      panNumber: cleanForm.panNumber || '',
      address: cleanForm.address || '',
      dob: cleanForm.dob || '',
      joinDate: serverTimestamp(),
      createdAt: serverTimestamp(),
    })

    await signOut(auth2)
    await updateDashboardSummary({ totalAgents: 1, activeAgents: 1 })
    return { uid, sponsorCode }
  } catch (error) {
    // Attempt rollback of authentication user
    try {
      await cred.user.delete()
    } catch (cleanupErr) {
      console.error('Failed to clean up Firebase Auth user:', cleanupErr)
    }
    throw error
  }
}

export function updateMember(uid, data) {
  // Disallow email and sponsorCode modifications during updates to preserve integrity
  const cleanData = { ...data }
  delete cleanData.email
  delete cleanData.sponsorCode

  return updateDoc(doc(db, 'users', uid), {
    ...cleanData,
    ...(cleanData.rank != null ? { rank: Number(cleanData.rank) } : {}),
    updatedAt: serverTimestamp(),
  })
}

export async function createBranch(form, existingBranches = []) {
  const ref = doc(collection(db, 'branches'))
  let maxId = 0
  existingBranches.forEach(b => {
    if (b.branchCode) {
      const numStr = b.branchCode.replace(/^[A-Z]+/i, '')
      const num = parseInt(numStr, 10)
      if (!isNaN(num) && num > maxId) {
        maxId = num
      }
    }
  })
  const nextId = maxId + 1
  const branchCode = `BR${String(nextId).padStart(6, '0')}`

  await setDoc(ref, {
    ...form,
    branchCode,
    status: form.status || 'active',
    createdAt: serverTimestamp(),
  })
  await updateDashboardSummary({ totalBranches: 1 })
  return { id: ref.id, branchCode }
}

export function updateBranch(id, data) {
  return updateDoc(doc(db, 'branches', id), { ...data, updatedAt: serverTimestamp() })
}

/** Best-effort cleanup of the secondary app (optional). */
export async function disposeSecondary() {
  const name = 'apex-secondary'
  if (getApps().some((a) => a.name === name)) await deleteApp(getApp(name))
}
