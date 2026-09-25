import { NextResponse } from 'next/server'
import { MAX_REQUEST_BYTES } from '@/lib/jobs'
import { logger } from '@/lib/logger'
import { getUpstreamUrl } from '@/lib/upstream'

const securityHeaders = { 'X-Content-Type-Options': 'nosniff' }
const KINDS = new Set(['payslip', 'avac', 'auto'])
const DETECTED = new Set(['payslip', 'avac', 'unknown'])
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: securityHeaders })

// Phase 1 of an analysis: exactly one PDF in; with kind=auto the backend classifies it first.
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const kind = formData.get('kind')
    if (!(file instanceof File)) return bad('Missing file upload')
    if (typeof kind !== 'string' || !KINDS.has(kind)) return bad('kind must be payslip, avac or auto')
    if (file.size > MAX_REQUEST_BYTES) return bad('File exceeds the 4 MB request limit.', 413)
    if ((await file.slice(0, 5).text()) !== '%PDF-') return bad(`File "${file.name}" is not a valid PDF.`)

    const outgoing = new FormData()
    outgoing.append('file', file)
    outgoing.append('kind', kind)
    const response = await fetch(getUpstreamUrl('api/parse'), {
      method: 'POST',
      body: outgoing,
      // Below the client's 60s timeout (lib/jobs.ts) so this route always answers with JSON first.
      signal: AbortSignal.timeout(55_000),
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      logger.error('[parse] Upstream non-OK', { status: response.status })
      const detail = (body as { detail?: unknown } | null)?.detail
      return response.status === 400 && typeof detail === 'string'
        ? bad(detail)
        : bad('Backend processing failed.', 502)
    }
    const parsed = body as { kind?: unknown; data?: unknown } | null
    const detected = parsed?.kind
    const kindOk = kind === 'auto' ? typeof detected === 'string' && DETECTED.has(detected) : detected === kind
    const dataOk = detected === 'unknown' ? parsed?.data === null : typeof parsed?.data === 'object' && parsed?.data !== null
    if (!parsed || !kindOk || !dataOk) return bad('Invalid response from analysis service.', 502)
    return NextResponse.json({ kind: detected, name: file.name, data: parsed.data }, { status: 200, headers: securityHeaders })
  } catch (error) {
    logger.error('[parse] Upstream error', { error: error instanceof Error ? error.message : String(error) })
    return bad('Analysis failed. Please try again.', 502)
  }
}
