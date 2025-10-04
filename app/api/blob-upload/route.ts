import { NextResponse } from 'next/server'

import { handleUpload } from '@vercel/blob/client'

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UploadFileType = 'payslip' | 'avac'

interface ClientPayload {
  sessionId: string
  fileType: UploadFileType
  originalName?: string
}

function parseClientPayload(payload: string | null): ClientPayload | null {
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload)
    if (typeof parsed?.sessionId === 'string' && typeof parsed?.fileType === 'string') {
      return parsed as ClientPayload
    }
  } catch (error) {
    console.warn('Failed to parse blob upload client payload', { payload, error })
  }
  return null
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch (error) {
    console.error('Invalid JSON payload for blob upload handler', { error })
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
  }

  const type = typeof body === 'object' && body !== null ? (body as { type?: string }).type : undefined

  if (type === 'blob.generate-client-token') {
    const supabase = await createRouteHandlerSupabaseClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error('Supabase user lookup failed for blob upload token request', error)
      return NextResponse.json({ error: 'Unable to verify user' }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const callbackUrl = process.env.VERCEL_BLOB_CALLBACK_URL

    if (!callbackUrl) {
      console.warn('Blob upload handler missing VERCEL_BLOB_CALLBACK_URL env variable')
    }

    const result = await handleUpload({
      request: req,
      body,
      callbackUrl,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload)

        if (!payload) {
          throw new Error('Missing upload metadata')
        }

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 5 * 1024 * 1024,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24,
          tokenPayload: clientPayload,
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseClientPayload(tokenPayload ?? null)
        console.log('Blob upload completed', {
          pathname: blob.pathname,
          size: blob.size,
          fileType: payload?.fileType,
          sessionId: payload?.sessionId,
        })
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('Failed to handle blob upload request', { error: message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
