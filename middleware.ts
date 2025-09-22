import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './lib/database.types'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareSupabaseClient<Database>({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    return res
  }

  const redirectUrl = new URL('/auth/sign-in', req.url)
  redirectUrl.searchParams.set('redirectTo', `${req.nextUrl.pathname}${req.nextUrl.search}`)

  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: ['/dashboard/:path*', '/check/:path*'],
}
