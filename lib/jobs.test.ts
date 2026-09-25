import { describe, expect, it, vi } from 'vitest'

import { MAX_REQUEST_BYTES, getOverallStatusMeta, normalizeAnalysisJson, startAnalyzeJob } from './jobs'

describe('normalizeAnalysisJson', () => {
  it('accepts a valid ok response', () => {
    const payload = {
      status: 'ok',
      employee: 'Jane Doctor',
      pay_date: '2025-05-31',
      base_rate: 69.1842,
      is_overpayment_payslip: false,
      adjustment_total: 1200.5,
      older_adjustments_total: 0,
      avac_results: [],
    }

    expect(normalizeAnalysisJson(payload)).toEqual(payload)
  })

  it('accepts a correction payslip response', () => {
    const payload = {
      status: 'correction_payslip',
      employee: 'Jane Doctor',
      pay_date: '2025-05-31',
      adjustment_total: -300,
      avac_results: [],
      message: 'Correction only',
    }

    expect(normalizeAnalysisJson(payload)).toEqual(payload)
  })

  it('returns null for invalid payloads', () => {
    expect(normalizeAnalysisJson(undefined)).toBeNull()
    expect(normalizeAnalysisJson({})).toBeNull()
    expect(
      normalizeAnalysisJson({
        status: 'ok',
        employee: 'Jane Doctor',
      })
    ).toBeNull()
  })
})

describe('getOverallStatusMeta', () => {
  it('maps known statuses', () => {
    expect(getOverallStatusMeta('ALL_MATCH').label).toBe('All match')
    expect(getOverallStatusMeta('DISCREPANCIES_FOUND').label).toBe('Discrepancies found')
    expect(getOverallStatusMeta('OK_WITH_ANOMALIES').label).toBe('OK with anomalies')
    expect(getOverallStatusMeta('CORRECTION_PAYSLIP').label).toBe('Correction payslip')
  })
})

describe('startAnalyzeJob', () => {
  const pdf = (name: string, size: number) =>
    new File([new Uint8Array(size)], name, { type: 'application/pdf' })

  const okBody = (avacName: string) => ({
    status: 'ok',
    employee: 'Dr Test',
    pay_date: '2025-05-21',
    adjustment_total: 100,
    avac_results: [{ avac_name: avacName, report: { overall_status: 'ALL_MATCH' } }],
  })

  function mockBackend(handler: (avacName: string) => Response | Promise<Response>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const avac = (init?.body as FormData).getAll('avacs')
      expect(avac).toHaveLength(1)
      return handler((avac[0] as File).name)
    })
  }

  it('rejects a payslip + AVAC pair over the request limit before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const half = Math.ceil(MAX_REQUEST_BYTES / 2) + 1
    await expect(
      startAnalyzeJob({ payslip: pdf('p.pdf', half), avacs: [pdf('a.pdf', half)] }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/too large/i) })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('accepts ten ~900KB AVACs by sending one request per AVAC and merging in upload order', async () => {
    const avacs = Array.from({ length: 10 }, (_, i) => pdf(`week-${i + 1}.pdf`, 900 * 1024))
    const fetchSpy = mockBackend((name) => new Response(JSON.stringify(okBody(name)), { status: 200 }))

    const result = await startAnalyzeJob({ payslip: pdf('p.pdf', 80 * 1024), avacs })

    expect(fetchSpy).toHaveBeenCalledTimes(10)
    expect(result.avac_results.map((r) => r.avac_name)).toEqual(avacs.map((a) => a.name))
    fetchSpy.mockRestore()
  })

  it('keeps successful AVACs and marks a failed one with an error', async () => {
    const fetchSpy = mockBackend((name) =>
      name === 'b.pdf'
        ? new Response(JSON.stringify({ error: 'Backend processing failed.' }), { status: 502 })
        : new Response(JSON.stringify(okBody(name)), { status: 200 }),
    )

    const result = await startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] })

    expect(result.avac_results).toEqual([
      okBody('a.pdf').avac_results[0],
      { avac_name: 'b.pdf', error: 'Backend processing failed.' },
    ])
    fetchSpy.mockRestore()
  })

  it('throws the backend error when every request fails (e.g. unreadable payslip)', async () => {
    const fetchSpy = mockBackend(
      () => new Response(JSON.stringify({ error: 'Could not parse the payslip.' }), { status: 400 }),
    )

    await expect(
      startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] }),
    ).rejects.toMatchObject({ message: 'Could not parse the payslip.' })
    fetchSpy.mockRestore()
  })

  it('returns a correction payslip response once, not per AVAC', async () => {
    const correction = { status: 'correction_payslip', employee: 'Dr Test', pay_date: '2025-05-21', adjustment_total: -5, avac_results: [], message: 'm' }
    const fetchSpy = mockBackend(() => new Response(JSON.stringify(correction), { status: 200 }))

    const result = await startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] })

    expect(result).toEqual(correction)
    fetchSpy.mockRestore()
  })

  it('always posts to same-origin /api/reconcile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
    await startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10)] }).catch(() => {})
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/reconcile')
    fetchSpy.mockRestore()
  })
})
