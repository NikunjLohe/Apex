// ============================================================================
// Admin operations: member + branch management (Supabase Backend)
// Members are provisioned via adminSupabase (service_role, persistSession: false)
// so accounts are confirmed immediately without triggering confirmation emails
// or replacing the signed-in admin's own auth session.
// ============================================================================
import { supabase, adminSupabase } from './supabase/client'
import { updateProfile } from './supabase/profiles'
import { createBranch as sbCreateBranch, updateBranch as sbUpdateBranch } from './supabase/masterData'

const dbClient = adminSupabase || supabase

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
  const { data: counterRow } = await dbClient
    .from('counters')
    .select('current_value')
    .eq('name', counterName)
    .maybeSingle()

  let nextVal = 1
  if (counterRow && counterRow.current_value !== undefined && counterRow.current_value !== null) {
    nextVal = Number(counterRow.current_value) + 1
  } else {
    // Determine max from existing profiles with matching prefix
    const { data: profiles } = await dbClient
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
  await dbClient
    .from('counters')
    .upsert({
      name: counterName,
      current_value: nextVal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'name' })

  return `${prefix}${String(nextVal).padStart(5, '0')}`
}

async function assertUniqueProfileValue(column, value, { caseInsensitive = false, excludeId = null, message }) {
  let query = dbClient.from('profiles').select('id')
  query = caseInsensitive ? query.ilike(column, value) : query.eq(column, value)
  if (excludeId) query = query.neq('id', excludeId)

  const { data: existing, error } = await query.maybeSingle()
  if (error) throw error
  if (existing) throw new Error(message)
}

/**
 * Create a member: Supabase Auth user (temp password) + public.profiles record.
 * Enforces strict uniqueness checks for PAN, Phone, and Email.
 * Auto-generates unique sequential Agent IDs (SM00001.. for ranks 11-18, KB00001.. for ranks 1-10).
 */
export async function createMember(form, tempPassword) {
  const cleanForm = { ...form }
  const rankNum = Number(cleanForm.rank) || 1
  const cleanPassword = String(tempPassword || '').trim()

  if (!cleanForm.name || !cleanForm.name.trim()) {
    throw new Error('Member full name is required.')
  }
  cleanForm.name = cleanForm.name.trim()

  if (cleanPassword.length < 6) {
    throw new Error('Temporary password must be at least 6 characters.')
  }

  // 1. Backend Uniqueness check for PAN Number (if provided)
  if (cleanForm.panNumber && cleanForm.panNumber.trim()) {
    const panClean = cleanForm.panNumber.trim().toUpperCase()
    await assertUniqueProfileValue('pan_number', panClean, {
      message: `PAN Number "${panClean}" is already registered to another agent.`,
    })
    cleanForm.panNumber = panClean
  }

  // 2. Backend Uniqueness check for Phone Number
  const phoneClean = (cleanForm.phone || '').trim()
  if (phoneClean) {
    await assertUniqueProfileValue('phone', phoneClean, {
      message: `Phone number "${phoneClean}" is already registered to another agent.`,
    })
    cleanForm.phone = phoneClean
  }

  // 3. Rank restriction checks (Sponsor hierarchy)
  if (cleanForm.referredBy) {
    const { data: sponsor } = await dbClient
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

  // 4. Validate explicit Email before allocating sequential Agent IDs
  const providedEmail = (cleanForm.email || '').trim().toLowerCase()
  if (providedEmail) {
    await assertUniqueProfileValue('email', providedEmail, {
      caseInsensitive: true,
      message: `Email address "${providedEmail}" is already registered.`,
    })
  }

  // 5. Resolve Agent ID (manual or concurrency-safe sequential auto-generation)
  let sponsorCode = (cleanForm.sponsorCode || '').trim().toUpperCase()
  if (sponsorCode) {
    await assertUniqueProfileValue('sponsor_code', sponsorCode, {
      caseInsensitive: true,
      message: `Agent ID "${sponsorCode}" is already assigned to another agent. Please choose a unique Agent ID.`,
    })
  } else {
    // Auto-generate sequential Agent ID based on rank (SM for 11-18, KB for 1-10),
    // skipping any code manually claimed earlier
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = await getNextAgentCode(rankNum)
      const { data: codeDup, error: codeErr } = await dbClient
        .from('profiles')
        .select('id')
        .ilike('sponsor_code', candidate)
        .maybeSingle()
      if (codeErr) throw codeErr
      if (!codeDup) {
        sponsorCode = candidate
        break
      }
    }
    if (!sponsorCode) {
      throw new Error('Could not allocate a unique Agent ID automatically. Please specify one manually.')
    }
  }
  cleanForm.sponsorCode = sponsorCode

  // 6. Generate dynamic email if not explicitly provided and verify uniqueness
  if (providedEmail) {
    cleanForm.email = providedEmail
  } else {
    cleanForm.email = `${sponsorCode.toLowerCase()}@apex.local`
    await assertUniqueProfileValue('email', cleanForm.email, {
      caseInsensitive: true,
      message: `Email address "${cleanForm.email}" is already registered.`,
    })
  }

  // 7. Create confirmed Supabase Auth user via Admin API (bypasses confirmation email rate limits)
  if (!adminSupabase || adminSupabase === supabase || typeof adminSupabase.auth?.admin?.createUser !== 'function') {
    throw new Error('Admin member creation is unavailable: Supabase service-role client is not configured.')
  }

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: cleanForm.email,
    password: cleanPassword,
    email_confirm: true,
    user_metadata: {
      name: cleanForm.name,
      sponsor_code: sponsorCode,
    },
  })

  if (authError || !authData?.user?.id) {
    const msg = authError?.message || 'Failed to create user authentication credentials.'
    if (/already.*registered|already.*exists|duplicate/i.test(msg)) {
      throw new Error(`Email address "${cleanForm.email}" is already registered in authentication (possibly from an incomplete previous attempt). Please use another email or clear the incomplete auth account.`)
    }
    throw new Error(msg)
  }

  const uid = authData.user.id
  const isSuper = Boolean(cleanForm.isSuperAdmin)
  const isAdmin = isSuper
  const role = isSuper ? 'super_admin' : 'agent'

  // 8. Write the Profile record; roll back Auth user if writing fails
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

    const { error: insertProfErr } = await dbClient
      .from('profiles')
      .upsert([profilePayload], { onConflict: 'id' })

    if (insertProfErr) throw insertProfErr

    return { uid, sponsorCode, email: cleanForm.email }
  } catch (error) {
    console.error('Failed to create profile row:', error)
    try {
      await adminSupabase.auth.admin.deleteUser(uid)
    } catch (cleanupErr) {
      console.error('Failed to roll back auth user after profile write error:', cleanupErr)
    }
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
  const cleanEmail = newEmail.trim().toLowerCase()

  await assertUniqueProfileValue('email', cleanEmail, {
    caseInsensitive: true,
    excludeId: targetUid,
    message: `Email address "${cleanEmail}" is already registered to another member.`,
  })

  if (adminSupabase && adminSupabase !== supabase && typeof adminSupabase.auth?.admin?.updateUserById === 'function') {
    const { error: authErr } = await adminSupabase.auth.admin.updateUserById(targetUid, {
      email: cleanEmail,
      email_confirm: true,
    })
    if (authErr) throw authErr
  }

  const { data, error } = await dbClient
    .from('profiles')
    .update({ email: cleanEmail })
    .eq('id', targetUid)
    .select()

  if (error) throw error
  return data
}
