import { NextResponse } from 'next/server'
import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, normalizeAnalysisJson } from '@/lib/jobs'
import { logger } from '@/lib/logger'
import { getUpstreamUrl } from '@/lib/upstream'

// Parsed JSON is a few KB per file; this keeps the body well under Vercel's 4.5 MB limit.
const MAX_JSON_BYTES = 3 * 1024 * 1024

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
}

// --- Helpers ----------------------------------------------------------------

async function relayUpstream(response: Response): Promise<Response> {
  if (!response.ok) {
    logger.error('[reconcile] Upstream non-OK', { status: response.status })
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null)
      const detail = (body as { detail?: unknown } | null)?.detail
      if (typeof detail === 'string') {
        return NextResponse.json({ error: detail }, { status: 400, headers: securityHeaders })
      }
    }
    return NextResponse.json(
      { error: 'Backend processing failed.' },
      { status: 502, headers: securityHeaders },
    )
  }

  const text = await response.text()
  let data: unknown

  try {
    data = JSON.parse(text)
  } catch {
    return NextResponse.json(
      { error: 'Invalid response from analysis service.' },
      { status: 502, headers: securityHeaders },
    )
  }

  const validated = normalizeAnalysisJson(data)
  if (!validated) {
    return NextResponse.json(
      { error: 'Invalid response from analysis service.' },
      { status: 502, headers: securityHeaders },
    )
  }

  return NextResponse.json(validated, {
    status: 200,
    headers: securityHeaders,
  })
}

async function reconcileJson(request: Request): Promise<Response> {
  const tooLarge = () =>
    NextResponse.json({ error: 'Parsed data exceeds the 3 MB request limit.' }, { status: 413, headers: securityHeaders })
  // Reject on the declared size before reading the body; still measure bytes, since the header is optional.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BYTES) return tooLarge()
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) return tooLarge()
  let body: { payslips?: unknown; avacs?: unknown } | null
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: securityHeaders })
  }
  if (
    !Array.isArray(body?.payslips) || body.payslips.length === 0 || body.payslips.length > MAX_PAYSLIP_FILES
    || !Array.isArray(body.avacs) || body.avacs.length === 0 || body.avacs.length > MAX_AVAC_FILES
  ) {
    return NextResponse.json(
      { error: `Send 1–${MAX_PAYSLIP_FILES} payslips and 1–${MAX_AVAC_FILES} AVACs.` },
      { status: 400, headers: securityHeaders },
    )
  }
  const response = await fetch(getUpstreamUrl('api/reconcile/json'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
    signal: AbortSignal.timeout(55_000),
  })
  return relayUpstream(response)
}

// --- Route handler ----------------------------------------------------------

// Phase 2 of the two-phase flow: browser sends every parsed payslip and AVAC as one JSON body.
export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Expected a JSON body of parsed payslips and AVACs.' },
      { status: 415, headers: securityHeaders },
    )
  }
  try {
    return await reconcileJson(request)
  } catch (error) {
    logger.error('[reconcile] Upstream error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500, headers: securityHeaders },
    )
  }
}
