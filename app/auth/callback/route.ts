import { NextResponse } from 'next/server'

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirect_to') ?? '/dashboard'

  if (code) {
    const supabase = createRouteHandlerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(redirectTo, origin))
}
