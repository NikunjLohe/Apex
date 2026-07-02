// ============================================================================
// Admin operations: member + branch management.
// Members are created via a *secondary* Firebase app so the admin's own auth
// session is not replaced when provisioning a new account.
// ============================================================================
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

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
 * Returns { uid }.
 */
export async function createMember(form, tempPassword) {
  const auth2 = secondaryAuth()
  const cred = await createUserWithEmailAndPassword(auth2, form.email, tempPassword)
  const uid = cred.user.uid
  await setDoc(doc(db, 'users', uid), {
    name: form.name,
    email: form.email,
    phone: form.phone,
    rank: Number(form.rank),
    isSuperAdmin: Boolean(form.isSuperAdmin),
    branchId: form.branchId || null,
    status: form.status || 'active',
    sponsorCode: form.sponsorCode || '',
    referredBy: form.referredBy || null,
    mustChangePassword: true,
    joinDate: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
  await signOut(auth2)
  return { uid }
}

export function updateMember(uid, data) {
  return updateDoc(doc(db, 'users', uid), {
    ...data,
    ...(data.rank != null ? { rank: Number(data.rank) } : {}),
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
