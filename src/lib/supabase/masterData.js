// ============================================================================
// APEX Supabase Data Access Layer — Master Data Module (Plans, Commissions & Branches)
// ============================================================================
import { supabase, adminSupabase } from './client'
import { mergePromotionRules } from '../mfa'

const client = adminSupabase || supabase
const SYSTEM_SETTINGS_SUMMARY_KEY = 'system_settings'
const PROMOTION_RULES_SUMMARY_KEY = 'promotion_rules'

export async function getPlansMaster() {
  const { data, error } = await client
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
  const { data, error } = await client
    .from('branches')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export const getBranches = listBranches

export async function createBranch(payload) {
  // Generate branch code if not provided
  let branchCode = payload.branchCode
  if (!branchCode) {
    const { data: existing } = await client.from('branches').select('code')
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

  const { data, error } = await client
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

  const { data, error } = await client
    .from('branches')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

export async function getCommissionMaster() {
  const pageSize = 1000
  const allRows = []
  let from = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .from('commission_master')
      .select('*')
      .order('plan_code', { ascending: true })
      .order('policy_year', { ascending: true })
      .order('rank_code', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (data && data.length > 0) {
      allRows.push(...data)
    }
    if (!data || data.length < pageSize) {
      hasMore = false
    } else {
      from += pageSize
    }
  }

  // Transform to lookup map matching frontend expected format:
  // { [planCode]: { [year]: { [rankCode]: percentageNumber } } }
  const masterMap = {}
  allRows.forEach(row => {
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

  const { data, error } = await client
    .from('commission_master')
    .upsert(rows, { onConflict: 'plan_code,policy_year,rank_code' })
    .select()

  if (error) throw error
  return data
}

export async function getSystemSettings() {
  const { data, error } = await client
    .from('system_summaries')
    .select('data')
    .eq('key', SYSTEM_SETTINGS_SUMMARY_KEY)
    .maybeSingle()

  if (!error && data?.data && typeof data.data === 'object') {
    return data.data
  }
  return {}
}

export async function saveSystemSettings(settingsObj) {
  const existing = await getSystemSettings().catch(() => ({}))
  const merged = { ...existing, ...(settingsObj || {}) }

  const { data, error } = await client
    .from('system_summaries')
    .upsert([{
      key: SYSTEM_SETTINGS_SUMMARY_KEY,
      data: merged,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'key' })
    .select()

  if (error) throw error
  return data?.[0]?.data || merged
}

export async function getPromotionRules() {
  const { data, error } = await client
    .from('system_summaries')
    .select('data')
    .eq('key', PROMOTION_RULES_SUMMARY_KEY)
    .maybeSingle()

  if (!error && data?.data && typeof data.data === 'object') {
    return mergePromotionRules(data.data)
  }
  return mergePromotionRules({})
}

export async function savePromotionRules(rulesObj) {
  const merged = mergePromotionRules(rulesObj || {})
  const { error } = await client
    .from('system_summaries')
    .upsert([{
      key: PROMOTION_RULES_SUMMARY_KEY,
      data: merged,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'key' })

  if (error) throw error
  return merged
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
    const { data, error } = await client
      .from('plans_master')
      .update(payload)
      .eq('id', plan.id)
      .select()
    if (error) throw error
    return data && data[0]
  } else {
    const { data, error } = await client
      .from('plans_master')
      .insert([payload])
      .select()
    if (error) throw error
    return data && data[0]
  }
}
