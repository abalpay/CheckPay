'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CreditCard, Settings, Webhook } from 'lucide-react'

/**
 * Stripe Integration Test Page
 * 
 * This page provides a UI to test your Stripe integration endpoints
 * Navigate to /test-stripe to use this page
 */

interface TestResult {
  endpoint: string
  status: 'loading' | 'success' | 'error'
  data?: any
  error?: string
}

export default function StripeTestPage() {
  const [results, setResults] = useState<Record<string, TestResult>>({})

  const updateResult = (endpoint: string, result: Partial<TestResult>) => {
    setResults(prev => ({
      ...prev,
      [endpoint]: { ...prev[endpoint], endpoint, ...result }
    }))
  }

  const testEndpoint = async (endpoint: string, options: RequestInit = {}) => {
    updateResult(endpoint, { status: 'loading' })
    
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...options
      })
      
      const data = await response.json()
      
      if (response.ok) {
        updateResult(endpoint, { status: 'success', data })
      } else {
        updateResult(endpoint, { status: 'error', error: data.error || 'Request failed' })
      }
    } catch (error) {
      updateResult(endpoint, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }

  const testPrices = () => testEndpoint('/api/stripe/prices')
  
  const testCheckout = (plan: 'monthly' | 'yearly') => 
    testEndpoint('/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan })
    })
  
  const testPortal = () => 
    testEndpoint('/api/stripe/portal', {
      method: 'POST'
    })

  const ResultCard = ({ endpoint }: { endpoint: string }) => {
    const result = results[endpoint]
    if (!result) return null

    return (
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono">{endpoint}</CardTitle>
            <Badge variant={
              result.status === 'success' ? 'default' : 
              result.status === 'error' ? 'destructive' : 
              'secondary'
            }>
              {result.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {result.status === 'loading' && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing endpoint...
            </div>
          )}
          
          {result.status === 'success' && (
            <div>
              <p className="text-sm text-green-600 mb-2">✅ Success</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
          
          {result.status === 'error' && (
            <div>
              <p className="text-sm text-red-600 mb-2">❌ Error</p>
              <p className="text-sm text-muted-foreground">{result.error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Stripe Integration Test</h1>
        <p className="text-muted-foreground">
          Test your Stripe integration endpoints and functionality
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Prices API Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Prices API
            </CardTitle>
            <CardDescription>
              Test fetching available subscription plans and pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testPrices}
              disabled={results['/api/stripe/prices']?.status === 'loading'}
              className="w-full"
            >
              {results['/api/stripe/prices']?.status === 'loading' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Test Prices Endpoint
            </Button>
            <ResultCard endpoint="/api/stripe/prices" />
          </CardContent>
        </Card>

        {/* Checkout Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Checkout Flow
            </CardTitle>
            <CardDescription>
              Test creating Stripe checkout sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              onClick={() => testCheckout('monthly')}
              disabled={results['/api/stripe/checkout']?.status === 'loading'}
              variant="outline"
              className="w-full"
            >
              {results['/api/stripe/checkout']?.status === 'loading' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Test Monthly Checkout
            </Button>
            <Button 
              onClick={() => testCheckout('yearly')}
              disabled={results['/api/stripe/checkout']?.status === 'loading'}
              variant="outline"
              className="w-full"
            >
              Test Yearly Checkout
            </Button>
            <ResultCard endpoint="/api/stripe/checkout" />
          </CardContent>
        </Card>

        {/* Billing Portal Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Billing Portal
            </CardTitle>
            <CardDescription>
              Test customer billing portal access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testPortal}
              disabled={results['/api/stripe/portal']?.status === 'loading'}
              className="w-full"
            >
              {results['/api/stripe/portal']?.status === 'loading' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Test Portal Access
            </Button>
            <ResultCard endpoint="/api/stripe/portal" />
          </CardContent>
        </Card>

        {/* Test Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Testing Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <h4 className="font-medium">1. Environment Setup</h4>
              <p className="text-muted-foreground">
                Ensure your .env.local has all required Stripe variables
              </p>
            </div>
            <div>
              <h4 className="font-medium">2. Authentication</h4>
              <p className="text-muted-foreground">
                Sign in to test authenticated endpoints (checkout, portal)
              </p>
            </div>
            <div>
              <h4 className="font-medium">3. Webhook Testing</h4>
              <p className="text-muted-foreground">
                Use Stripe CLI: <code className="bg-muted px-1 rounded">stripe listen --forward-to localhost:3000/api/webhooks/stripe</code>
              </p>
            </div>
            <div>
              <h4 className="font-medium">4. Test Cards</h4>
              <p className="text-muted-foreground">
                Success: 4242424242424242, Decline: 4000000000000002
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="font-medium mb-2">Quick Test Checklist</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>✅ Prices endpoint returns plan data</li>
          <li>✅ Checkout creates session URLs</li>
          <li>✅ Portal generates management URLs</li>
          <li>✅ Webhooks process events correctly</li>
          <li>✅ Database updates on subscription changes</li>
        </ul>
      </div>
    </div>
  )
}
