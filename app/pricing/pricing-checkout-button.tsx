'use client'

import { useCallback, useState, startTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface PricingCheckoutButtonProps {
  plan: 'monthly' | 'yearly'
  isAuthenticated: boolean
  isSubscribed: boolean
}

export function PricingCheckoutButton({ plan, isAuthenticated, isSubscribed }: PricingCheckoutButtonProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)

  const handleCheckout = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const data = (await response.json()) as { url?: string }

      if (!data.url) {
        throw new Error('Checkout session URL missing')
      }

      window.location.href = data.url
    } catch (error) {
      console.error('Unable to start checkout', error)
      toast.error('Unable to start checkout. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [plan])

  if (isSubscribed) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full border-emerald-300 text-emerald-900 hover:bg-emerald-100"
        onClick={() => {
          startTransition(() => {
            router.push('/account/billing')
          })
        }}
      >
        <Lock className="mr-2 h-4 w-4" />
        Already subscribed — manage billing
      </Button>
    )
  }

  if (!isAuthenticated) {
    return (
      <Button
        type="button"
        className="w-full"
        onClick={() => {
          const params = new URLSearchParams(searchParams?.toString())
          params.set('plan', plan)
          params.set('auth', '1')
          const redirectTo = `/pricing?${params.toString()}`
          startTransition(() => {
            router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`)
          })
        }}
      >
        Sign in to choose this plan
      </Button>
    )
  }

  return (
    <Button type="button" className="w-full" disabled={isLoading} onClick={() => void handleCheckout()}>
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirecting to secure checkout
        </span>
      ) : (
        'Choose this plan'
      )}
    </Button>
  )
}
