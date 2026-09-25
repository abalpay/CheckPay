// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const pdf = (name: string, size = 20) => {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('%PDF-'))
  return new File([bytes], name, { type: 'application/pdf' })
}

function req(files: Array<[string, File]>) {
  const fd = new FormData()
  files.forEach(([k, f]) => fd.append(k, f))
  return new Request('http://localhost/api/reconcile', { method: 'POST', body: fd })
}

afterEach(() => vi.restoreAllMocks())

describe('POST /api/reconcile', () => {
  it('rejects combined uploads over 4 MB with 413', async () => {
    const big = 1.5 * 1024 * 1024
    const res = await POST(req([['payslip', pdf('p.pdf', big)], ['avacs', pdf('a.pdf', big)], ['avacs', pdf('b.pdf', big)]]))
    expect(res.status).toBe(413)
  })

  it('returns JSON 500 when the backend is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(500)
    expect(await res.json()).toHaveProperty('error')
  })

  it('forwards to the upstream URL and returns validated JSON', async () => {
    const body = { status: 'correction_payslip', employee: 'X', pay_date: '2025-01-01', adjustment_total: 0, avac_results: [], message: 'm' }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(200)
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/reconcile$/)
  })

  it('passes through a 400 upstream detail message to the user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'Could not parse the payslip. Please check the file and try again.' }),
        { status: 400 },
      ),
    )
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Could not parse the payslip. Please check the file and try again.' })
  })

  it('maps a non-400 upstream error to a generic 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'x' }), { status: 500 }),
    )
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Backend processing failed.' })
  })

  it('does not pass through a 404 detail (misrouted upstream)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 }),
    )
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Backend processing failed.' })
  })

  it('forwards a JSON body to the json backend endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, avac_results: [] }), { status: 200 }))
    const res = await POST(new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payslips: [{}], avacs: [{ name: 'a.pdf', data: { shifts: [] } }] }) }))
    expect(res.status).toBe(200)
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/reconcile\/json$/)
  })

  it('rejects a JSON body over 3 MB, invalid JSON, or too many payslips', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const json = (body: string) => new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    expect((await POST(json('x'.repeat(3 * 1024 * 1024 + 1)))).status).toBe(413)
    expect((await POST(json('{nope'))).status).toBe(400)
    expect((await POST(json(JSON.stringify({ payslips: Array(9).fill({}), avacs: [{ name: 'a', data: {} }] })))).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps a 422 from the json endpoint to a generic 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: [{ msg: 'x' }] }), { status: 422 }))
    const res = await POST(new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payslips: [{}], avacs: [{ name: 'a.pdf', data: {} }] }) }))
    expect(res.status).toBe(502)
  })

  it('measures the JSON body in bytes and honours content-length', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    // 1.1M three-byte characters: under 3 MB in UTF-16 units, over it in bytes.
    const multiByte = new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payslips: [{}], avacs: [{ name: '€'.repeat(1_100_000), data: {} }] }) })
    expect((await POST(multiByte)).status).toBe(413)
    const declared = new Request('http://x/api/reconcile', { method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024 + 1) }, body: '{}' })
    expect((await POST(declared)).status).toBe(413)
    expect(spy).not.toHaveBeenCalled()
  })
})
