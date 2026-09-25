// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PAYSLIP_FILES } from '@/lib/jobs'
import { POST } from './route'

const pdf = (name: string, size = 20) => {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('%PDF-'))
  return new File([bytes], name, { type: 'application/pdf' })
}

function jsonReq(body: string, headers: Record<string, string> = {}) {
  return new Request('http://x/api/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

const validBody = JSON.stringify({ payslips: [{}], avacs: [{ name: 'a.pdf', data: { shifts: [] } }] })

afterEach(() => vi.restoreAllMocks())

describe('POST /api/reconcile', () => {
  it('rejects a non-JSON content type with 415', async () => {
    const fd = new FormData()
    fd.append('payslip', pdf('p.pdf'))
    fd.append('avacs', pdf('a.pdf'))
    const res = await POST(new Request('http://localhost/api/reconcile', { method: 'POST', body: fd }))
    expect(res.status).toBe(415)
    expect(await res.json()).toHaveProperty('error')
  })

  it('returns JSON 502 when the backend is unreachable, matching other upstream errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(502)
    expect(await res.json()).toHaveProperty('error')
  })

  it('forwards a JSON body to the json backend endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, avac_results: [] }), { status: 200 }))
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(200)
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/reconcile\/json$/)
  })

  it('forwards and returns a validated correction_payslip response', async () => {
    const body = { status: 'correction_payslip', employee: 'X', pay_date: '2025-01-01', adjustment_total: 0, avac_results: [], message: 'm' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('correction_payslip')
  })

  it('passes through a 400 upstream detail message to the user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'Could not parse the payslip. Please check the file and try again.' }),
        { status: 400 },
      ),
    )
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Could not parse the payslip. Please check the file and try again.' })
  })

  it('maps a non-400 upstream error to a generic 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'x' }), { status: 500 }),
    )
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Backend processing failed.' })
  })

  it('does not pass through a 404 detail (misrouted upstream)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 }),
    )
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Backend processing failed.' })
  })

  it('rejects a JSON body over 3 MB, invalid JSON, or too many payslips', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect((await POST(jsonReq('x'.repeat(3 * 1024 * 1024 + 1)))).status).toBe(413)
    expect((await POST(jsonReq('{nope'))).status).toBe(400)
    expect((await POST(jsonReq(JSON.stringify({ payslips: Array(MAX_PAYSLIP_FILES + 1).fill({}), avacs: [{ name: 'a', data: {} }] })))).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps a 422 from the json endpoint to a generic 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: [{ msg: 'x' }] }), { status: 422 }))
    const res = await POST(jsonReq(validBody))
    expect(res.status).toBe(502)
  })

  it('measures the JSON body in bytes and honours content-length', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    // 1.1M three-byte characters: under 3 MB in UTF-16 units, over it in bytes.
    const multiByte = jsonReq(JSON.stringify({ payslips: [{}], avacs: [{ name: '€'.repeat(1_100_000), data: {} }] }))
    expect((await POST(multiByte)).status).toBe(413)
    const declared = jsonReq('{}', { 'content-length': String(3 * 1024 * 1024 + 1) })
    expect((await POST(declared)).status).toBe(413)
    expect(spy).not.toHaveBeenCalled()
  })
})
