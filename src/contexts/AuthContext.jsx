// ============================================================================
// AuthContext — Supabase session, profile stream, role/permission state, auth actions.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { getProfile } from '../lib/supabase/profiles'
import { getAdminSession, startViewAsAgent as dalStartViewAs, exitViewAsAgent as dalExitViewAs } from '../lib/supabase/adminSessions'
import { logAuditEvent } from '../lib/supabase/audit'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null) // supabase auth user
  const [realProfile, setRealProfile] = useState(null) // public.profiles row
  const [adminSession, setAdminSession] = useState(null) // public.admin_sessions row
  const [targetProfile, setTargetProfile] = useState(null) // public.profiles row for viewingAs
  
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [targetLoading, setTargetLoading] = useState(false)

  // 1. Listen to Supabase Auth State Changes
  useEffect(() => {
    let mounted = true

    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!mounted) return
      setSession(initSession)
      setUser(initSession?.user || null)
      setAuthLoading(false)
    }).catch(err => {
      console.error('[AuthContext] Initial getSession error:', err)
      if (mounted) setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user || null)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  // Helper to fetch user profile and admin session
  const fetchUserProfile = useCallback(async (userId) => {
    try {
      setProfileLoading(true)
      const prof = await getProfile(userId)
      setRealProfile(prof)

      const sess = await getAdminSession(userId).catch(() => null)
      setAdminSession(sess)
    } catch (err) {
      console.error('[AuthContext] Profile load failed:', err)
      setRealProfile(null)
      setAdminSession(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  // 2. Fetch Real Profile and Admin Session on User Change
  useEffect(() => {
    if (!user) {
      setRealProfile(null)
      setAdminSession(null)
      setProfileLoading(false)
      return undefined
    }

    fetchUserProfile(user.id)

    // Set up realtime subscription for profile changes
    const profileSub = supabase
      .channel(`public:profiles:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`
      }, () => {
        fetchUserProfile(user.id)
      })
      .subscribe()

    // Set up realtime subscription for admin_sessions changes
    const sessionSub = supabase
      .channel(`public:admin_sessions:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'admin_sessions',
        filter: `admin_id=eq.${user.id}`
      }, () => {
        fetchUserProfile(user.id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(profileSub)
      supabase.removeChannel(sessionSub)
    }
  }, [user, fetchUserProfile])

  // 3. Fetch Target Profile if impersonating (View As Agent)
  useEffect(() => {
    const viewingAsId = adminSession?.viewing_as_id || adminSession?.viewingAs
    if (!viewingAsId || adminSession?.is_read_only === false) {
      setTargetProfile(null)
      setTargetLoading(false)
      return undefined
    }
    
    setTargetLoading(true)
    getProfile(viewingAsId).then(p => {
      setTargetProfile(p)
      setTargetLoading(false)
    }).catch(err => {
      console.error('[AuthContext] Target profile load failed:', err)
      setTargetProfile(null)
      setTargetLoading(false)
    })
  }, [adminSession])

  const loginWithEmail = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }, [])

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[AuthContext] SignOut error:', error)
    setUser(null)
    setSession(null)
    setRealProfile(null)
    setAdminSession(null)
    setTargetProfile(null)
  }, [])

  // --- View As Agent Implementations ---
  const isViewingAs = Boolean(adminSession?.is_read_only && (adminSession?.viewing_as_id || adminSession?.viewingAs) && targetProfile)
  const profile = isViewingAs ? { ...targetProfile, mustChangePassword: false } : realProfile
  
  // For permission calculations, use the effective profile
  const rank = profile?.rank || 0
  const isSuperAdmin = isViewingAs ? false : Boolean(profile?.isSuperAdmin)

  const startViewingAs = useCallback(async (targetAgent) => {
    if (!realProfile?.isSuperAdmin || !user) throw new Error('Only Super Admin can initiate View As Agent')
    const targetId = targetAgent.id || targetAgent.uid
    const sessionId = `imp_${Date.now()}_${Math.random().toString(36).substring(2,9)}`
    
    await dalStartViewAs(user.id, targetId, sessionId)
    const updatedSess = await getAdminSession(user.id).catch(() => null)
    setAdminSession(updatedSess)

    // Write Audit Log
    try {
      await logAuditEvent({
        type: 'VIEW_AS_AGENT_START',
        performedBy: user.id,
        performedByEmail: user.email,
        targetUid: targetId,
        targetAgentCode: targetAgent.sponsorCode || targetAgent.agentCode || 'UNKNOWN',
        targetAgentName: targetAgent.name || 'Unknown',
        viewSessionId: sessionId,
        viewMode: 'READ_ONLY',
      })
    } catch (err) {
      console.warn('Failed to write audit log for start:', err)
    }
  }, [user, realProfile])

  const stopViewingAs = useCallback(async () => {
    if (!user || !adminSession) return
    const sessionId = adminSession.session_id || adminSession.sessionId || 'unknown'
    const targetUid = adminSession.viewing_as_id || adminSession.viewingAs

    try {
      await logAuditEvent({
        type: 'VIEW_AS_AGENT_EXIT',
        performedBy: user.id,
        performedByEmail: user.email,
        targetUid,
        targetAgentCode: targetProfile?.sponsorCode || 'UNKNOWN',
        targetAgentName: targetProfile?.name || 'Unknown',
        viewSessionId: sessionId,
        viewMode: 'READ_ONLY',
      })
    } catch (err) {
      console.warn('Failed to write audit log for exit:', err)
    }

    await dalExitViewAs(user.id)
    setAdminSession(null)
    setTargetProfile(null)
  }, [user, adminSession, targetProfile])

  const logDeniedWrite = useCallback(async (action) => {
    if (!user || !isViewingAs || !adminSession) return
    try {
      await logAuditEvent({
        type: 'VIEW_AS_AGENT_DENIED_WRITE',
        performedBy: user.id,
        performedByEmail: user.email,
        targetUid: adminSession.viewing_as_id || adminSession.viewingAs,
        targetAgentCode: targetProfile?.sponsorCode || 'UNKNOWN',
        targetAgentName: targetProfile?.name || 'Unknown',
        viewSessionId: adminSession.session_id || adminSession.sessionId || 'unknown',
        viewMode: 'READ_ONLY',
        reason: `Attempted action: ${action}`,
      })
    } catch (err) {
      console.warn('Failed to log denied write:', err)
    }
  }, [user, isViewingAs, adminSession, targetProfile])

  const value = useMemo(
    () => ({
      session,
      user,
      profile, // effective profile
      realProfile, // true profile
      rank,
      isSuperAdmin,
      branchId: profile?.branchId || null,
      isAuthenticated: Boolean(user && session),
      authLoading,
      profileLoading: profileLoading || targetLoading,
      isConfigured: true,
      loginWithEmail,
      setupRecaptcha: () => null,
      sendOtp: () => { throw new Error('OTP is not supported in Supabase mode') },
      logout,
      // View As Agent
      isViewingAs,
      startViewingAs,
      stopViewingAs,
      logDeniedWrite
    }),
    [session, user, profile, realProfile, rank, isSuperAdmin, authLoading, profileLoading, targetLoading, loginWithEmail, logout, isViewingAs, startViewingAs, stopViewingAs, logDeniedWrite]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext

