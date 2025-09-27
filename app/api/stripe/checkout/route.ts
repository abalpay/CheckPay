import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerEnv } from '@/lib/env.server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'

export async function POST(req: NextRequest) {
  const { STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MONTHLY, STRIPE_PRICE_ID_YEARLY } = getServerEnv()
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

    const body = await req.json().catch(() => ({})) as { plan?: 'monthly' | 'yearly' }
    const plan = body.plan === 'yearly' ? 'yearly' : 'monthly'
    const priceId = plan === 'yearly' ? STRIPE_PRICE_ID_YEARLY : STRIPE_PRICE_ID_MONTHLY

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: priceId, quantity: 1 },
      ],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
      customer: customerId,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        supabaseUserId: user.id,
      },
    })

    return NextResponse.json({ id: session.id, url: session.url }, { status: 200 })
  } catch (error) {
    console.error('Stripe checkout error', error)
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
  }
}
