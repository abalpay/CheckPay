import { NextResponse } from 'next/server'

const FASTAPI_RECONCILE_URL =
  process.env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_AVAC_FILES = 10

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
}

// --- SSRF validation --------------------------------------------------------

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
]

function validateUpstreamUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid FASTAPI_RECONCILE_URL: unable to parse "${url}"`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid FASTAPI_RECONCILE_URL protocol: "${parsed.protocol}". Only http: and https: are allowed.`,
    )
  }

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(
      'FASTAPI_RECONCILE_URL must use https: in production.',
    )
  }

  const hostname = parsed.hostname
  for (const pattern of PRIVATE_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(
        `FASTAPI_RECONCILE_URL hostname "${hostname}" resolves to a private/reserved address.`,
      )
    }
  }
}

try {
  validateUpstreamUrl(FASTAPI_RECONCILE_URL)
} catch (error) {
  console.error('[reconcile] URL validation warning:', error)
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

// --- Route handler ----------------------------------------------------------

export async function POST(request: Request) {
  try {
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

    // ---- File size checks ----

    const allFiles: File[] = [payslipEntry, ...avacEntries]

    for (const file of allFiles) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the 5 MB size limit.` },
          { status: 400, headers: securityHeaders },
        )
      }
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

    const response = await fetch(FASTAPI_RECONCILE_URL, {
      method: 'POST',
      body: outgoing,
      signal: AbortSignal.timeout(30_000),
    })

    // ---- Upstream response validation ----

    if (!response.ok) {
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

    return NextResponse.json(data, {
      status: response.status,
      headers: securityHeaders,
    })
  } catch (error) {
    console.error('[reconcile] Upstream error:', error)
    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500, headers: securityHeaders },
    )
  }
}
