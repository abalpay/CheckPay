import Link from 'next/link'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { createServerClient } from '@/lib/supabase-auth'
import { isSubscriptionActive } from '@/lib/subscription'
import { retrievePrice, type BillingPlan } from '@/lib/stripe'
import { PricingCheckoutButton } from './pricing-checkout-button'

import type Stripe from 'stripe'

function formatRecurringPrice(price: Stripe.Price): string {
  if (price.unit_amount == null || !price.currency) {
    return 'Pricing unavailable'
  }

  const amount = price.unit_amount / 100
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  })

  const interval = price.recurring?.interval ?? 'month'
  const intervalCount = price.recurring?.interval_count ?? 1
  const intervalLabel = intervalCount > 1 ? `${intervalCount} ${interval}s` : interval
  const cadencePrefix = intervalCount > 1 ? 'every' : 'per'

  return `${formatter.format(amount)} ${cadencePrefix} ${intervalLabel}`
}

function planFeatures(plan: BillingPlan): string[] {
  const common = [
    'Unlimited CheckPay overtime analyses',
    'Detailed reconciliation reports and exports',
    'Secure document handling with auto-deletion',
  ]

  if (plan === 'yearly') {
    return [
      ...common,
      'Two months free compared to monthly',
      'Priority roadmap feedback channel',
    ]
  }

  return [...common, 'Flexible cancel-anytime billing']
}

interface PricingPageProps {
  searchParams?: {
    plan?: string
    checkout?: string
  }
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const supabase = createServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    console.error('Unable to load session for pricing page', userError)
  }

  let subscriptionStatus: string | null = null

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to load subscription status for pricing page', profileError)
    }

    subscriptionStatus = profile?.stripe_subscription_status ?? null
  }

  const isAuthenticated = Boolean(user)
  const isSubscribed = isSubscriptionActive(subscriptionStatus)
  const selectedPlanParam = searchParams?.plan === 'yearly' ? 'yearly' : 'monthly'
  const checkoutCancelled = searchParams?.checkout === 'cancelled'

  const [monthlyPrice, yearlyPrice] = await Promise.all([
    retrievePrice('monthly', { expand: ['product'] }),
    retrievePrice('yearly', { expand: ['product'] }),
  ])

  const plans: Array<{
    plan: BillingPlan
    price: Stripe.Price
    highlight: boolean
  }> = [
    { plan: 'monthly', price: monthlyPrice, highlight: selectedPlanParam === 'monthly' },
    { plan: 'yearly', price: yearlyPrice, highlight: selectedPlanParam === 'yearly' },
  ]

  return (
    <div className="container mx-auto max-w-5xl space-y-10 px-4 py-16">
      <div className="max-w-3xl space-y-4">
        <Badge variant="secondary" className="bg-blue-100 text-blue-900">
          Pricing built for QH staff
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Get confident about your overtime in minutes.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          Choose the plan that lets you audit Queensland Health overtime with AI trained on award rules. Upload documents securely, reconcile claims instantly, and get actionable reports to follow up with payroll.
        </p>
        {isSubscribed && (
          <Alert className="max-w-xl border-emerald-200 bg-emerald-50 text-emerald-900">
            <AlertTitle className="font-medium">You already have an active subscription</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 text-sm text-emerald-900/80">
              Manage your billing details or download invoices anytime.
              <Link
                href="/account/billing"
                className="text-sm font-semibold text-emerald-900 underline"
              >
                Go to billing →
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {checkoutCancelled && (
          <Alert className="max-w-xl border-amber-200 bg-amber-50 text-amber-900">
            <AlertTitle className="font-medium">Checkout cancelled</AlertTitle>
            <AlertDescription className="text-sm text-amber-900/80">
              No worries—pick a plan below when you’re ready to continue.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map(({ plan, price, highlight }) => (
          <Card
            key={plan}
            className={`flex h-full flex-col border ${
              highlight
                ? 'border-blue-500 shadow-lg shadow-blue-500/10'
                : 'border-slate-200'
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{plan} plan</span>
                {plan === 'yearly' && (
                  <Badge variant="secondary" className="bg-blue-600 text-white">
                    Best value
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{formatRecurringPrice(price)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-slate-600">
                {plan === 'monthly'
                  ? 'Perfect for trying CheckPay or running analyses during high overtime periods.'
                  : 'Lock in the best rate for the year and stay audit-ready every pay cycle.'}
              </p>
              <Separator />
              <ul className="space-y-3 text-sm text-slate-700">
                {planFeatures(plan).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <PricingCheckoutButton
                plan={plan}
                isAuthenticated={isAuthenticated}
                isSubscribed={isSubscribed}
              />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
