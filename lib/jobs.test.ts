import { afterEach, describe, expect, it, vi } from 'vitest'

import { getOverallStatusMeta, normalizeAnalysisJson, startAnalyzeJob } from './jobs'

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

  afterEach(() => vi.unstubAllGlobals())

  function mockBackend(handlers: {
    parse?: (kind: string, name: string) => Response | Promise<Response>
    reconcile?: (body: { payslips: unknown[]; avacs: { name: string }[] }) => Response
  }) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/parse') {
        const fd = init.body as FormData
        const file = fd.get('file') as File
        return (await handlers.parse?.(String(fd.get('kind')), file.name))
          ?? new Response(JSON.stringify({ kind: fd.get('kind'), name: file.name, data: { shifts: [] } }), { status: 200 })
      }
      if (url === '/api/reconcile') {
        const body = JSON.parse(String(init.body))
        return handlers.reconcile?.(body)
          ?? new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, base_rate: 60, is_overpayment_payslip: false, older_adjustments_total: 0,
              avac_results: body.avacs.map((a: { name: string }) => ({ avac_name: a.name, report: {} })) }), { status: 200 })
      }
      throw new Error(`unexpected url ${url}`)
    }))
  }
  const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls

  it('parses every file once, then reconciles with all parsed JSON', async () => {
    mockBackend({})
    const result = await startAnalyzeJob({ payslips: [pdf('p1.pdf', 10), pdf('p2.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] })
    const urls = calls().map((c) => c[0])
    expect(urls.filter((u) => u === '/api/parse')).toHaveLength(4)
    expect(urls.filter((u) => u === '/api/reconcile')).toHaveLength(1)
    const body = JSON.parse(String(calls().find((c) => c[0] === '/api/reconcile')![1].body))
    expect(body).toEqual({ payslips: [{ shifts: [] }, { shifts: [] }], avacs: [{ name: 'a.pdf', data: { shifts: [] } }, { name: 'b.pdf', data: { shifts: [] } }] })
    expect(result.avac_results.map((r) => r.avac_name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('never puts more than one PDF in a request', async () => {
    mockBackend({})
    await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: Array.from({ length: 10 }, (_, i) => pdf(`w${i}.pdf`, 900 * 1024)) })
    for (const [url, init] of calls()) {
      if (url === '/api/parse') expect((init.body as FormData).getAll('file')).toHaveLength(1)
      else expect(typeof init.body).toBe('string')
    }
  })

  it('keeps a failed AVAC as an error entry and reports progress per AVAC', async () => {
    mockBackend({ parse: (_kind, name) => name === 'b.pdf' ? new Response(JSON.stringify({ error: 'Could not process this AVAC file.' }), { status: 400 }) : undefined as unknown as Response })
    const events: string[] = []
    const result = await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)], onProgress: (e) => events.push(`${e.avacName}:${e.state}`) })
    expect(events.sort()).toEqual(['a.pdf:done', 'b.pdf:error'])
    expect(result.avac_results).toEqual([{ avac_name: 'a.pdf', report: {} }, { avac_name: 'b.pdf', error: 'Could not process this AVAC file.' }])
    const body = JSON.parse(String(calls().find((c) => c[0] === '/api/reconcile')![1].body))
    expect(body.avacs.map((a: { name: string }) => a.name)).toEqual(['a.pdf'])
  })

  it('matches results to AVACs by position, so duplicate file names stay distinct', async () => {
    mockBackend({ reconcile: (body) => new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0,
      avac_results: body.avacs.map((a, i) => ({ avac_name: a.name, report: { n: i } })) }), { status: 200 }) })
    const result = await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('same.pdf', 10), pdf('same.pdf', 10)] })
    expect(result.avac_results).toEqual([{ avac_name: 'same.pdf', report: { n: 0 } }, { avac_name: 'same.pdf', report: { n: 1 } }])
  })

  it('throws the payslip parse error before reconciling', async () => {
    mockBackend({ parse: (kind) => kind === 'payslip' ? new Response(JSON.stringify({ error: 'Could not parse the payslip.' }), { status: 400 }) : undefined as unknown as Response })
    await expect(startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10)] })).rejects.toMatchObject({ message: 'Could not parse the payslip.' })
    expect(calls().some((c) => c[0] === '/api/reconcile')).toBe(false)
  })

  it('throws the first AVAC error when every AVAC fails, without reconciling', async () => {
    mockBackend({ parse: (kind) => kind === 'avac' ? new Response(JSON.stringify({ error: 'Unreadable AVAC.' }), { status: 400 }) : undefined as unknown as Response })
    await expect(startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10)] })).rejects.toMatchObject({ message: 'Unreadable AVAC.' })
    expect(calls().some((c) => c[0] === '/api/reconcile')).toBe(false)
  })

  it('returns a correction payslip response as is', async () => {
    const correction = { status: 'correction_payslip', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: -5, avac_results: [], message: 'm' }
    mockBackend({ reconcile: () => new Response(JSON.stringify(correction), { status: 200 }) })
    expect(await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10)] })).toEqual(correction)
  })

  it('rejects more than 8 payslips before calling fetch', async () => {
    mockBackend({})
    await expect(startAnalyzeJob({ payslips: Array.from({ length: 9 }, (_, i) => pdf(`p${i}.pdf`, 10)), avacs: [pdf('a.pdf', 10)] }))
      .rejects.toMatchObject({ field: 'payslips' })
    await expect(startAnalyzeJob({ payslips: [], avacs: [pdf('a.pdf', 10)] })).rejects.toMatchObject({ field: 'payslips' })
    expect(fetch).not.toHaveBeenCalled()
  })

  describe('onProgress', () => {
    const delayed = (ms: number) => new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))

    it('fires once per AVAC in completion order with running counts', async () => {
      const delays = new Map([['a.pdf', 30], ['b.pdf', 5], ['c.pdf', 15]])
      mockBackend({ parse: async (_kind, name) => (await delayed(delays.get(name) ?? 0)) as unknown as Response })
      const onProgress = vi.fn()

      await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10), pdf('c.pdf', 10)], onProgress })

      expect(onProgress.mock.calls.map(([e]) => [e.avacName, e.index, e.completed, e.total])).toEqual([
        ['b.pdf', 1, 1, 3],
        ['c.pdf', 2, 2, 3],
        ['a.pdf', 0, 3, 3],
      ])
    })

    it('does not fire when client validation fails', async () => {
      const onProgress = vi.fn()
      await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [], onProgress }).catch(() => {})
      expect(onProgress).not.toHaveBeenCalled()
    })

    it('ignores a throwing listener', async () => {
      mockBackend({})
      const result = await startAnalyzeJob({
        payslips: [pdf('p.pdf', 10)],
        avacs: [pdf('a.pdf', 10)],
        onProgress: () => {
          throw new Error('boom')
        },
      })
      expect(result.avac_results).toHaveLength(1)
    })
  })

  it('throws a clear error when the backend returns a different number of results', async () => {
    mockBackend({ reconcile: () => new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0,
      avac_results: [{ avac_name: 'a.pdf', report: {} }] }), { status: 200 }) })
    await expect(startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] }))
      .rejects.toMatchObject({ message: expect.stringMatching(/returned 1 AVAC results for 2 files/) })
  })

  it('reports each payslip as it is read', async () => {
    mockBackend({})
    const onPayslipRead = vi.fn()
    await startAnalyzeJob({ payslips: [pdf('p1.pdf', 10), pdf('p2.pdf', 10)], avacs: [pdf('a.pdf', 10)], onPayslipRead })
    expect(onPayslipRead.mock.calls).toEqual([[1, 2], [2, 2]])
  })
})
