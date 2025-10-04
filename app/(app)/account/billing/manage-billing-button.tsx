'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export function ManageBillingButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to create billing portal session')
      }

      const data = (await response.json()) as { url?: string }

      if (!data.url) {
        throw new Error('Billing portal URL missing from response')
      }

      window.location.href = data.url
    } catch (error) {
      console.error('Unable to open billing portal', error)
      toast.error('We could not open the billing portal. Please try again later.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      onClick={() => void handleClick()}
      disabled={isLoading}
      className="bg-emerald-600 hover:bg-emerald-700"
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening portal
        </span>
      ) : (
        'Manage billing'
      )}
    </Button>
  )
}
