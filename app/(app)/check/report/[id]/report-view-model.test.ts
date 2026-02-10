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
  it('uses a single follow-up queue and print section', () => {
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
      pay_period_start: '22.04.2025',
      pay_period_end: '05.05.2025',
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
    expect(viewModel.payrollActionCount).toBe(1)
    expect(viewModel.followUpRows).toHaveLength(2)
    expect(viewModel.underpaidMissingCount).toBe(1)
    expect(viewModel.avacSummaries[0].subtitle).toContain('2 follow-up items')
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
    expect(printModel.sections).toHaveLength(1)
    expect(printModel.sections[0].rows).toHaveLength(2)

    const payload = buildTroubleshootingPayload({
      reportId: 'r1',
      reportCreatedAt: '2026-02-10T00:00:00.000Z',
      analysis,
      viewModel,
    })

    expect(payload.report_id).toBe('r1')
    expect(payload.employee).toBe('Dr Test')
    expect(payload.high_level_counts.payroll_action_items).toBe(1)
    expect(payload.high_level_counts.follow_up_items).toBe(2)
  })

  it('keeps pending-only outcomes out of issue-day and underpayment counts while showing follow-up badges', () => {
    const pendingItem = (date: string): LineItem =>
      buildLineItem({
        date,
        status: 'CHECK_PREVIOUS',
        pay_type: 'Recall_-_T2.0',
        expected_amount: 300,
        actual_amount: 0,
        difference: -300,
      })

    const report: AvacReport = {
      overall_status: 'OK_WITH_ANOMALIES',
      match_count: 0,
      discrepancy_count: 0,
      missing_count: 0,
      unmatched_count: 0,
      check_previous_count: 3,
      check_future_count: 0,
      within_window_issue_count: 0,
      not_yet_paid_count: 0,
      possibly_missed_count: 0,
      earliest_adjustment_date: '17.06.2025',
      latest_adjustment_date: '20.06.2025',
      total_expected: 900,
      total_actual: 0,
      total_difference: -900,
      days: [
        {
          date: '17.06.2025',
          day_of_week: 'Tue',
          day_type: 'weekday',
          status: 'CHECK_PREVIOUS',
          expected_total: 300,
          actual_total: 0,
          difference: -300,
          items: [pendingItem('17.06.2025')],
        },
        {
          date: '18.06.2025',
          day_of_week: 'Wed',
          day_type: 'weekday',
          status: 'CHECK_PREVIOUS',
          expected_total: 300,
          actual_total: 0,
          difference: -300,
          items: [pendingItem('18.06.2025')],
        },
        {
          date: '20.06.2025',
          day_of_week: 'Fri',
          day_type: 'weekday',
          status: 'CHECK_PREVIOUS',
          expected_total: 300,
          actual_total: 0,
          difference: -300,
          items: [pendingItem('20.06.2025')],
        },
      ],
      actionable_items: [pendingItem('17.06.2025'), pendingItem('18.06.2025'), pendingItem('20.06.2025')],
      older_adjustments: [],
      older_adjustments_total: 0,
      unmatched_payslip_entries: [],
    }

    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Pending',
      pay_date: '24.06.2025',
      pay_period_start: '09.06.2025',
      pay_period_end: '22.06.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 900,
      older_adjustments_total: 0,
      avac_results: [{ avac_name: 'Pending AVAC.pdf', report }],
    }

    const viewModel = createReportViewModel(analysis)

    expect(viewModel.topLevelMeta?.label).toBe('Follow-up')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('Follow-up')
    expect(viewModel.followUpRows).toHaveLength(0)
    expect(viewModel.actionableCount).toBe(0)
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(0)
    expect(viewModel.avacSummaries[0].cleanDays).toHaveLength(3)
    expect(viewModel.totalsAcrossAvacs.daysWithIssues).toBe(0)
    expect(viewModel.actionableNetDifference).toBe(0)
    expect(viewModel.snapshotHeadline).toContain('No actionable discrepancy')
    expect(viewModel.nextSteps.join(' ')).toContain('previous payslip')
  })

  it('shows reversal rows in follow-up while excluding reversal amounts from discrepancy math', () => {
    const reversal = buildLineItem({
      date: '14.07.2025',
      day_of_week: 'Mon',
      status: 'REVERSAL',
      expected_amount: 120,
      actual_amount: -120,
      difference: -240,
    })

    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Reversal',
      pay_date: '22.07.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: -120,
      older_adjustments_total: 0,
      avac_results: [
        {
          avac_name: 'Reversal AVAC.pdf',
          report: {
            overall_status: 'OK_WITH_ANOMALIES',
            match_count: 0,
            discrepancy_count: 0,
            missing_count: 0,
            unmatched_count: 1,
            check_previous_count: 0,
            check_future_count: 0,
            within_window_issue_count: 0,
            not_yet_paid_count: 0,
            possibly_missed_count: 0,
            earliest_adjustment_date: '14.07.2025',
            latest_adjustment_date: '14.07.2025',
            total_expected: 120,
            total_actual: -120,
            total_difference: -240,
            days: [
              {
                date: '14.07.2025',
                day_of_week: 'Mon',
                day_type: 'weekday',
                status: 'ANOMALY',
                expected_total: 120,
                actual_total: -120,
                difference: -240,
                items: [reversal],
              },
            ],
            actionable_items: [reversal],
            older_adjustments: [],
            older_adjustments_total: 0,
            unmatched_payslip_entries: [],
          },
        },
      ],
    }

    const viewModel = createReportViewModel(analysis)

    expect(viewModel.topLevelMeta?.label).toBe('Follow-up')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('Follow-up')
    expect(viewModel.followUpRows).toHaveLength(1)
    expect(viewModel.followUpRows[0].status).toBe('REVERSAL')
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(0)
    expect(viewModel.actionableNetDifference).toBe(0)
    expect(viewModel.actionableGrossDifference).toBe(0)
    expect(viewModel.snapshotHeadline).toContain('Follow-up review required')
  })

  it('keeps issue status when discrepancy exists alongside pending checks and excludes pending from math', () => {
    const underpaid = buildLineItem({
      date: '04.08.2025',
      status: 'UNDERPAID',
      expected_amount: 140,
      actual_amount: 100,
      difference: -40,
    })
    const checkPrevious = buildLineItem({
      date: '05.08.2025',
      status: 'CHECK_PREVIOUS',
      expected_amount: 200,
      actual_amount: 0,
      difference: -200,
    })

    const analysis: ReconcileResponseOk = {
      status: 'ok',
      employee: 'Dr Mixed',
      pay_date: '12.08.2025',
      base_rate: 60.5,
      is_overpayment_payslip: false,
      adjustment_total: 340,
      older_adjustments_total: 0,
      avac_results: [
        {
          avac_name: 'Mixed AVAC.pdf',
          report: {
            overall_status: 'DISCREPANCIES_FOUND',
            match_count: 0,
            discrepancy_count: 1,
            missing_count: 0,
            unmatched_count: 0,
            check_previous_count: 1,
            check_future_count: 0,
            within_window_issue_count: 0,
            not_yet_paid_count: 0,
            possibly_missed_count: 0,
            earliest_adjustment_date: '04.08.2025',
            latest_adjustment_date: '05.08.2025',
            total_expected: 340,
            total_actual: 100,
            total_difference: -240,
            days: [
              {
                date: '04.08.2025',
                day_of_week: 'Mon',
                day_type: 'weekday',
                status: 'UNDERPAID',
                expected_total: 140,
                actual_total: 100,
                difference: -40,
                items: [underpaid],
              },
              {
                date: '05.08.2025',
                day_of_week: 'Tue',
                day_type: 'weekday',
                status: 'CHECK_PREVIOUS',
                expected_total: 200,
                actual_total: 0,
                difference: -200,
                items: [checkPrevious],
              },
            ],
            actionable_items: [underpaid, checkPrevious],
            older_adjustments: [],
            older_adjustments_total: 0,
            unmatched_payslip_entries: [],
          },
        },
      ],
    }

    const viewModel = createReportViewModel(analysis)

    expect(viewModel.topLevelMeta?.label).toBe('Issue')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('Issue')
    expect(viewModel.followUpRows).toHaveLength(1)
    expect(viewModel.followUpRows[0].status).toBe('UNDERPAID')
    expect(viewModel.pendingCheckCount).toBe(1)
    expect(viewModel.actionableNetDifference).toBe(-40)
    expect(viewModel.totalsAcrossAvacs.daysWithIssues).toBe(1)
    expect(viewModel.nextSteps.join(' ')).toContain('previous payslip')
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
    expect(printModel.sections).toHaveLength(1)
    expect(printModel.sections[0].rows).toHaveLength(0)
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
    expect(viewModel.topLevelMeta?.label).toBe('OK')
    expect(printModel.nextSteps.length).toBeGreaterThan(0)
    expect(printModel.snapshot.headline).toContain('No actionable discrepancy')
  })
})
