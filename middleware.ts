import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './lib/database.types'
import { isSubscriptionActive } from './lib/subscription'

const SUBSCRIPTION_ALLOWED_PATHS = ['/account', '/account/billing']

type ProfileRow = Database['public']['Tables']['profiles']['Row']

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api')
}

function isSubscriptionExempt(pathname: string): boolean {
  return SUBSCRIPTION_ALLOWED_PATHS.some((allowedPath) => pathname.startsWith(allowedPath))
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })

  const pathname = req.nextUrl.pathname
  const search = req.nextUrl.search

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    console.error('Supabase session lookup failed in middleware', sessionError)
  }

  if (!session) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const redirectUrl = new URL('/auth/sign-in', req.url)
    redirectUrl.searchParams.set('redirectTo', `${pathname}${search}`)
    return NextResponse.redirect(redirectUrl)
  }

  if (isSubscriptionExempt(pathname)) {
    return res
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_subscription_status')
    .eq('id', session.user.id)
    .maybeSingle<Pick<ProfileRow, 'stripe_subscription_status'>>()

  if (profileError) {
    console.error('Failed to load profile in middleware', profileError)
  }

  if (!isSubscriptionActive(profile?.stripe_subscription_status)) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 402 })
    }

    const redirectUrl = new URL('/pricing', req.url)
    redirectUrl.searchParams.set('redirectTo', `${pathname}${search}`)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/check/:path*', '/account/:path*', '/api/analyze'],
}
