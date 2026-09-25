// ============================================================================
// APEX Supabase Data Access Layer — Master Data Module (Plans, Commissions & Branches)
// ============================================================================
import { supabase } from './client'

export async function getPlansMaster() {
  const { data, error } = await supabase
    .from('plans_master')
    .select('*')
    .order('code', { ascending: true })

  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    duration: p.duration !== undefined ? p.duration : Math.round((p.duration_months || 12) / 12),
    durationMonths: p.duration_months,
    status: p.status || (p.is_active ? 'active' : 'inactive'),
    minAmount: p.min_amount,
    interestRate: p.interest_rate,
  }))
}

export async function listBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createBranch(payload) {
  // Generate branch code if not provided
  let branchCode = payload.branchCode
  if (!branchCode) {
    const { data: existing } = await supabase.from('branches').select('code')
    let maxId = 0
    ;(existing || []).forEach(b => {
      if (b.code) {
        const numStr = b.code.replace(/^[A-Z]+/i, '')
        const num = parseInt(numStr, 10)
        if (!isNaN(num) && num > maxId) maxId = num
      }
    })
    branchCode = `BR${String(maxId + 1).padStart(6, '0')}`
  }

  const insertData = {
    code: branchCode,
    name: payload.name,
    city: payload.city || null,
    state: payload.state || null,
    is_active: payload.status !== 'inactive',
  }

  const { data, error } = await supabase
    .from('branches')
    .insert([insertData])
    .select()

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

export async function updateBranch(id, updates) {
  const patch = {}
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.city !== undefined) patch.city = updates.city
  if (updates.state !== undefined) patch.state = updates.state
  if (updates.status !== undefined) patch.is_active = updates.status === 'active'

  const { data, error } = await supabase
    .from('branches')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

export async function getCommissionMaster() {
  const { data, error } = await supabase
    .from('commission_master')
    .select('*')

  if (error) throw error
  
  // Transform to lookup map matching frontend expected format:
  // { [planCode]: { [year]: { [rankCode]: percentageNumber } } }
  const masterMap = {}
  ;(data || []).forEach(row => {
    const code = row.plan_code.toUpperCase()
    const yr = row.policy_year
    const rankCode = row.rank_code.toUpperCase()
    if (!masterMap[code]) masterMap[code] = {}
    if (!masterMap[code][yr]) masterMap[code][yr] = {}
    const ratePct = row.commission_rate !== undefined && row.commission_rate !== null
      ? Number(row.commission_rate) * 100
      : Number(row.rate_percentage || 0)
    masterMap[code][yr][rankCode] = ratePct
  })

  return masterMap
}

export async function saveCommissionMaster(matrix) {
  const rows = []
  Object.entries(matrix || {}).forEach(([planCode, yearsMap]) => {
    Object.entries(yearsMap || {}).forEach(([year, ranksMap]) => {
      Object.entries(ranksMap || {}).forEach(([rankCode, ratePct]) => {
        const rate = Number(ratePct) / 100
        rows.push({
          plan_code: planCode,
          policy_year: Number(year),
          rank_code: rankCode,
          commission_rate: rate,
        })
      })
    })
  })

  if (rows.length === 0) return []

  const { data, error } = await supabase
    .from('commission_master')
    .upsert(rows, { onConflict: 'plan_code,policy_year,rank_code' })
    .select()

  if (error) throw error
  return data
}

export async function getSystemSettings() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')

  if (error) {
    if (error.code === 'PGRST116') return {}
    return {}
  }
  const settings = {}
  ;(data || []).forEach(row => {
    settings[row.key] = row.value
  })
  return settings
}

export async function saveSystemSettings(settingsObj) {
  const rows = Object.entries(settingsObj).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString()
  }))

  const { data, error } = await supabase
    .from('system_settings')
    .upsert(rows, { onConflict: 'key' })
    .select()

  if (error) throw error
  return data
}

export async function savePlanMaster(plan) {
  const durationMonths = plan.durationMonths || (plan.duration ? Number(plan.duration) * 12 : 12)
  const isActive = plan.status === 'active' || plan.is_active === true
  const payload = {
    code: plan.code,
    name: plan.name,
    type: plan.type || 'RD',
    duration_months: durationMonths,
    is_active: isActive,
    min_amount: Number(plan.minAmount || plan.min_amount) || 500,
    interest_rate: Number(plan.interestRate || plan.interest_rate) || 8.5,
  }

  if (plan.id) {
    const { data, error } = await supabase
      .from('plans_master')
      .update(payload)
      .eq('id', plan.id)
      .select()
    if (error) throw error
    return data && data[0]
  } else {
    const { data, error } = await supabase
      .from('plans_master')
      .insert([payload])
      .select()
    if (error) throw error
    return data && data[0]
  }
}
