import { NextResponse } from 'next/server'

const FASTAPI_RECONCILE_URL =
  process.env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'

function parseAvacEntries(formData: FormData): File[] {
  const entries = [...formData.getAll('avacs'), ...formData.getAll('avacs[]')]
  return entries.filter((entry): entry is File => entry instanceof File)
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const payslipEntry = formData.get('payslip')
    const avacEntries = parseAvacEntries(formData)

    if (!(payslipEntry instanceof File)) {
      return NextResponse.json({ error: 'Missing payslip upload' }, { status: 400 })
    }

    if (avacEntries.length === 0) {
      return NextResponse.json({ error: 'At least one AVAC upload is required' }, { status: 400 })
    }

    const outgoing = new FormData()
    outgoing.append('payslip', payslipEntry)
    avacEntries.forEach((entry) => outgoing.append('avacs', entry))

    const response = await fetch(FASTAPI_RECONCILE_URL, {
      method: 'POST',
      body: outgoing,
    })

    const text = await response.text()
    let data: unknown = null

    if (text.trim().length > 0) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { result: text }
      }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected proxy error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
