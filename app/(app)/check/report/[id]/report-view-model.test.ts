import { describe, expect, it } from 'vitest'

import type { AvacReport, LineItem, ReconcileResponseOk } from '@/lib/jobs'

import { createReportViewModel, getMergedActionableItems } from './report-view-model'

function buildLineItem(overrides: Partial<LineItem>): LineItem {
  return {
    date: '28.04.2025',
    day_of_week: 'Mon',
    pay_type: 'Overtime_-_1.5',
    status: 'MATCH',
    expected_units: 1,
    actual_units: 1,
    expected_amount: 100,
    actual_amount: 100,
    difference: 0,
    notes: '',
    ...overrides,
  }
}

describe('report-view-model', () => {
  it('merges actionable rows from actionable_items and day items', () => {
    const underpaid = buildLineItem({ status: 'UNDERPAID', difference: -55, actual_amount: 45 })
    const possiblyMissed = buildLineItem({
      date: '29.04.2025',
      status: 'POSSIBLY_MISSED',
      pay_type: 'Recall_-_T2.0',
      expected_amount: 121,
      actual_amount: 0,
      difference: -121,
    })

    const report: AvacReport = {
      overall_status: 'DISCREPANCIES_FOUND',
      match_count: 1,
      discrepancy_count: 1,
      missing_count: 0,
      unmatched_count: 0,
      not_yet_paid_count: 1,
      possibly_missed_count: 1,
      earliest_adjustment_date: '28.04.2025',
      latest_adjustment_date: '05.05.2025',
      total_expected: 221,
      total_actual: 145,
      total_difference: -76,
      days: [
        {
          date: '28.04.2025',
          day_of_week: 'Mon',
          day_type: 'weekday',
          status: 'UNDERPAID',
          expected_total: 100,
          actual_total: 45,
          difference: -55,
          items: [underpaid],
        },
        {
          date: '29.04.2025',
          day_of_week: 'Tue',
          day_type: 'weekday',
          status: 'POSSIBLY_MISSED',
          expected_total: 121,
          actual_total: 0,
          difference: -121,
          items: [possiblyMissed],
        },
      ],
      actionable_items: [underpaid],
      older_adjustments: [],
      older_adjustments_total: 0,
      unmatched_payslip_entries: [],
    }

    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Test',
      pay_date: '06.05.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 221,
      older_adjustments_total: 0,
      avac_results: [
        { avac_name: 'AVAC Alpha.pdf', report },
        { avac_name: 'AVAC Broken.pdf', error: 'Could not process this AVAC file.' },
      ],
    }

    const merged = getMergedActionableItems(report)
    expect(merged).toHaveLength(2)

    const viewModel = createReportViewModel(analysis)

    expect(viewModel.actionableCount).toBe(2)
    expect(viewModel.parseErrorCount).toBe(1)
    expect(viewModel.payrollActionRows).toHaveLength(1)
    expect(viewModel.followUpRows).toHaveLength(1)
    expect(viewModel.underpaidMissingCount).toBe(1)
    expect(viewModel.followUpRows[0].status).toBe('POSSIBLY_MISSED')
    expect(viewModel.avacSummaries[0].subtitle).toContain('1 follow-up')
  })
})
