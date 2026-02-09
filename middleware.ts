import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Rate limiter state (module-scoped, lives for the lifetime of the worker)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[]
}

const rateLimitMap = new Map<string, RateLimitEntry>()

const RATE_LIMIT_WINDOW_MS = 60_000 // 60 seconds
const RATE_LIMIT_MAX = 20 // max requests per window

/**
 * Periodic cleanup: evict stale entries every 60 s to prevent unbounded
 * memory growth.
 */
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    )
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(ip)
    }
  }
}, RATE_LIMIT_WINDOW_MS)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  // ------------------------------------------------------------------
  // 1. IP-based rate limiting (API routes only)
  // ------------------------------------------------------------------
  if (isApiRoute) {
    const ip = getClientIp(request)
    const now = Date.now()

    let entry = rateLimitMap.get(ip)
    if (!entry) {
      entry = { timestamps: [] }
      rateLimitMap.set(ip, entry)
    }

    // Sliding window: discard timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    )

    if (entry.timestamps.length >= RATE_LIMIT_MAX) {
      return jsonResponse(
        { error: 'Too many requests. Please try again later.' },
        429,
      )
    }

    entry.timestamps.push(now)
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
