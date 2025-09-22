'use client'

import { Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

import Logo from '@/components/layout/logo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase-client'

const supabase = createClient()

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const redirectTo = useMemo(() => {
    const param = searchParams.get('redirectTo')
    if (param && param.startsWith('/')) return param
    return '/dashboard'
  }, [searchParams])

  const redirectUri = useMemo(() => {
    const baseFromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    if (baseFromEnv) return `${baseFromEnv}/auth/callback`
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/auth/callback`
    }
    return '/auth/callback'
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(redirectTo)
      }
    })
  }, [router, redirectTo])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace(redirectTo)
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [router, redirectTo])

  return (
    <div className="flex min-h-screen font-inter">
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo />
          <div className="space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white">
              Protecting healthcare workers
            </Badge>
            <h1 className="text-4xl font-semibold leading-tight">
              Your overtime insights are just a sign in away.
            </h1>
            <p className="max-w-md text-lg text-white/80">
              Access AI-powered analysis, track your claim history, and make sure every hour of overtime is recognised.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-[0.3em] text-white/70">
              Why CheckPay?
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-white/80">
              <li>• Bank-grade encryption keeps your documents secure.</li>
              <li>• AI spots missed overtime payments in under a minute.</li>
              <li>• Detailed reports help you follow up with payroll fast.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6 py-12 sm:px-12">
        <Card className="w-full max-w-md border-gray-200 shadow-xl shadow-gray-200/40">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30">
              <span className="text-lg font-semibold">CP</span>
            </div>
            <CardTitle className="text-2xl">Sign in to CheckPay</CardTitle>
            <CardDescription>
              Use magic links or your preferred provider to continue to your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Auth
              supabaseClient={supabase as any}
              view="sign_in"
              redirectTo={redirectUri}
              providers={["google"]}
              appearance={{
                theme: ThemeSupa,
                className: {
                  container: 'space-y-4',
                },
                variables: {
                  default: {
                    colors: {
                      brand: '#3b82f6',
                      brandAccent: '#312e81',
                    },
                  },
                },
              }}
            />
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to our terms of service and acknowledge our privacy policy.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <SignInForm />
    </Suspense>
  )
}
