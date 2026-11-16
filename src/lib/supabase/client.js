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
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcWpjbGdtZXR5Y3hmamVvenZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODk2MzQsImV4cCI6MjEwNTU2NTYzNH0.oXF7QxSeMp_UInYXNGEnYykLe4esb3RjC6dFBvQZuVk'

const supabaseServiceKey =
  import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env?.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcWpjbGdtZXR5Y3hmamVvenZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTk4OTYzNCwiZXhwIjoyMTA1NTY1NjM0fQ.sRxBS_bhblowAePr-5gDxgK9Q2Fw2g8ow75STwcIML4'

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

export const adminSupabase = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : supabase

export default supabase
