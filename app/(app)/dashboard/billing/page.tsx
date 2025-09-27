'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase-client'

const supabase = createClient()

type Plan = 'monthly' | 'yearly'

type SubscriptionStatus = string | null

const formatStatus = (status: string) => status.replace(/_/g, ' ')

export default function BillingPage() {
  const router = useRouter()
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<Plan | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(null)

  const hasSubscription = Boolean(subscriptionStatus)
  const isActiveSubscription = subscriptionStatus === 'active'
  const friendlyStatus = useMemo(
    () => (subscriptionStatus ? formatStatus(subscriptionStatus) : null),
    [subscriptionStatus],
  )

  useEffect(() => {
    const getSubscriptionStatus = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('Unable to load user', userError)
        return
      }

      if (!user) {
        setSubscriptionStatus(null)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_subscription_status')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Unable to load profile', profileError)
        return
      }

      setSubscriptionStatus(profile?.stripe_subscription_status ?? null)
    }

    void getSubscriptionStatus()
  }, [])

  const handleCheckout = async (plan: Plan) => {
    setIsCheckoutLoading(plan)

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { url } = await response.json()

      if (url) {
        router.push(url)
      }
    } catch (error) {
      console.error('Checkout failed', error)
    } finally {
      setIsCheckoutLoading(null)
    }
  }

  const handleManageBilling = async () => {
    setIsPortalLoading(true)

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to create billing portal session')
      }

      const { url } = await response.json()

      if (url) {
        router.push(url)
      }
    } catch (error) {
      console.error('Billing portal launch failed', error)
    } finally {
      setIsPortalLoading(false)
    }
  }

  if (isActiveSubscription) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>You have an active subscription.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void handleManageBilling()} disabled={isPortalLoading}>
              {isPortalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Manage Billing
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (hasSubscription && friendlyStatus) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Your subscription is currently {friendlyStatus}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Access to premium features should be gated against this status.
              </p>
              <Button onClick={() => void handleManageBilling()} disabled={isPortalLoading}>
                {isPortalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Manage Billing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <h1 className="mb-8 text-center text-3xl font-bold">Choose Your Plan</h1>
      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Plan</CardTitle>
            <CardDescription>$10/month</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => void handleCheckout('monthly')}
              className="w-full"
              disabled={isCheckoutLoading !== null}
            >
              {isCheckoutLoading === 'monthly' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Choose Monthly'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yearly Plan</CardTitle>
            <CardDescription>$100/year</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => void handleCheckout('yearly')}
              className="w-full"
              disabled={isCheckoutLoading !== null}
            >
              {isCheckoutLoading === 'yearly' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Choose Yearly'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
