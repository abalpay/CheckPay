import { describe, expect, it } from 'vitest'

import type {
  AvacReport,
  LineItem,
  ReconcileResponseCorrection,
  ReconcileResponseOk,
} from '@/lib/jobs'

import {
  buildPrintSummaryModel,
  buildTroubleshootingPayload,
  createReportViewModel,
  getMergedActionableItems,
} from './report-view-model'

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
          status: 'OK',
          expected_total: 121,
          actual_total: 121,
          difference: 0,
          items: [
            buildLineItem({
              date: '29.04.2025',
              day_of_week: 'Tue',
              pay_type: 'Recall_-_T2.0',
              status: 'MATCH',
              expected_units: 2,
              actual_units: 2,
              expected_amount: 121,
              actual_amount: 121,
              difference: 0,
            }),
          ],
        },
      ],
      actionable_items: [underpaid, possiblyMissed],
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
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(2)
    expect(viewModel.totalsAcrossAvacs.daysWithIssues).toBe(2)

    const printModel = buildPrintSummaryModel({
      analysis,
      viewModel,
      reportId: 'r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
    })

    expect(printModel.header.reportId).toBe('r1')
    expect(printModel.snapshot.headline).toContain('Potential underpayment')
    expect(printModel.sections).toHaveLength(2)
    expect(printModel.sections[0].rows).toHaveLength(1)
    expect(printModel.sections[1].rows).toHaveLength(1)

    const payload = buildTroubleshootingPayload({
      reportId: 'r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
      analysis,
      viewModel,
    })

    expect(payload.report_id).toBe('r1')
    expect(payload.employee).toBe('Dr Test')
    expect(payload.high_level_counts.follow_up_items).toBe(1)
  })

  it('does not show all match when not-yet-paid days exist', () => {
    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Test',
      pay_date: '24.06.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 1030.86,
      older_adjustments_total: 0,
      avac_results: [
        {
          avac_name: 'Week 20 AVAC Emre - 16th of June.pdf',
          report: {
            overall_status: 'ALL_MATCH',
            match_count: 3,
            discrepancy_count: 0,
            missing_count: 0,
            unmatched_count: 0,
            not_yet_paid_count: 3,
            possibly_missed_count: 0,
            earliest_adjustment_date: '17.06.2025',
            latest_adjustment_date: '20.06.2025',
            total_expected: 1030.86,
            total_actual: 0,
            total_difference: -1030.86,
            days: [
              {
                date: '17.06.2025',
                day_of_week: 'Tue',
                day_type: 'weekday',
                status: 'NOT_YET_PAID',
                expected_total: 463.54,
                actual_total: 0,
                difference: -463.54,
                items: [
                  buildLineItem({
                    date: '17.06.2025',
                    day_of_week: 'Tue',
                    expected_amount: 463.54,
                    actual_amount: 0,
                    difference: -463.54,
                    status: 'NOT_YET_PAID',
                  }),
                ],
              },
              {
                date: '18.06.2025',
                day_of_week: 'Wed',
                day_type: 'weekday',
                status: 'NOT_YET_PAID',
                expected_total: 463.54,
                actual_total: 0,
                difference: -463.54,
                items: [
                  buildLineItem({
                    date: '18.06.2025',
                    day_of_week: 'Wed',
                    expected_amount: 463.54,
                    actual_amount: 0,
                    difference: -463.54,
                    status: 'NOT_YET_PAID',
                  }),
                ],
              },
              {
                date: '20.06.2025',
                day_of_week: 'Fri',
                day_type: 'weekday',
                status: 'NOT_YET_PAID',
                expected_total: 103.78,
                actual_total: 0,
                difference: -103.78,
                items: [
                  buildLineItem({
                    date: '20.06.2025',
                    day_of_week: 'Fri',
                    expected_amount: 103.78,
                    actual_amount: 0,
                    difference: -103.78,
                    status: 'NOT_YET_PAID',
                  }),
                ],
              },
            ],
            actionable_items: [],
            older_adjustments: [],
            older_adjustments_total: 0,
            unmatched_payslip_entries: [],
          },
        },
      ],
    }

    const viewModel = createReportViewModel(analysis)

    expect(viewModel.topLevelMeta?.label).toBe('Issue identified')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('Issue identified')
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(3)
    expect(viewModel.avacSummaries[0].cleanDays).toHaveLength(0)
  })

  it('adds parse caveats when AVAC files fail to parse', () => {
    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Parse',
      pay_date: '24.06.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 0,
      older_adjustments_total: 0,
      avac_results: [
        { avac_name: 'Week 01.pdf', error: 'Unreadable PDF.' },
        { avac_name: 'Week 02.pdf', error: 'No roster table found.' },
      ],
    }

    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({
      analysis,
      viewModel,
      reportId: 'parse-r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
    })

    expect(printModel.metrics.find((metric) => metric.key === 'parse_errors')?.value).toBe(2)
    expect(printModel.caveats[0]).toContain('2 AVAC files could not be parsed')
    expect(printModel.sections[0].rows).toHaveLength(0)
    expect(printModel.sections[1].rows).toHaveLength(0)
  })

  it('returns correction-specific print data and suppresses action tables', () => {
    const analysis: ReconcileResponseCorrection = {
      status: 'correction_payslip',
      employee: 'Dr Correction',
      pay_date: '24.06.2025',
      adjustment_total: -120,
      avac_results: [],
      message: 'Corrections only for this period.',
      overpayment_amount: 120,
      older_adjustments_total: 0,
    }

    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({
      analysis,
      viewModel,
      reportId: 'corr-r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
    })

    expect(printModel.sections).toHaveLength(0)
    expect(printModel.correctionSummary?.message).toContain('Corrections only')
    expect(printModel.correctionSummary?.overpaymentAmount).toBe(120)
  })

  it('keeps executive next steps for clean reports with no actionable items', () => {
    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Match',
      pay_date: '24.06.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 221,
      older_adjustments_total: 0,
      avac_results: [
        {
          avac_name: 'Week 21.pdf',
          report: {
            overall_status: 'ALL_MATCH',
            match_count: 2,
            discrepancy_count: 0,
            missing_count: 0,
            unmatched_count: 0,
            not_yet_paid_count: 0,
            possibly_missed_count: 0,
            earliest_adjustment_date: '21.06.2025',
            latest_adjustment_date: '22.06.2025',
            total_expected: 221,
            total_actual: 221,
            total_difference: 0,
            days: [
              {
                date: '21.06.2025',
                day_of_week: 'Sat',
                day_type: 'saturday',
                status: 'OK',
                expected_total: 121,
                actual_total: 121,
                difference: 0,
                items: [
                  buildLineItem({
                    date: '21.06.2025',
                    day_of_week: 'Sat',
                    expected_amount: 121,
                    actual_amount: 121,
                    difference: 0,
                    status: 'MATCH',
                  }),
                ],
              },
              {
                date: '22.06.2025',
                day_of_week: 'Sun',
                day_type: 'sunday',
                status: 'OK',
                expected_total: 100,
                actual_total: 100,
                difference: 0,
                items: [
                  buildLineItem({
                    date: '22.06.2025',
                    day_of_week: 'Sun',
                    expected_amount: 100,
                    actual_amount: 100,
                    difference: 0,
                    status: 'MATCH',
                  }),
                ],
              },
            ],
            actionable_items: [],
            older_adjustments: [],
            older_adjustments_total: 0,
            unmatched_payslip_entries: [],
          },
        },
      ],
    }

    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({
      analysis,
      viewModel,
      reportId: 'clean-r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
    })

    expect(viewModel.actionableCount).toBe(0)
    expect(printModel.nextSteps.length).toBeGreaterThan(0)
    expect(printModel.snapshot.headline).toContain('No actionable discrepancy')
  })
})
