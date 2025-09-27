import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerEnv } from '@/lib/env.server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = getServerEnv()
  const stripe = new Stripe(STRIPE_SECRET_KEY)

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
          .update({
            stripe_subscription_id: subscription.id,
            stripe_subscription_status: subscription.status,
          } as never)
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
            .update({
              stripe_subscription_status: subscription.status,
              stripe_subscription_id: subscription.id,
            } as never)
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
