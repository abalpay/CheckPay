import { NextResponse, type NextRequest } from 'next/server'

import { isRateLimited, type RateBucket } from '@/lib/rate-limit'

// Limits are per analysis, not per request. One analysis is ≤ 86 parses (26 payslips + 60 AVACs) and one
// reconcile. Parse gets a burst that covers a year twice (a reload re-parses); reconcile — the expensive
// engine call — is capped per analysis; anything else under /api keeps 60/min.
const TEN_MINUTES = 10 * 60_000
const BUCKETS: Array<{ prefix: string } & RateBucket> = [
  { prefix: '/api/parse', limit: 200, windowMs: TEN_MINUTES },
  { prefix: '/api/reconcile', limit: 6, windowMs: TEN_MINUTES },
]
const DEFAULT_BUCKET: { prefix: string } & RateBucket = { prefix: '/api', limit: 60, windowMs: 60_000 }

function bucketFor(pathname: string) {
  return BUCKETS.find((b) => pathname.startsWith(b.prefix)) ?? DEFAULT_BUCKET
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract client IP from the request.
 * NOTE: x-forwarded-for is trusted only behind a reverse proxy
 * (Vercel, Cloudflare, nginx) that overwrites this header.
 * When self-hosting without a trusted proxy, clients can spoof
 * these headers to bypass rate limiting.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function jsonResponse(body: Record<string, string>, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  // ------------------------------------------------------------------
  // 1. IP-based rate limiting (API routes only), one budget per path family
  // ------------------------------------------------------------------
  if (isApiRoute) {
    const bucket = bucketFor(pathname)
    if (isRateLimited(`${bucket.prefix}:${getClientIp(request)}`, bucket)) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429)
    }
  }

  // ------------------------------------------------------------------
  // 2. CORS / CSRF protection (API POST requests only)
  // ------------------------------------------------------------------
  if (isApiRoute && request.method === 'POST') {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')

    if (origin && host) {
      const isDev = process.env.NODE_ENV === 'development'

      let originAllowed = false

      try {
        const originUrl = new URL(origin)
        const originHost = originUrl.host

        if (originHost === host) {
          originAllowed = true
        } else if (isDev && originUrl.hostname === 'localhost') {
          originAllowed = true
        }
      } catch {
        originAllowed = false
      }

      if (!originAllowed) {
        return jsonResponse({ error: 'Forbidden' }, 403)
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Session cookie
  // ------------------------------------------------------------------
  const response = NextResponse.next()

  const existingSession = request.cookies.get('checkpay_session')

  if (!existingSession) {
    const sessionId = crypto.randomUUID()
    const isSecure = request.nextUrl.protocol === 'https:'

    let cookieValue = `checkpay_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`
    if (isSecure) {
      cookieValue += '; Secure'
    }

    response.headers.append('Set-Cookie', cookieValue)
  }

  return response
}

// ---------------------------------------------------------------------------
// Config – match everything except static assets and Next.js internals
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
