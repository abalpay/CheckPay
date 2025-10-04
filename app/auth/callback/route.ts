import { NextResponse } from 'next/server'

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawRedirect = searchParams.get('redirect_to')

  const DEFAULT_REDIRECT = '/dashboard'
  const ALLOWED_PREFIXES = ['/dashboard', '/check']

  const redirectTo = (() => {
    if (!rawRedirect) return DEFAULT_REDIRECT
    if (!rawRedirect.startsWith('/')) return DEFAULT_REDIRECT
    if (rawRedirect.startsWith('//')) return DEFAULT_REDIRECT

    const [pathname] = rawRedirect.split('?')
    const isAllowed = ALLOWED_PREFIXES.some((prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`)
    )

    return isAllowed ? rawRedirect : DEFAULT_REDIRECT
  })()

  if (code) {
    const supabase = await createRouteHandlerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(redirectTo, origin))
}
