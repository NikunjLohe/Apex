// ============================================================================
// APEX Supabase Data Access Layer — Audit Logs Module
// ============================================================================
import { supabase } from './client'

export async function listAuditLogs(limit = 100) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * logAuditEvent()
 * Audit log insertion is restricted. If direct insert fails under RLS, handles error safely.
 */
export async function logAuditEvent(eventData) {
  const { data, error } = await supabase
    .from('audit_logs')
    .insert([{
      type: eventData.type,
      action: eventData.action,
      performed_by: eventData.performedBy || null,
      performed_by_email: eventData.performedByEmail || null,
      target_uid: eventData.targetUid || null,
      target_agent_code: eventData.targetAgentCode || null,
      target_agent_name: eventData.targetAgentName || null,
      old_values: eventData.oldValues || null,
      new_values: eventData.newValues || null,
      reason: eventData.reason || null,
      success: eventData.success !== false,
      view_mode: eventData.viewMode || null,
      view_session_id: eventData.viewSessionId || null,
    }])

  if (error) {
    console.warn('[Audit Log] Direct insert rejected or restricted by policy:', error.message)
    return null
  }
  return data
}

export async function logAction(action, details = {}) {
  return logAuditEvent({
    type: action,
    action: action,
    reason: typeof details === 'string' ? details : JSON.stringify(details),
  })
}

