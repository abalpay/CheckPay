import 'server-only'

import { createClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

/**
 * WARNING: This file initializes a Supabase ADMIN client using SERVICE_ROLE.
 * Never import this from client components or the browser.
 * RLS is bypassed by this key. Limit usage to secure server code only.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase server environment variables')
}

// Server-side client with service role key for admin operations
export const supabaseAdmin = createClient<Database, 'public'>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Server-side client for regular operations (same as client-side but for SSR)
export const supabaseServer = createClient<Database, 'public'>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
