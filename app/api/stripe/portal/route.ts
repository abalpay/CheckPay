import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'
import { getServerEnv } from '@/lib/env.server'

export async function POST(req: NextRequest) {
  const { STRIPE_SECRET_KEY } = getServerEnv()
  const stripe = new Stripe(STRIPE_SECRET_KEY)
  const supabase = createRouteHandlerSupabaseClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      console.error('Supabase user lookup failed', userError)
      return NextResponse.json({ error: 'Unable to verify user' }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Unable to load profile', profileError)
      const status = profileError.code === 'PGRST116' ? 404 : 500
      return NextResponse.json({ error: 'Profile not found' }, { status })
    }

    let customerId = profile?.stripe_customer_id ?? undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          supabaseUserId: user.id,
        },
      })

      customerId = customer.id

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)

      if (updateError) {
        console.error('Failed to persist Stripe customer ID', updateError)
        return NextResponse.json({ error: 'Unable to persist Stripe customer' }, { status: 500 })
      }
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/billing`,
    })

    return NextResponse.json({ url: session.url }, { status: 200 })
  } catch (error) {
    console.error('Stripe customer portal error', error)
    return NextResponse.json({ error: 'Unable to create billing portal session' }, { status: 500 })
  }
}
