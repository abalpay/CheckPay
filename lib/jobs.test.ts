// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fileDigest, getOverallStatusMeta, MAX_AVAC_FILES, MAX_PAYSLIP_FILES, normalizeAnalysisJson, PARSE_CONCURRENCY, parseUpload, startAnalyzeJob, validateCounts, withParseSlot, type ParsedUpload } from './jobs'

const pdf = (name: string, body = '%PDF-1.4 fake') => new File([body], name, { type: 'application/pdf' })
const parsed = (kind: 'payslip' | 'avac', name: string, data: unknown = { shifts: [] }): ParsedUpload => ({ kind, name, data })
const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls

afterEach(() => vi.unstubAllGlobals())

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

describe('parseUpload', () => {
  it('posts one file with kind=auto and returns the detected kind and data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify({ kind: 'avac', name: 'a.pdf', data: { shifts: [1] } }), { status: 200 })))
    expect(await parseUpload(pdf('a.pdf'))).toEqual({ kind: 'avac', name: 'a.pdf', data: { shifts: [1] } })
    const [url, init] = calls()[0]
    expect(url).toBe('/api/parse')
    const fd = init.body as FormData
    expect(fd.get('kind')).toBe('auto')
    expect(fd.getAll('file')).toHaveLength(1)
  })

  it('returns kind unknown without data for an unrecognised PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', name: 'x.pdf', data: null }), { status: 200 })))
    expect(await parseUpload(pdf('x.pdf'))).toEqual({ kind: 'unknown', name: 'x.pdf' })
  })

  it('throws the backend message on a 400 and a generic one on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Could not process this AVAC file.' }), { status: 400 })))
    await expect(parseUpload(pdf('a.pdf'))).rejects.toMatchObject({ message: 'Could not process this AVAC file.' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(parseUpload(pdf('a.pdf'))).rejects.toMatchObject({ message: 'Failed to reach the analysis service. Please try again later.' })
  })

  it('maps a 429 to a short per-file message that says how to retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), { status: 429 })))
    await expect(parseUpload(pdf('a.pdf'))).rejects.toMatchObject({
      message: 'Too many requests — wait a few minutes, then remove this file and drop it again.',
    })
  })
})

describe('withParseSlot', () => {
  it(`never runs more than ${PARSE_CONCURRENCY} tasks at once and runs them all`, async () => {
    let active = 0
    let peak = 0
    const tasks = Array.from({ length: 20 }, (_, i) => withParseSlot(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return i
    }))
    expect(await Promise.all(tasks)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(peak).toBe(PARSE_CONCURRENCY)
  })

  it('frees the slot when a task throws', async () => {
    await expect(withParseSlot(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await withParseSlot(async () => 'ok')).toBe('ok')
  })

  it('hands a freed slot straight to a queued waiter, so a fresh caller racing the hand-off still queues', async () => {
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []

    function start(): void {
      void withParseSlot(() => new Promise<void>((resolve) => {
        active += 1
        peak = Math.max(peak, active)
        releases.push(() => {
          active -= 1
          resolve()
        })
      }))
    }

    for (let i = 0; i < PARSE_CONCURRENCY; i++) start() // fills every slot
    start() // 7th caller queues behind the cap — does not run yet

    const release0 = releases.shift()!
    release0() // frees a slot; the hand-off should go straight to the queued 7th caller
    // A brand-new (8th) caller races in during that hand-off — it must queue, not sneak past the cap.
    Promise.resolve().then(start)

    // Let the microtask queue (hand-off, race, resumed waiter) fully settle.
    await new Promise((r) => setTimeout(r, 0))
    expect(peak).toBeLessThanOrEqual(PARSE_CONCURRENCY)

    while (releases.length) releases.shift()!()
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('fileDigest', () => {
  it('is the same for identical bytes under different names and differs otherwise', async () => {
    const a = await fileDigest(pdf('Week 19.pdf', 'same bytes'))
    const b = await fileDigest(pdf('Week 19 - copy.pdf', 'same bytes'))
    const c = await fileDigest(pdf('Week 20.pdf', 'other bytes'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('validateCounts', () => {
  it('needs at least one of each and no more than a year of each', () => {
    expect(validateCounts(0, 1)).toMatchObject({ field: 'payslips' })
    expect(validateCounts(1, 0)).toMatchObject({ field: 'avacs' })
    expect(validateCounts(MAX_PAYSLIP_FILES + 1, 1)).toMatchObject({ field: 'payslips', message: 'Maximum 26 payslips allowed' })
    expect(validateCounts(1, MAX_AVAC_FILES + 1)).toMatchObject({ field: 'avacs', message: 'Maximum 60 AVAC forms allowed' })
    expect(validateCounts(MAX_PAYSLIP_FILES, MAX_AVAC_FILES)).toBeNull()
  })
})

describe('startAnalyzeJob', () => {
  const okResponse = (avacs: { name: string }[]) => new Response(JSON.stringify({
    status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, base_rate: 60, is_overpayment_payslip: false,
    older_adjustments_total: 0, avac_results: avacs.map((a, i) => ({ avac_name: a.name, report: { n: i } })),
  }), { status: 200 })

  it('sends every parsed payslip and AVAC in one JSON call and returns results in order', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => okResponse(JSON.parse(String(init.body)).avacs)))
    const result = await startAnalyzeJob({
      payslips: [parsed('payslip', 'p1.pdf', { a: 1 }), parsed('payslip', 'p2.pdf', { a: 2 })],
      avacs: [parsed('avac', 'same.pdf'), parsed('avac', 'same.pdf')],
    })
    expect(calls()).toHaveLength(1)
    const [url, init] = calls()[0]
    expect(url).toBe('/api/reconcile')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({
      payslips: [{ a: 1 }, { a: 2 }],
      avacs: [{ name: 'same.pdf', data: { shifts: [] } }, { name: 'same.pdf', data: { shifts: [] } }],
    })
    expect(result.avac_results).toEqual([{ avac_name: 'same.pdf', report: { n: 0 } }, { avac_name: 'same.pdf', report: { n: 1 } }])
  })

  it('rejects a year plus one before calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(startAnalyzeJob({ payslips: Array.from({ length: 27 }, (_, i) => parsed('payslip', `p${i}.pdf`)), avacs: [parsed('avac', 'a.pdf')] }))
      .rejects.toMatchObject({ field: 'payslips' })
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [] })).rejects.toMatchObject({ field: 'avacs' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a correction payslip response as is', async () => {
    const correction = { status: 'correction_payslip', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: -5, avac_results: [], message: 'm' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(correction), { status: 200 })))
    expect(await startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf')] })).toEqual(correction)
  })

  it('throws a clear error when the backend returns a different number of results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ name: 'a.pdf' }])))
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf'), parsed('avac', 'b.pdf')] }))
      .rejects.toMatchObject({ message: expect.stringMatching(/returned 1 AVAC results for 2 files/) })
  })

  it('surfaces the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Parsed data exceeds the 3 MB request limit.' }), { status: 413 })))
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf')] }))
      .rejects.toMatchObject({ message: 'Parsed data exceeds the 3 MB request limit.' })
  })

  it('maps a 429 to an analyses-specific message, not the per-file parse one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), { status: 429 })))
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf')] }))
      .rejects.toMatchObject({ message: 'Too many analyses — wait a few minutes, then click Analyse again.' })
  })
})
