// ============================================================================
// AuthContext — session, profile stream, role/permission state, auth actions.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // firebase auth user
  const [profile, setProfile] = useState(null) // /users/{uid} doc
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.warn('[AuthContext] Firebase is not configured.')
      setAuthLoading(false)
      return undefined
    }
    console.log('[AuthContext] Initializing Firebase Auth observer...')
    return onAuthStateChanged(auth, (u) => {
      console.log('[AuthContext] Firebase Auth state changed. User UID:', u?.uid || 'NONE')
      setUser(u)
      if (u) {
        setProfileLoading(true)
      } else {
        setProfileLoading(false)
      }
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) {
      console.log('[AuthContext] No authenticated user. Clearing profile.')
      setProfile(null)
      setProfileLoading(false)
      return undefined
    }
    console.log('[AuthContext] Fetching profile from Firestore for UID:', user.uid)
    setProfileLoading(true)
    const ref = doc(db, 'users', user.uid)
    return onSnapshot(
      ref,
      (snap) => {
        console.log('[AuthContext] Profile snapshot received. Exists:', snap.exists())
        if (snap.exists()) {
          setProfile({ uid: snap.id, ...snap.data() })
          setProfileLoading(false)
        } else {
          console.warn('[AuthContext] Profile document missing in Firestore. Triggering self-healing signout...')
          setProfile(null)
          setProfileLoading(false)
          signOut(auth).catch(err => console.error('[AuthContext] Self-healing signout failed:', err))
        }
      },
      (error) => {
        console.error('[AuthContext] Error listening to profile snapshot:', error)
        setProfile(null)
        setProfileLoading(false)
        console.warn('[AuthContext] Profile load failed. Triggering self-healing signout to clear dead session...')
        signOut(auth).catch(err => console.error('[AuthContext] Self-healing signout failed:', err))
      }
    )
  }, [user])

  const loginWithEmail = useCallback(async (email, password, remember = true) => {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    return signInWithEmailAndPassword(auth, email, password)
  }, [])

  const setupRecaptcha = useCallback((containerId) => {
    if (window.__recaptcha) return window.__recaptcha
    const v = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
    window.__recaptcha = v
    return v
  }, [])

  const sendOtp = useCallback((phoneE164, verifier) => signInWithPhoneNumber(auth, phoneE164, verifier), [])

  const logout = useCallback(() => signOut(auth), [])

  const rank = profile?.rank || 0
  const isSuperAdmin = Boolean(profile?.isSuperAdmin)

  const value = useMemo(
    () => ({
      user,
      profile,
      rank,
      isSuperAdmin,
      branchId: profile?.branchId || null,
      isAuthenticated: Boolean(user),
      authLoading,
      profileLoading,
      isConfigured: isFirebaseConfigured,
      loginWithEmail,
      setupRecaptcha,
      sendOtp,
      logout,
    }),
    [user, profile, rank, isSuperAdmin, authLoading, profileLoading, loginWithEmail, setupRecaptcha, sendOtp, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
