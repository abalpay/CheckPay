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

  it('maps mixed-case routing statuses onto canonical values', () => {
    const result = normalizeAnalysisJson({
      audit_summary: {
        pay_date: '2025-07-16',
        pay_period: '2025-06-23_2025-07-06',
        pay_period_end: '2025-07-06',
        total_avac_claims: 2,
        current_period_claims: 2,
        matched_claims: 1,
        unmatched_claims: 1,
        invalid_claims: 0,
        future_claims: 1,
        coverage_percentage: '50%',
        validation_status: 'OK',
        check_next_payslip_claims: 1,
        check_previous_payslip_claims: 0,
      },
      rows: [
        {
          date: '2025-06-30',
          variation: 'Overtime',
          normalized_type: 'overtime',
          required_units: 1,
          status: 'CHECK_FUTURE',
          match_details: 'Pending next payslip.',
        },
        {
          date: '2025-06-29',
          variation: 'Recall',
          normalized_type: 'recall_onsite',
          required_units: 2,
          status: 'CORRECTLY_PAID',
          match_details: 'Paid in full.',
        },
      ],
      matched_breakdown: [],
      unmatched_breakdown: [],
      future_breakdown: [],
      invalid_breakdown: [],
      quick_stats: {
        current_period_message: '',
        future_message: '',
        unmatched_message: '',
        total_unmatched_hours: '0',
        total_matched_hours: '0',
        total_future_hours: '0',
      },
      debug: {
        rows_received: 2,
        expected_rows: 2,
        period_end_parsed: '2025-07-06',
      },
    })

    expect(result).not.toBeNull()
    expect(result?.rows?.[0].status).toBe('check_next_payslip')
    expect(result?.rows?.[1].status).toBe('paid')
  })

  it('normalizes recon report shape', () => {
    const result = normalizeAnalysisJson({
      pay_period: '2025-06-23 to 2025-07-06',
      pay_date: '2025-07-16',
      totals: {
        claims_processed: 1,
        paid: 1,
        partially_paid: 0,
        unpaid: 0,
        pct_paid: 100,
      },
      claims_table: [
        {
          date: '2025-06-24',
          claim_type: 'Overtime',
          expected_hours: 1.5,
          matched_hours: 1.5,
          outcome: 'paid',
          matched_buckets: {
            '1.5': 1.5,
            '2.0': 0,
            '2.5': 0,
          },
          source_breakdown: {
            regular_pay: 0,
          },
          notes: '',
        },
      ],
      header_echo: {
        rostered_overtime_total: 0.4,
        rostered_overtime_by_rate: {
          '1.5': 0.4,
        },
      },
    })

    expect(result).not.toBeNull()
    expect(result?.report_type).toBe('recon')
    expect(result?.audit_summary.coverage_percentage).toBe('100%')
    expect(result?.audit_summary.paid_claims).toBe(1)
    expect(result?.rows?.[0].status).toBe('paid')
    expect(result?.rows?.[0].matched_parts).toEqual([
      { type: 'Overtime @1.5', units: 1.5 },
    ])
  })

  it('normalizes stringified recon payload arrays', () => {
    const payload = [
      {
        'pay period': '23/06 to 06/07',
        'pay date': '2025-07-16',
        'recon summary': JSON.stringify({
          total_claims: 2,
          correctly_paid: 1,
          missing: 1,
          partially_paid_or_mismatched: 0,
          check_previous: 1,
          check_future: 0,
          coverage: 0.5,
        }),
        'action required': JSON.stringify([]),
        'out of window': JSON.stringify({
          check_previous: [
            {
              claim_date: '2025-06-01',
              claim_type: 'Recall',
              claimed_hours: 3,
            },
          ],
          check_future: [],
        }),
        table: JSON.stringify([
          {
            id: 1,
            claim_date: '2025-06-01',
            claim_type: 'Recall',
            claimed_hours: 3,
            status: 'CHECK_PREVIOUS',
            reasoning: 'Requires previous payslip review.',
          },
          {
            id: 2,
            claim_date: '2025-06-02',
            claim_type: 'Overtime',
            claimed_hours: 2.5,
            status: 'CORRECTLY_PAID',
            reasoning: 'Paid in full.',
          },
        ]),
      },
    ]

    const result = normalizeAnalysisJson(payload)

    expect(result).not.toBeNull()
    expect(result?.audit_summary.total_avac_claims).toBe(2)
    expect(result?.audit_summary.paid_claims).toBe(1)
    expect(result?.audit_summary.unpaid_claims).toBe(1)
    expect(result?.audit_summary.coverage_percentage).toBe('50%')
    expect(result?.rows?.length).toBe(2)
    expect(result?.rows?.[0].status).toBe('check_previous_payslip')
    expect(result?.rows?.[1].status).toBe('paid')
    expect(result?.rows?.[1].payslip_units).toBeCloseTo(2.5)
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
