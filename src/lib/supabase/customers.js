// ============================================================================
// APEX Supabase Data Access Layer — Customers Module
// ============================================================================
import { supabase } from './client'
import { normalizeCustomer } from './normalize'

export async function getCustomer(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return normalizeCustomer(data)
}

export async function listCustomers(filters = {}) {
  let query = supabase.from('customers').select('*').order('created_at', { ascending: false })

  if (filters.enrolledBy) query = query.eq('enrolled_by', filters.enrolledBy)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeCustomer)
}

export async function createCustomer(payload) {
  const insertData = {
    customer_id: payload.customerId || payload.accountNumber,
    name: payload.name,
    phone: payload.phone || null,
    email: payload.email || null,
    address: payload.address || null,
    branch_id: payload.branchId || null,
    enrolled_by: payload.enrolledBy,
  }

  const { data, error } = await supabase
    .from('customers')
    .insert([insertData])
    .select()

  if (error) throw error
  return data && data.length > 0 ? normalizeCustomer(data[0]) : null
}

export async function updateCustomer(id, updates) {
  const patchData = {}
  if (updates.name !== undefined) patchData.name = updates.name
  if (updates.phone !== undefined) patchData.phone = updates.phone
  if (updates.email !== undefined) patchData.email = updates.email
  if (updates.address !== undefined) patchData.address = updates.address

  const { data, error } = await supabase
    .from('customers')
    .update(patchData)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data.length > 0 ? normalizeCustomer(data[0]) : null
}
