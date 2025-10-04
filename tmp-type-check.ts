import type { Database } from './lib/database.types'
import type { GenericSchema } from '@supabase/supabase-js/dist/module/lib/types'

// Evaluate whether the generated public schema satisfies GenericSchema

type PublicSchema = Omit<Database, '__InternalSupabase'>['public']

type Check = PublicSchema extends GenericSchema ? true : false

const check: Check = true

// Inspect table type

const _profilesRow: PublicSchema['Tables']['profiles']['Row'] = {
  id: 'example',
  full_name: null,
  stripe_current_period_end: null,
  stripe_customer_id: null,
  stripe_price_identifier: null,
  stripe_subscription_id: null,
  stripe_subscription_status: null,
  updated_at: null,
}

