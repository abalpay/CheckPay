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
})
