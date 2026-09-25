// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

function pdfFile(name = 'a.pdf', body = '%PDF-1.4 fake') {
  return new File([body], name, { type: 'application/pdf' })
}

function req(file: File, kind: string) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  return new Request('http://x/api/parse', { method: 'POST', body: fd })
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /api/parse', () => {
  it('rejects a non-PDF and a bad kind before contacting the backend', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await POST(req(new File(['nope'], 'a.pdf', { type: 'application/pdf' }), 'avac'))).status).toBe(400)
    expect((await POST(req(pdfFile(), 'photo'))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards to the backend and returns its JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'avac', name: 'a.pdf', data: { shifts: [] } }), { status: 200 })))
    const res = await POST(req(pdfFile(), 'avac'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'avac', name: 'a.pdf', data: { shifts: [] } })
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/parse$/)
  })

  it('passes a backend 400 detail through and hides other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Could not process this AVAC file.' }), { status: 400 })))
    const res = await POST(req(pdfFile(), 'avac'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Could not process this AVAC file.' })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 })))
    const res404 = await POST(req(pdfFile(), 'avac'))
    expect(res404.status).toBe(502)
    expect(await res404.json()).toEqual({ error: 'Backend processing failed.' })
  })

  it('returns a 502 on a timeout or network failure, matching other upstream errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('The operation was aborted.', 'TimeoutError') }))
    const res = await POST(req(pdfFile(), 'avac'))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Analysis failed. Please try again.' })
  })

  it('rejects a backend answer of the wrong kind', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'payslip', data: {} }), { status: 200 })))
    expect((await POST(req(pdfFile(), 'avac'))).status).toBe(502)
  })

  it('relays kind=auto and the kind the backend detected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.body as FormData).get('kind')).toBe('auto')
      return new Response(JSON.stringify({ kind: 'payslip', name: 'p.pdf', data: { base_hourly_rate: 60 } }), { status: 200 })
    }))
    const res = await POST(req(pdfFile('p.pdf'), 'auto'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'payslip', name: 'p.pdf', data: { base_hourly_rate: 60 } })
  })

  it('relays an unknown classification as a 200 with null data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', name: 'x.pdf', data: null }), { status: 200 })))
    const res = await POST(req(pdfFile('x.pdf'), 'auto'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'unknown', name: 'x.pdf', data: null })
  })

  it('rejects unknown for an explicit kind and a nonsense kind for auto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', data: null }), { status: 200 })))
    expect((await POST(req(pdfFile(), 'avac'))).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'photo', data: {} }), { status: 200 })))
    expect((await POST(req(pdfFile(), 'auto'))).status).toBe(502)
  })
})
