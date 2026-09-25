import { describe, expect, it, vi } from 'vitest'

import { MAX_TOTAL_UPLOAD_BYTES, getOverallStatusMeta, normalizeAnalysisJson, startAnalyzeJob } from './jobs'

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

  it('rejects a combined upload over the total limit before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const third = Math.ceil(MAX_TOTAL_UPLOAD_BYTES / 3) + 1
    await expect(
      startAnalyzeJob({ payslip: pdf('p.pdf', third), avacs: [pdf('a.pdf', third), pdf('b.pdf', third)] }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/total/i) })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('always posts to same-origin /api/reconcile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
    await startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10)] }).catch(() => {})
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/reconcile')
    fetchSpy.mockRestore()
  })
})
