import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'
import type { Database } from '@/lib/database.types'
import { resolvePriceId, stripe, type BillingPlan } from '@/lib/stripe'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function POST(req: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient()

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
      .maybeSingle<Pick<ProfileRow, 'stripe_customer_id'>>()

    if (profileError) {
      console.error('Unable to load profile', profileError)
      return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 })
    }

    let existingProfile = profile

    if (!existingProfile) {
      const { data: createdProfile, error: createProfileError } = await supabase
        .from('profiles')
        .insert({ id: user.id })
        .select('stripe_customer_id')
        .single<Pick<ProfileRow, 'stripe_customer_id'>>()

      if (createProfileError) {
        if (createProfileError.code === '23505') {
          const { data: refetchedProfile, error: refetchError } = await supabase
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single<Pick<ProfileRow, 'stripe_customer_id'>>()

          if (refetchError) {
            console.error('Unable to refetch profile after conflict', refetchError)
            return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 })
          }

          existingProfile = refetchedProfile
        } else {
          console.error('Unable to create profile', createProfileError)
          return NextResponse.json({ error: 'Unable to create profile' }, { status: 500 })
        }
      }

      existingProfile = existingProfile ?? createdProfile
    }

    let customerId = existingProfile?.stripe_customer_id ?? undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          supabaseUserId: user.id,
        },
      })

      customerId = customer.id

      const updateValues: ProfileUpdate = { stripe_customer_id: customerId }
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateValues)
        .eq('id', user.id)

      if (updateError) {
        console.error('Failed to persist Stripe customer ID', updateError)
        return NextResponse.json({ error: 'Unable to persist Stripe customer' }, { status: 500 })
      }
    }

    const body = await req.json().catch(() => ({})) as { plan?: BillingPlan }
    const plan: BillingPlan = body.plan === 'yearly' ? 'yearly' : 'monthly'
    const priceId = await resolvePriceId(plan)

    const fallBackOrigin = new URL(req.url).origin
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      fallBackOrigin

    const successUrl = new URL('/account/billing', origin)
    successUrl.searchParams.set('welcome', '1')

    const cancelUrl = new URL('/pricing', origin)
    cancelUrl.searchParams.set('checkout', 'cancelled')

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: priceId, quantity: 1 },
      ],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
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
