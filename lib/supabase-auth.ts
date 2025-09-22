import {
  createRouteHandlerClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

import type { Database } from './database.types'

// For use in Server Components
export const createServerClient = () => createServerComponentClient<Database>({ cookies })

// For use in API Routes
export const createRouteHandlerSupabaseClient = () => createRouteHandlerClient<Database>({ cookies })
