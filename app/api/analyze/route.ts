import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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

    const incoming = await req.formData()

    // Forward the exact multipart payload to n8n
    const outgoing = new FormData()
    for (const [key, value] of incoming.entries()) {
      outgoing.append(key, value as any)
    }

    const n8nResponse = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-API-Key': webhookSecret,
        'x-webhook-secret': webhookSecret,
      },
      body: outgoing,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

