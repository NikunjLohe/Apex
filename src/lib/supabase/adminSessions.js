// ============================================================================
// APEX Supabase Data Access Layer — Admin Sessions Module (View As Agent)
// ============================================================================
import { supabase } from './client'

export async function getAdminSession(adminId) {
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('admin_id', adminId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function startViewAsAgent(adminId, targetAgentId, sessionId, expiresAt) {
  const payload = {
    admin_id: adminId,
    viewing_as_id: targetAgentId,
    is_read_only: true,
    session_id: sessionId || `SESS_${Date.now()}`,
    expires_at: expiresAt || new Date(Date.now() + 3600000).toISOString(),
  }

  const { data, error } = await supabase
    .from('admin_sessions')
    .upsert([payload])
    .select()

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

export async function exitViewAsAgent(adminId) {
  const { error } = await supabase
    .from('admin_sessions')
    .delete()
    .eq('admin_id', adminId)

  if (error) throw error
}

export async function checkImpersonating() {
  const { data, error } = await supabase.rpc('is_impersonating')
  if (error) throw error
  return !!data
}
