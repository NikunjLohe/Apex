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
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // firebase auth user
  const [realProfile, setRealProfile] = useState(null) // /users/{uid} doc
  const [adminSession, setAdminSession] = useState(null) // /admin_sessions/{uid} doc
  const [targetProfile, setTargetProfile] = useState(null) // /users/{viewingAs} doc
  
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [targetLoading, setTargetLoading] = useState(false)

  // 1. Listen to Firebase Auth
  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.warn('[AuthContext] Firebase is not configured.')
      setAuthLoading(false)
      return undefined
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) setProfileLoading(true)
      else setProfileLoading(false)
      setAuthLoading(false)
    })
  }, [])

  // 2. Listen to Real Profile and Admin Session
  useEffect(() => {
    if (!user) {
      setRealProfile(null)
      setAdminSession(null)
      setProfileLoading(false)
      return undefined
    }
    setProfileLoading(true)
    
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setRealProfile({ uid: snap.id, ...snap.data() })
        setProfileLoading(false)
      } else {
        setRealProfile(null)
        setProfileLoading(false)
        signOut(auth).catch(console.error)
      }
    }, (error) => {
      console.error('[AuthContext] Profile load failed:', error)
      setRealProfile(null)
      setProfileLoading(false)
      signOut(auth).catch(console.error)
    })

    const unsubSession = onSnapshot(doc(db, 'admin_sessions', user.uid), (snap) => {
      if (snap.exists()) {
        setAdminSession({ id: snap.id, ...snap.data() })
      } else {
        setAdminSession(null)
      }
    }, (error) => {
      console.error('[AuthContext] Admin session load failed:', error)
      setAdminSession(null)
    })

    return () => {
      unsubProfile()
      unsubSession()
    }
  }, [user])

  // 3. Listen to Target Profile if impersonating
  useEffect(() => {
    const viewingAsUid = adminSession?.viewingAs
    if (!viewingAsUid || adminSession?.isReadOnly !== true) {
      setTargetProfile(null)
      setTargetLoading(false)
      return undefined
    }
    
    setTargetLoading(true)
    const unsubTarget = onSnapshot(doc(db, 'users', viewingAsUid), (snap) => {
      if (snap.exists()) {
        setTargetProfile({ uid: snap.id, ...snap.data() })
      } else {
        setTargetProfile(null)
      }
      setTargetLoading(false)
    }, (error) => {
      console.error('[AuthContext] Target profile load failed:', error)
      setTargetProfile(null)
      setTargetLoading(false)
    })

    return () => unsubTarget()
  }, [adminSession])

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

  // --- View As Agent Implementations ---
  const isViewingAs = Boolean(adminSession?.isReadOnly && adminSession?.viewingAs && targetProfile)
  const profile = isViewingAs ? { ...targetProfile, mustChangePassword: false } : realProfile
  
  // For permission calculations, use the effective profile
  const rank = profile?.rank || 0
  const isSuperAdmin = isViewingAs ? false : Boolean(profile?.isSuperAdmin)

  const startViewingAs = useCallback(async (targetAgent) => {
    if (!realProfile?.isSuperAdmin || !user) throw new Error('Only Super Admin can initiate View As Agent')
    const sessionId = `imp_${Date.now()}_${Math.random().toString(36).substring(2,9)}`
    
    // 1. Create session (Firestore Rules validate target)
    await setDoc(doc(db, 'admin_sessions', user.uid), {
      viewingAs: targetAgent.id || targetAgent.uid,
      isReadOnly: true,
      timestamp: serverTimestamp(),
      sessionId
    })

    // 2. Write Audit Log
    try {
      await addDoc(collection(db, 'audit_logs'), {
        type: 'VIEW_AS_AGENT_START',
        adminUid: user.uid,
        adminName: realProfile.name || user.email,
        targetAgentUid: targetAgent.id || targetAgent.uid,
        targetAgentCode: targetAgent.sponsorCode || targetAgent.agentCode || 'UNKNOWN',
        targetAgentName: targetAgent.name || 'Unknown',
        viewSessionId: sessionId,
        viewMode: 'READ_ONLY',
        timestamp: serverTimestamp()
      })
    } catch (err) {
      console.warn('Failed to write audit log for start:', err)
    }
  }, [user, realProfile])

  const stopViewingAs = useCallback(async () => {
    if (!user || !adminSession) return
    const sessionId = adminSession.sessionId || 'unknown'
    const targetUid = adminSession.viewingAs

    // Write audit log BEFORE deleting session, otherwise rules might block the audit log?
    // Actually the audit log rule allows create if type is VIEW_AS_AGENT_EXIT and adminUid matches.
    try {
      await addDoc(collection(db, 'audit_logs'), {
        type: 'VIEW_AS_AGENT_EXIT',
        adminUid: user.uid,
        adminName: realProfile?.name || user.email,
        targetAgentUid: targetUid,
        targetAgentCode: targetProfile?.sponsorCode || 'UNKNOWN',
        targetAgentName: targetProfile?.name || 'Unknown',
        viewSessionId: sessionId,
        viewMode: 'READ_ONLY',
        timestamp: serverTimestamp()
      })
    } catch (err) {
      console.warn('Failed to write audit log for exit:', err)
    }

    // Delete session to restore powers
    await deleteDoc(doc(db, 'admin_sessions', user.uid))
  }, [user, adminSession, realProfile, targetProfile])

  const logDeniedWrite = useCallback(async (action) => {
    if (!user || !isViewingAs || !adminSession) return
    try {
      await addDoc(collection(db, 'audit_logs'), {
        type: 'VIEW_AS_AGENT_DENIED_WRITE',
        adminUid: user.uid,
        adminName: realProfile?.name || user.email,
        targetAgentUid: adminSession.viewingAs,
        targetAgentCode: targetProfile?.sponsorCode || 'UNKNOWN',
        targetAgentName: targetProfile?.name || 'Unknown',
        viewSessionId: adminSession.sessionId || 'unknown',
        viewMode: 'READ_ONLY',
        attemptedAction: action,
        timestamp: serverTimestamp()
      })
    } catch (err) {
      // Must not mask error or throw
      console.warn('Failed to log denied write:', err)
    }
  }, [user, isViewingAs, adminSession, realProfile, targetProfile])

  const value = useMemo(
    () => ({
      user,
      profile, // effective profile
      realProfile, // true profile
      rank,
      isSuperAdmin,
      branchId: profile?.branchId || null,
      isAuthenticated: Boolean(user),
      authLoading,
      profileLoading: profileLoading || targetLoading,
      isConfigured: isFirebaseConfigured,
      loginWithEmail,
      setupRecaptcha,
      sendOtp,
      logout,
      // View As Agent
      isViewingAs,
      startViewingAs,
      stopViewingAs,
      logDeniedWrite
    }),
    [user, profile, realProfile, rank, isSuperAdmin, authLoading, profileLoading, targetLoading, loginWithEmail, setupRecaptcha, sendOtp, logout, isViewingAs, startViewingAs, stopViewingAs, logDeniedWrite]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
