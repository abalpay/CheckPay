import { NextResponse } from 'next/server'

import { del } from '@vercel/blob'

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'
import { isSubscriptionActive } from '@/lib/subscription'

interface UploadedBlobInfo {
  url?: string
  downloadUrl?: string
  pathname: string
  size?: number
  uploadedAt?: string
  contentType?: string
}

interface UploadedFileReference {
  blob: UploadedBlobInfo
  originalName?: string
}

interface AnalyzeRequestPayload {
  payslip: UploadedFileReference
  avacs: UploadedFileReference[]
  metadata?: Record<string, unknown>
  uploadSessionId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUploadedBlobInfo(value: unknown): value is UploadedBlobInfo {
  if (!isRecord(value)) return false
  return typeof value.pathname === 'string' && value.pathname.length > 0
}

function isUploadedFileReference(value: unknown): value is UploadedFileReference {
  if (!isRecord(value)) return false
  return isUploadedBlobInfo(value.blob)
}

async function fetchBlobAsFile(
  reference: UploadedFileReference,
  fallbackName: string
): Promise<File> {
  const downloadUrl = reference.blob.downloadUrl || reference.blob.url

  if (!downloadUrl) {
    throw new Error('Missing download URL for uploaded blob')
  }

  const response = await fetch(downloadUrl)

  if (!response.ok) {
    throw new Error(`Failed to download blob: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const fileName = reference.originalName?.trim() ? reference.originalName : `${fallbackName}.pdf`
  const contentType = reference.blob.contentType || 'application/pdf'

  return new File([arrayBuffer], fileName, { type: contentType })
}

async function cleanupUploadedBlobs(pathnames: string[], sessionId?: string) {
  if (!pathnames.length) return

  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (!token) {
    console.warn('Skipping blob cleanup - missing BLOB_READ_WRITE_TOKEN', {
      sessionId,
      pathCount: pathnames.length,
    })
    return
  }

  try {
    await del(pathnames, { token })
  } catch (error) {
    console.warn('Failed to delete uploaded blobs', {
      sessionId,
      error,
    })
  }
}

async function forwardToN8n(
  body: FormData,
  n8nUrl: string,
  webhookSecret: string
) {
  const n8nResponse = await fetch(n8nUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-API-Key': webhookSecret,
      'x-webhook-secret': webhookSecret,
    },
    body,
  })

  const text = await n8nResponse.text().catch(() => '')

  let data: unknown = null
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { result: text }
    }
  } else {
    data = { result: null }
  }

  return NextResponse.json(data, { status: n8nResponse.status })
}

export async function POST(req: Request) {
  const supabase = await createRouteHandlerSupabaseClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    console.error('Supabase user lookup failed for analyze API', userError)
    return NextResponse.json({ error: 'Unable to verify user' }, { status: 500 })
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_subscription_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Failed to load subscription status for analyze API', profileError)
    return NextResponse.json({ error: 'Unable to verify subscription' }, { status: 500 })
  }

  if (!isSubscriptionActive(profile?.stripe_subscription_status)) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 402 })
  }

  try {
    const n8nUrl = process.env.N8N_ANALYZE_URL
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET

    if (!n8nUrl) {
      return NextResponse.json(
        { error: 'Missing server environment variable: N8N_ANALYZE_URL' },
        { status: 500 }
      )
    }

    if (!webhookSecret) {
      return NextResponse.json(
        { error: 'Missing server environment variable: N8N_WEBHOOK_SECRET' },
        { status: 500 }
      )
    }

    const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''

    if (contentType.includes('application/json')) {
      let payload: AnalyzeRequestPayload

      try {
        payload = (await req.json()) as AnalyzeRequestPayload
      } catch (error) {
        console.error('Failed to parse analyze request JSON payload', error)
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
      }

      if (!isUploadedFileReference(payload?.payslip)) {
        return NextResponse.json({ error: 'Missing payslip upload' }, { status: 400 })
      }

      if (!Array.isArray(payload?.avacs) || payload.avacs.length === 0) {
        return NextResponse.json({ error: 'At least one AVAC upload is required' }, { status: 400 })
      }

      if (payload.avacs.some((entry) => !isUploadedFileReference(entry))) {
        return NextResponse.json({ error: 'Invalid AVAC upload payload' }, { status: 400 })
      }

      const uploadSessionId = typeof payload.uploadSessionId === 'string' ? payload.uploadSessionId : 'unknown'
      const blobPathnames = [
        payload.payslip.blob.pathname,
        ...payload.avacs.map((entry) => entry.blob.pathname),
      ]

      try {
        const payslipFile = await fetchBlobAsFile(payload.payslip, 'payslip')
        const avacFiles = await Promise.all(
          payload.avacs.map((entry, index) => fetchBlobAsFile(entry, `avac-${index + 1}`))
        )

        const outgoing = new FormData()
        outgoing.append('payslip', payslipFile)
        avacFiles.forEach((file) => outgoing.append('avacs[]', file))

        const metadata = isRecord(payload.metadata) ? { ...payload.metadata } : {}
        if (uploadSessionId !== 'unknown') {
          metadata.uploadSessionId = uploadSessionId
        }
        outgoing.append('meta', JSON.stringify(metadata))

        const response = await forwardToN8n(outgoing, n8nUrl, webhookSecret)

        await cleanupUploadedBlobs(blobPathnames, uploadSessionId)

        return response
      } catch (error) {
        await cleanupUploadedBlobs(blobPathnames, uploadSessionId)

        const message =
          error instanceof Error ? error.message : 'Unexpected error while preparing analysis request'

        console.error('Failed to forward analysis request to n8n', {
          error: message,
          uploadSessionId,
        })

        return NextResponse.json({ error: message }, { status: 500 })
      }
    }

    const formData = await req.formData()
    const payslipEntry = formData.get('payslip')
    const avacEntries = formData.getAll('avacs[]')

    if (!(payslipEntry instanceof File)) {
      return NextResponse.json({ error: 'Missing payslip upload' }, { status: 400 })
    }

    if (avacEntries.length === 0) {
      return NextResponse.json({ error: 'At least one AVAC upload is required' }, { status: 400 })
    }

    const invalidAvac = avacEntries.find((entry) => !(entry instanceof File))
    if (invalidAvac) {
      return NextResponse.json({ error: 'Invalid AVAC upload payload' }, { status: 400 })
    }

    const outgoing = new FormData()
    outgoing.append('payslip', payslipEntry)
    avacEntries.forEach((entry) => outgoing.append('avacs[]', entry as File))

    const metaValue = formData.get('meta')
    if (typeof metaValue === 'string' && metaValue.trim().length > 0) {
      outgoing.append('meta', metaValue)
    }

    return forwardToN8n(outgoing, n8nUrl, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
