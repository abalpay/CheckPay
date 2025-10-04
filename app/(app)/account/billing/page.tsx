import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { createServerClient } from '@/lib/supabase-auth'
import { isSubscriptionActive } from '@/lib/subscription'
import { resolvePlanFromIdentifier, type BillingPlan } from '@/lib/stripe'
import { ManageBillingButton } from './manage-billing-button'

const renewalFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' })

function formatStatus(status: string | null | undefined): string {
  if (!status) return 'inactive'
  return status.replace(/_/g, ' ')
}

function formatPlanLabel(plan: BillingPlan | null): string {
  if (!plan) return 'No active plan'
  return plan === 'monthly' ? 'Monthly plan' : 'Yearly plan'
}

function formatRenewal(dateIso: string | null | undefined): string {
  if (!dateIso) return '—'
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return '—'
  return renewalFormatter.format(date)
}

interface BillingPageProps {
  searchParams?: {
    welcome?: string
  }
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const supabase = createServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    console.error('Unable to load session for billing page', userError)
  }

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account/billing')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_subscription_status, stripe_current_period_end, stripe_price_identifier')
    .eq('id', user!.id)
    .maybeSingle()

  if (profileError) {
    console.error('Failed to load profile billing data', profileError)
  }

  const subscriptionStatus = profile?.stripe_subscription_status ?? null
  const plan = resolvePlanFromIdentifier(profile?.stripe_price_identifier)
  const renewal = formatRenewal(profile?.stripe_current_period_end)
  const welcome = searchParams?.welcome === '1'
  const active = isSubscriptionActive(subscriptionStatus)

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-10">
      {welcome && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertTitle className="flex items-center gap-2 text-blue-900">
            <Badge variant="secondary" className="bg-blue-100 text-blue-900">
              New subscription
            </Badge>
            You&apos;re all set!
          </AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3 text-blue-900/90">
            <span>Your CheckPay subscription is active. Let&apos;s run your first analysis.</span>
            <Button asChild className="w-fit bg-blue-600 hover:bg-blue-700">
              <Link href="/check/new">Start using CheckPay</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle>Subscription overview</CardTitle>
          <CardDescription>
            View your current plan, renewal date, and manage your billing details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Status</p>
              <p className="mt-2 text-base font-semibold capitalize text-gray-900">
                {formatStatus(subscriptionStatus)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Plan</p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {formatPlanLabel(plan)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Renews on</p>
              <p className="mt-2 text-base font-semibold text-gray-900">{renewal}</p>
            </div>
          </div>

          <Separator />

          {active ? (
            <div className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div>
                <p className="text-sm font-medium">Your subscription is active</p>
                <p className="text-sm text-emerald-900/80">
                  You have full access to CheckPay analyses and reports. Visit the billing portal to manage payment details or cancel anytime.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ManageBillingButton />
                <Button asChild variant="outline" className="border-emerald-200 text-emerald-900 hover:bg-emerald-100">
                  <Link href="/check/new">Start a new analysis</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div>
                <p className="text-sm font-medium">No active subscription</p>
                <p className="text-sm text-amber-900/80">
                  Choose a plan that fits you best to unlock AI-powered overtime reconciliation. You can compare monthly and yearly options on the pricing page.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="bg-amber-600 hover:bg-amber-700">
                  <Link href="/pricing">View plans</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
