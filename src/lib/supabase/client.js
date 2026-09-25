// ============================================================================
// APEX Supabase Client Module
// ----------------------------------------------------------------------------
// Uses public ANON key only. Never exposes SUPABASE_SERVICE_ROLE_KEY to browser.
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (fallback to SUPABASE_*).
// ============================================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (
  import.meta.env?.VITE_SUPABASE_URL ||
  import.meta.env?.SUPABASE_URL ||
  'https://qiqjclgmetycxfjeozvm.supabase.co'
).replace(/\/rest\/v1\/?$/, '')

const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  import.meta.env?.SUPABASE_ANON_KEY ||
  ''

if (!supabaseAnonKey) {
  console.warn('[Supabase Client] Missing Supabase Public ANON Key in environment.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export default supabase
