import { NextResponse } from 'next/server'
import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, MAX_REQUEST_BYTES, normalizeAnalysisJson } from '@/lib/jobs'
import { logger } from '@/lib/logger'
import { getUpstreamUrl } from '@/lib/upstream'

// Parsed JSON is a few KB per file; this keeps the body well under Vercel's 4.5 MB limit.
const MAX_JSON_BYTES = 3 * 1024 * 1024

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
}

// --- Helpers ----------------------------------------------------------------

function parseAvacEntries(formData: FormData): File[] {
  const entries = [...formData.getAll('avacs'), ...formData.getAll('avacs[]')]
  return entries.filter((entry): entry is File => entry instanceof File)
}

async function isPdf(file: File): Promise<boolean> {
  const header = await file.slice(0, 5).text()
  return header === '%PDF-'
}

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

// Phase 2 (JSON body of parsed files) is the current flow; the multipart body is the legacy
// one-payslip flow, kept until it is removed in a follow-up (plan P6).
export async function POST(request: Request) {
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      return await reconcileJson(request)
    }

    const formData = await request.formData()
    const payslipEntry = formData.get('payslip')
    const avacEntries = parseAvacEntries(formData)

    // ---- Basic presence checks ----

    if (!(payslipEntry instanceof File)) {
      return NextResponse.json(
        { error: 'Missing payslip upload' },
        { status: 400, headers: securityHeaders },
      )
    }

    if (avacEntries.length === 0) {
      return NextResponse.json(
        { error: 'At least one AVAC upload is required' },
        { status: 400, headers: securityHeaders },
      )
    }

    // ---- File count limit ----

    if (avacEntries.length > MAX_AVAC_FILES) {
      return NextResponse.json(
        { error: `Too many AVAC files. Maximum is ${MAX_AVAC_FILES}.` },
        { status: 400, headers: securityHeaders },
      )
    }

    // ---- Total file size check ----

    const allFiles: File[] = [payslipEntry, ...avacEntries]

    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0)
    if (totalSize > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: 'Upload exceeds the 4 MB request limit.' },
        { status: 413, headers: securityHeaders },
      )
    }

    // ---- PDF magic-byte checks ----

    for (const file of allFiles) {
      if (!(await isPdf(file))) {
        return NextResponse.json(
          { error: `File "${file.name}" is not a valid PDF.` },
          { status: 400, headers: securityHeaders },
        )
      }
    }

    // ---- Forward to upstream ----

    const outgoing = new FormData()
    outgoing.append('payslip', payslipEntry)
    avacEntries.forEach((entry) => outgoing.append('avacs', entry))

    const response = await fetch(getUpstreamUrl('api/reconcile'), {
      method: 'POST',
      body: outgoing,
      // Below the client's 60s timeout (lib/jobs.ts) so this route always
      // answers with JSON before the browser gives up on the request.
      signal: AbortSignal.timeout(55_000),
    })

    return await relayUpstream(response)
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
