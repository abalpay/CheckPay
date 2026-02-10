import { describe, expect, it } from 'vitest'

import { getOverallStatusMeta, normalizeAnalysisJson } from './jobs'

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
    expect(getOverallStatusMeta('OK_WITH_PENDING').label).toBe('OK with pending')
  })
})
