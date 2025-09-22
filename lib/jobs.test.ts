import { describe, expect, it } from 'vitest'

import { normalizeAnalysisJson } from './jobs'

describe('normalizeAnalysisJson', () => {
  it('returns normalized data for the latest analysis format', () => {
    const result = normalizeAnalysisJson({
      audit_summary: {
        pay_date: '2024-01-15',
        pay_period: '2024-01-01_2024-01-14',
        pay_period_end: '2024-01-14',
        total_avac_claims: 2,
        current_period_claims: 2,
        matched_claims: 1,
        unmatched_claims: 1,
        invalid_claims: 0,
        future_claims: 0,
        coverage_percentage: '50%',
        validation_status: 'OK',
        check_next_payslip_claims: 0,
        check_previous_payslip_claims: 0,
      },
      matched_breakdown: [
        {
          date: '2024-01-05',
          group: 'Roster',
          avacHours: 2,
          avacRowIds: ['1'],
          payrollLineIds: ['a'],
        },
      ],
      unmatched_breakdown: [
        {
          date: '2024-01-06',
          group: 'Roster',
          avacHours: 1,
          avacRowIds: ['2'],
          payrollLineIds: ['b'],
        },
      ],
      quick_stats: {
        current_period_message: 'ok',
        future_message: 'none',
        unmatched_message: 'missing',
        total_unmatched_hours: '1',
        total_matched_hours: '2',
        total_future_hours: '0',
      },
      debug: {
        rows_received: 2,
        expected_rows: 2,
        period_end_parsed: '2024-01-14',
      },
    })

    expect(result).not.toBeNull()
    expect(result?.audit_summary.pay_period).toBe('2024-01-01_2024-01-14')
    expect(result?.matched_breakdown?.[0].avacHours).toBe(2)
  })

  it('converts legacy responses into the unified structure', () => {
    const result = normalizeAnalysisJson({
      summary: {
        payPeriod: '2024-01-01_2024-01-14',
        matchedCount: '1',
        unmatchedCount: '1',
        notes: ['check payroll'],
      },
      matched: [
        {
          date: '2024-01-05',
          group: 'Roster',
          avac_hours: '2',
          payroll_units: '2',
        },
      ],
      unmatched: [
        {
          date: '2024-01-06',
          group: 'Roster',
          avac_hours: '1',
        },
      ],
    })

    expect(result).not.toBeNull()
    expect(result?.audit_summary.matched_claims).toBe(1)
    expect(result?.quick_stats.total_unmatched_hours).toBe('1.00')
  })

  it('handles webhook payload arrays by normalizing entries', () => {
    const result = normalizeAnalysisJson([
      {
        summary: {
          pay_period: '2024-01-01_2024-01-14',
          matched_count: '2',
          unmatched_count: '0',
        },
        matched: [
          {
            date: '2024-01-05',
            group: 'Roster',
            avac_hours: '3',
            payroll_units: '3',
          },
        ],
        unmatched: [],
      },
    ])

    expect(result).not.toBeNull()
    expect(result?.audit_summary.matched_claims).toBe(2)
    expect(result?.matched_breakdown?.[0].avacHours).toBe(3)
  })

  it('returns null when no recognizable structure is provided', () => {
    expect(normalizeAnalysisJson(undefined)).toBeNull()
    expect(normalizeAnalysisJson({})).toBeNull()
  })
})
