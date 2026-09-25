// ============================================================================
// APEX Supabase Data Access Layer — Profiles Module
// ============================================================================
import { supabase } from './client'
import { normalizeProfile } from './normalize'

export async function getProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Row not found
    throw error
  }
  return normalizeProfile(data)
}

export async function getCurrentProfile() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return null
  return getProfile(user.id)
}

export async function listProfiles(filters = {}) {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })

  if (filters.sponsorId) query = query.eq('sponsor_id', filters.sponsorId)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.rank) query = query.eq('rank', filters.rank)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.role) query = query.eq('role', filters.role)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeProfile)
}

export async function updateAllowedProfileFields(id, updates) {
  // Restrict to allowed non-privileged fields
  const allowed = {}
  if (updates.name !== undefined) allowed.name = updates.name
  if (updates.phone !== undefined) allowed.phone = updates.phone
  if (updates.panNumber !== undefined) allowed.pan_number = updates.panNumber
  if (updates.bankDetails !== undefined) allowed.bank_details = updates.bankDetails

  const { data, error } = await supabase
    .from('profiles')
    .update(allowed)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data.length > 0 ? normalizeProfile(data[0]) : null
}

export async function getDownline(agentId) {
  const { data, error } = await supabase
    .rpc('get_downline', { p_agent_id: agentId })

  if (error) {
    // Fallback if RPC get_downline is not present: query profiles where sponsor_id chain or list profiles
    const { data: list, error: err2 } = await supabase
      .from('profiles')
      .select('*')
    if (err2) throw error
    // Client-side downline traversal fallback
    const all = (list || []).map(normalizeProfile)
    const downlineMap = new Map()
    const queue = [agentId]
    const visited = new Set([agentId])

    while (queue.length > 0) {
      const parentId = queue.shift()
      const children = all.filter(p => p.sponsorId === parentId)
      children.forEach(c => {
        if (!visited.has(c.id)) {
          visited.add(c.id)
          downlineMap.set(c.id, c)
          queue.push(c.id)
        }
      })
    }
    return Array.from(downlineMap.values())
  }

  return (data || []).map(normalizeProfile)
}

export async function updateProfile(id, updates) {
  const patch = {}
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.phone !== undefined) patch.phone = updates.phone
  if (updates.rank !== undefined) patch.rank = updates.rank
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.branchId !== undefined) patch.branch_id = updates.branchId
  if (updates.panNumber !== undefined) patch.pan_number = updates.panNumber
  if (updates.bankDetails !== undefined) patch.bank_details = updates.bankDetails

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data.length > 0 ? normalizeProfile(data[0]) : null
}

