import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { getServerEnv } from '@/lib/env.server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'

function toIsoDate(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null
  return new Date(timestamp * 1000).toISOString()
}

function latestCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  return subscription.items.data.reduce<number | null>((latest, item) => {
    const periodEnd = item.current_period_end
    if (periodEnd == null) return latest
    return latest && latest > periodEnd ? latest : periodEnd
  }, null)
}

function buildSubscriptionUpdate(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price
  const identifier =
    typeof price === 'object' && price
      ? price.lookup_key ?? price.id ?? null
      : null

  return {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_current_period_end: toIsoDate(latestCurrentPeriodEnd(subscription)),
    stripe_price_identifier: identifier,
  }
}

export async function POST(req: NextRequest) {
  const { STRIPE_WEBHOOK_SECRET } = getServerEnv()

  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return new NextResponse('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err)
    return new NextResponse('Signature verification failed', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const supabaseUserId = session.metadata?.supabaseUserId
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id

        if (!supabaseUserId || !subscriptionId) {
          throw new Error('Missing metadata from checkout session')
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        const { error } = await supabaseAdmin
          .from('profiles')
          .update(buildSubscriptionUpdate(subscription))
          .eq('id', supabaseUserId)

        if (error) {
          throw error
        }

        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customer = subscription.customer
        const customerId =
          typeof customer === 'string' ? customer : customer.id

        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError
        }

        const profileId = (profile as { id: string } | null)?.id

        if (profileId) {
          const { error } = await supabaseAdmin
            .from('profiles')
            .update(buildSubscriptionUpdate(subscription))
            .eq('id', profileId)

          if (error) {
            throw error
          }
        }

        break
      }
      default:
        console.log(`Unhandled Stripe event type ${event.type}`)
        break
    }
  } catch (err) {
    console.error('Webhook handler error', err)
    return new NextResponse('Webhook handler error', { status: 500 })
  }

  return new NextResponse('OK', { status: 200 })
}
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
