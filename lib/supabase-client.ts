import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './database.types'

// For use in Client Components only
export const createClient = () => createClientComponentClient<Database, 'public'>()
