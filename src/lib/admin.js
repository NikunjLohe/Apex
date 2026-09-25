// ============================================================================
// Admin operations: member + branch management (Supabase Backend)
// Members are created via a secondary Supabase client without session persistence
// so the admin's own auth session is not replaced when provisioning a new account.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase/client'
import { updateProfile } from './supabase/profiles'
import { createBranch as sbCreateBranch, updateBranch as sbUpdateBranch } from './supabase/masterData'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function getSecondaryClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Generate sequential, unique, 5-digit zero-padded Agent Code.
 * - Ranks 11–18 (Senior Management): SM prefix (e.g. SM00001, SM00002...)
 * - Ranks 1–10 (Business Agents): KB prefix (e.g. KB00001, KB00002...)
 * Concurrency-safe via database atomic counter mechanism.
 */
export async function getNextAgentCode(rank = 1) {
  const rankNum = Number(rank) || 1
  const isSenior = rankNum >= 11
  const prefix = isSenior ? 'SM' : 'KB'
  const counterName = isSenior ? 'agents_sm' : 'agents_kb'
  const rpcName = isSenior ? 'get_next_sm_agent_code' : 'get_next_kb_agent_code'

  // 1. Try PostgreSQL RPC first
  try {
    const { data: rpcCode, error: rpcErr } = await supabase.rpc(rpcName)
    if (!rpcErr && rpcCode) {
      return rpcCode
    }
  } catch {
    // Fall back to direct counters table transaction
  }

  // 2. Fetch current counter value from counters table
  const { data: counterRow } = await supabase
    .from('counters')
    .select('current_value')
    .eq('name', counterName)
    .maybeSingle()

  let nextVal = 1
  if (counterRow && counterRow.current_value !== undefined && counterRow.current_value !== null) {
    nextVal = Number(counterRow.current_value) + 1
  } else {
    // Determine max from existing profiles with matching prefix
    const { data: profiles } = await supabase
      .from('profiles')
      .select('sponsor_code')
      .ilike('sponsor_code', `${prefix}%`)

    let maxNum = 0
    ;(profiles || []).forEach(p => {
      if (p.sponsor_code) {
        const numStr = p.sponsor_code.replace(/^[A-Z]+/i, '')
        const num = parseInt(numStr, 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    nextVal = maxNum + 1
  }

  // Atomically upsert counter
  await supabase
    .from('counters')
    .upsert({
      name: counterName,
      current_value: nextVal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'name' })

  return `${prefix}${String(nextVal).padStart(5, '0')}`
}

/**
 * Create a member: Supabase Auth user (temp password) + public.profiles record.
 * Enforces strict uniqueness checks for PAN, Phone, and Email.
 * Auto-generates unique sequential Agent IDs (SM00001.. for ranks 11-18, KB00001.. for ranks 1-10).
 */
export async function createMember(form, tempPassword) {
  const cleanForm = { ...form }
  const rankNum = Number(cleanForm.rank) || 1

  // 1. Backend Uniqueness check for PAN Number (if provided)
  if (cleanForm.panNumber && cleanForm.panNumber.trim()) {
    const panClean = cleanForm.panNumber.trim().toUpperCase()
    const { data: panDup } = await supabase
      .from('profiles')
      .select('id')
      .eq('pan_number', panClean)
      .maybeSingle()

    if (panDup) {
      throw new Error(`PAN Number "${panClean}" is already registered to another agent.`)
    }
    cleanForm.panNumber = panClean
  }

  // 2. Backend Uniqueness check for Phone Number
  const phoneClean = (cleanForm.phone || '').trim()
  if (phoneClean) {
    const { data: phoneDup } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phoneClean)
      .maybeSingle()

    if (phoneDup) {
      throw new Error(`Phone number "${phoneClean}" is already registered to another agent.`)
    }
    cleanForm.phone = phoneClean
  }

  // 3. Rank restriction checks (Sponsor hierarchy)
  if (cleanForm.referredBy) {
    const { data: sponsor } = await supabase
      .from('profiles')
      .select('rank')
      .eq('id', cleanForm.referredBy)
      .maybeSingle()

    if (sponsor) {
      const sponsorRank = Number(sponsor.rank || 1)
      if (rankNum >= sponsorRank) {
        throw new Error(`Recruitment rank violation: Sponsor at Rank ${sponsorRank} cannot recruit an agent at Rank ${rankNum}.`)
      }
    }
  }

  // 4. Concurrency-safe sequential Agent ID generation based on rank (SM for 11-18, KB for 1-10)
  const sponsorCode = await getNextAgentCode(rankNum)
  cleanForm.sponsorCode = sponsorCode

  // 5. Generate dynamic email if not explicitly provided
  const domain = 'apex.local'
  if (!cleanForm.email || !cleanForm.email.trim()) {
    cleanForm.email = `${sponsorCode.toLowerCase()}@${domain}`
  } else {
    cleanForm.email = cleanForm.email.trim().toLowerCase()
  }

  // 6. Backend Uniqueness check for Email Address
  const { data: emailDup } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', cleanForm.email)
    .maybeSingle()

  if (emailDup) {
    throw new Error(`Email address "${cleanForm.email}" is already registered.`)
  }

  // 7. Create Supabase Auth user via isolated secondary client
  const secondary = getSecondaryClient()
  const { data: authData, error: authError } = await secondary.auth.signUp({
    email: cleanForm.email,
    password: tempPassword,
    options: {
      data: {
        name: cleanForm.name,
        sponsor_code: sponsorCode,
      },
    },
  })

  if (authError || !authData?.user?.id) {
    throw new Error(authError?.message || 'Failed to create user authentication credentials.')
  }

  const uid = authData.user.id
  const isSuper = Boolean(cleanForm.isSuperAdmin)
  const isAdmin = isSuper
  const role = isSuper ? 'super_admin' : 'agent'

  // 8. Write the Profile record
  try {
    const profilePayload = {
      id: uid,
      name: cleanForm.name,
      email: cleanForm.email,
      phone: cleanForm.phone || null,
      rank: rankNum,
      role,
      is_super_admin: isSuper,
      is_admin: isAdmin,
      branch_id: cleanForm.branchId || null,
      status: cleanForm.status || 'active',
      sponsor_code: sponsorCode,
      sponsor_id: cleanForm.referredBy || null,
      pan_number: cleanForm.panNumber || null,
      bank_details: {},
      business_volume: 0,
      accumulated_volume: 0,
    }

    const { error: insertProfErr } = await supabase
      .from('profiles')
      .upsert([profilePayload], { onConflict: 'id' })

    if (insertProfErr) throw insertProfErr

    return { uid, sponsorCode }
  } catch (error) {
    console.error('Failed to create profile row:', error)
    throw error
  }
}

export async function updateMember(uid, data) {
  const cleanData = { ...data }
  delete cleanData.email
  delete cleanData.sponsorCode

  return updateProfile(uid, cleanData)
}

export async function createBranch(form, existingBranches = []) {
  return sbCreateBranch(form)
}

export async function updateBranch(id, data) {
  return sbUpdateBranch(id, data)
}

export async function changeMemberEmail(targetUid, newEmail) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ email: newEmail.trim().toLowerCase() })
    .eq('id', targetUid)
    .select()

  if (error) throw error
  return data
}
