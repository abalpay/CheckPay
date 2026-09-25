import { describe, expect, it } from 'vitest'

import type {
  AvacReport,
  LineItem,
  ReconcileResponseCorrection,
  ReconcileResponseOk,
} from '@/lib/jobs'

import {
  buildPayrollQueryDraft,
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
    expect(viewModel.needsFollowUpNowRows).toHaveLength(2)
    expect(viewModel.timingCheckRows).toHaveLength(0)
    expect(viewModel.underpaidMissingCount).toBe(1)
    expect(viewModel.decisionState).toBe('ACTION_NOW')
    expect(viewModel.confidenceLevel).toBe('LOW')
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
    expect(printModel.snapshot.headline).toContain('to raise with payroll')
    expect(printModel.snapshot.confidenceLabel).toBe('LOW')
    expect(printModel.sections).toHaveLength(1)
    expect(printModel.sections[0].rows).toHaveLength(2)

    const draft = buildPayrollQueryDraft({ analysis, viewModel })
    expect(draft).toContain('Needs follow-up now: 2')
    expect(draft).toContain('Timing-check items excluded')

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
        status: 'NEEDS_FORTNIGHT_PAYSLIP',
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
      check_previous_count: 0,
      needs_fortnight_payslip_count: 3,
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
          status: 'NEEDS_FORTNIGHT_PAYSLIP',
          expected_total: 300,
          actual_total: 0,
          difference: -300,
          items: [pendingItem('17.06.2025')],
        },
        {
          date: '18.06.2025',
          day_of_week: 'Wed',
          day_type: 'weekday',
          status: 'NEEDS_FORTNIGHT_PAYSLIP',
          expected_total: 300,
          actual_total: 0,
          difference: -300,
          items: [pendingItem('18.06.2025')],
        },
        {
          date: '20.06.2025',
          day_of_week: 'Fri',
          day_type: 'weekday',
          status: 'NEEDS_FORTNIGHT_PAYSLIP',
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

    expect(viewModel.topLevelMeta?.label).toBe('Check other payslips')
    expect(viewModel.decisionState).toBe('CHECK_ADJACENT_PAYSLIP')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('To check')
    expect(viewModel.followUpRows).toHaveLength(0)
    expect(viewModel.timingCheckRows).toHaveLength(3)
    expect(viewModel.actionableCount).toBe(0)
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(0)
    expect(viewModel.avacSummaries[0].cleanDays).toHaveLength(3)
    expect(viewModel.totalsAcrossAvacs.daysWithIssues).toBe(0)
    expect(viewModel.actionableNetDifference).toBe(0)
    expect(viewModel.snapshotHeadline).toContain('No mismatch found')
    expect(viewModel.timingTotals.expected).toBe(900)
    expect(viewModel.inScopeTotals.expected).toBe(0)
    expect(viewModel.nextSteps.join(' ')).toContain('Upload the fortnight payslip')
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

    expect(viewModel.topLevelMeta?.label).toBe('Nothing to raise')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('To check')
    expect(viewModel.followUpRows).toHaveLength(0)
    expect(viewModel.needsFollowUpNowRows).toHaveLength(0)
    expect(viewModel.timingCheckRows).toHaveLength(0)
    expect(viewModel.avacSummaries[0].issueDays).toHaveLength(0)
    expect(viewModel.actionableNetDifference).toBe(0)
    expect(viewModel.actionableGrossDifference).toBe(0)
    expect(viewModel.snapshotHeadline).toContain('No follow-up needed')
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
      status: 'NEEDS_FORTNIGHT_PAYSLIP',
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
            check_previous_count: 0,
            needs_fortnight_payslip_count: 1,
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
                status: 'NEEDS_FORTNIGHT_PAYSLIP',
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

    expect(viewModel.topLevelMeta?.label).toBe('Raise with payroll')
    expect(viewModel.decisionState).toBe('ACTION_NOW')
    expect(viewModel.avacSummaries[0].statusLabel).toBe('Issues found')
    expect(viewModel.followUpRows).toHaveLength(1)
    expect(viewModel.followUpRows[0].status).toBe('UNDERPAID')
    expect(viewModel.timingCheckRows).toHaveLength(1)
    expect(viewModel.pendingCheckCount).toBe(1)
    expect(viewModel.actionableNetDifference).toBe(-40)
    expect(viewModel.totalsAcrossAvacs.daysWithIssues).toBe(1)
    expect(viewModel.nextSteps.join(' ')).toContain('Upload the fortnight payslip')
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
    expect(viewModel.topLevelMeta?.label).toBe('Nothing to raise')
    expect(viewModel.decisionState).toBe('NO_ACTION')
    expect(printModel.nextSteps.length).toBeGreaterThan(0)
    expect(printModel.snapshot.headline).toContain('No follow-up needed')
  })
})

describe('report-view-model: evidence model (multi-payslip)', () => {
  function pendingReport(overrides: Partial<AvacReport> = {}): AvacReport {
    const item = buildLineItem({
      date: '06.01.2026', day_of_week: 'Tue', status: 'NOT_ON_THIS_PAYSLIP', expected_amount: 110, actual_amount: 0, difference: -110,
    })
    return {
      overall_status: 'OK_WITH_ANOMALIES', match_count: 0, discrepancy_count: 0, missing_count: 0, unmatched_count: 0,
      not_on_this_payslip_count: 1, needs_fortnight_payslip_count: 0, within_window_issue_count: 0,
      not_yet_paid_count: 1, possibly_missed_count: 0, earliest_adjustment_date: '', latest_adjustment_date: '',
      total_expected: 110, total_actual: 0, total_difference: 0, reversal_count: 0, informational_difference: 0, pending_expected_total: 110,
      days: [{ date: '06.01.2026', day_of_week: 'Tue', day_type: 'weekday', status: 'NOT_ON_THIS_PAYSLIP', expected_total: 110, actual_total: 0, difference: -110, items: [item] }],
      actionable_items: [item], older_adjustments: [], older_adjustments_total: 0, unmatched_payslip_entries: [],
      ...overrides,
    }
  }

  function analysisWith(report: AvacReport, extra: Partial<ReconcileResponseOk> = {}): ReconcileResponseOk {
    return {
      status: 'ok', employee: 'Dr Test', pay_date: '26.03.2026', base_rate: 60, is_overpayment_payslip: false,
      adjustment_total: 0, older_adjustments_total: 0, avac_results: [{ avac_name: 'Week 2.pdf', report }], ...extra,
    }
  }

  it('lists unpaid weeks as one neutral next step with their expected total, not per claim', () => {
    const viewModel = createReportViewModel(analysisWith(pendingReport(), {
      unpaid_weeks: [
        { week_start: '05.01.2026', avac_name: 'Week 2.pdf', expected_total: 110, age_days: 80 },
        { week_start: '12.01.2026', avac_name: 'Week 3.pdf', expected_total: 90.5, age_days: 73 },
      ],
    }))
    const steps = viewModel.nextSteps.join('\n')
    expect(steps).toContain('2 AVAC weeks are not on any uploaded payslip (about $200.50 outstanding)')
    expect(steps).toContain('older than 10 weeks')
    expect(steps).not.toContain('claim is not on the uploaded payslip')
    expect(viewModel.decisionState).toBe('CHECK_ADJACENT_PAYSLIP')
    expect(viewModel.unpaidWeeks).toHaveLength(2)
  })

  it('keeps the per-claim step when the backend sent no unpaid_weeks (older sessions)', () => {
    const viewModel = createReportViewModel(analysisWith(pendingReport()))
    expect(viewModel.nextSteps.join('\n')).toContain('1 claim is not on the uploaded payslip')
    expect(viewModel.unpaidWeeks).toEqual([])
  })

  it('describes pending claims with the evidence model, not an adjustment window', () => {
    const viewModel = createReportViewModel(analysisWith(pendingReport()))
    expect(`${viewModel.decisionDetail} ${viewModel.confidenceDetail}`).not.toMatch(/window/i)
  })

  it('surfaces reversals, informational amounts and payslip coverage in the payroll context', () => {
    const report = pendingReport({ reversal_count: 2, informational_difference: -21.5 })
    const viewModel = createReportViewModel(analysisWith(report, {
      payslips: [{ pay_date: '12.03.2026' }, { pay_date: '26.03.2026' }],
    }))
    expect(viewModel.payrollContext).toMatchObject({
      reversalCount: 2,
      notOnThisPayslipCount: 1,
      needsFortnightCount: 0,
      payslipCount: 2,
    })
    expect(viewModel.totalsAcrossAvacs.informationalDifference).toBe(-21.5)
    expect(viewModel.totalsAcrossAvacs.reversalCount).toBe(2)
    expect(viewModel.nextSteps.join('\n')).toContain('Payroll reversed 2 lines')
  })

  it('labels print coverage with actionable difference, not window difference', () => {
    const analysis = analysisWith(pendingReport())
    const viewModel = createReportViewModel(analysis)
    const print = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r', reportCreatedAt: null })
    const labels = print.coverage.map((c) => c.label).join('|')
    expect(labels).not.toMatch(/window/i)
    expect(labels).toContain('Difference to raise')
    expect(print.sections.map((s) => s.subtitle).join(' ')).not.toMatch(/window/i)
  })

  it('never lets the informational reversal step displace an action', () => {
    const fortnight = buildLineItem({ date: '07.01.2026', status: 'NEEDS_FORTNIGHT_PAYSLIP', expected_amount: 50, actual_amount: 0, difference: -50 })
    const underpaid = buildLineItem({ date: '08.01.2026', status: 'UNDERPAID', expected_amount: 100, actual_amount: 40, difference: -60 })
    const base = pendingReport({ reversal_count: 1, needs_fortnight_payslip_count: 1, discrepancy_count: 1 })
    const report: AvacReport = {
      ...base,
      days: [
        ...base.days,
        { date: '07.01.2026', day_of_week: 'Wed', day_type: 'weekday', status: 'NEEDS_FORTNIGHT_PAYSLIP', expected_total: 50, actual_total: 0, difference: -50, items: [fortnight] },
        { date: '08.01.2026', day_of_week: 'Thu', day_type: 'weekday', status: 'UNDERPAID', expected_total: 100, actual_total: 40, difference: -60, items: [underpaid] },
      ],
      actionable_items: [...base.actionable_items, fortnight, underpaid],
    }
    const steps = createReportViewModel(analysisWith(report, {
      unpaid_weeks: [{ week_start: '05.01.2026', avac_name: 'Week 2.pdf', expected_total: 110, age_days: 80 }],
    })).nextSteps

    expect(steps[0]).toContain('Raise a payroll query for 1 underpaid or missing line')
    expect(steps[1]).toContain('Upload the fortnight payslip')
    expect(steps[2]).toContain('AVAC week is not on any uploaded payslip')
    expect(steps.at(-1)).toContain('Print the summary')
    expect(steps.join('\n')).not.toContain('Payroll reversed')
  })

  it('shows one number for a pending claim that page 1 already part-paid', () => {
    const item = buildLineItem({
      date: '06.01.2026', day_of_week: 'Tue', status: 'NOT_ON_THIS_PAYSLIP', expected_amount: 216, actual_amount: 36, difference: -180,
    })
    const report = pendingReport({
      pending_expected_total: 180,
      days: [{ date: '06.01.2026', day_of_week: 'Tue', day_type: 'weekday', status: 'NOT_ON_THIS_PAYSLIP', expected_total: 216, actual_total: 36, difference: -180, items: [item] }],
      actionable_items: [item],
    })
    const viewModel = createReportViewModel(analysisWith(report, {
      unpaid_weeks: [{ week_start: '05.01.2026', avac_name: 'Week 2.pdf', expected_total: 180, age_days: 30 }],
    }))
    expect(viewModel.timingTotals.expected).toBe(180)
    expect(viewModel.nextSteps.join('\n')).toContain('(about $180.00 outstanding)')
  })

  it('puts the payroll query before neutral pending steps', () => {
    const underpaid = buildLineItem({ date: '08.01.2026', status: 'UNDERPAID', expected_amount: 100, actual_amount: 40, difference: -60 })
    const base = pendingReport({ discrepancy_count: 1 })
    const report: AvacReport = {
      ...base,
      days: [...base.days, { date: '08.01.2026', day_of_week: 'Thu', day_type: 'weekday', status: 'UNDERPAID', expected_total: 100, actual_total: 40, difference: -60, items: [underpaid] }],
      actionable_items: [...base.actionable_items, underpaid],
    }
    const steps = createReportViewModel(analysisWith(report, {
      unpaid_weeks: [{ week_start: '05.01.2026', avac_name: 'Week 2.pdf', expected_total: 110, age_days: 80 }],
    })).nextSteps
    const raise = steps.findIndex((s) => s.startsWith('Raise a payroll query'))
    const week = steps.findIndex((s) => s.includes('not on any uploaded payslip'))
    expect(raise).toBe(0)
    expect(week).toBeGreaterThan(raise)
  })

  it('adds the reversal step on a clean report', () => {
    const clean = pendingReport({ reversal_count: 1, not_on_this_payslip_count: 0, days: [], actionable_items: [] })
    expect(createReportViewModel(analysisWith(clean)).nextSteps[0]).toContain('Payroll reversed 1 line')
  })

  it('says "your payslips" only when several payslips were uploaded', () => {
    const single = createReportViewModel(analysisWith(pendingReport()))
    const multi = createReportViewModel(analysisWith(pendingReport(), { payslips: [{ pay_date: '12.03.2026' }, { pay_date: '26.03.2026' }] }))
    expect(single.decisionHeadline).toBe('No mismatch found on this payslip.')
    expect(multi.decisionHeadline).toBe('No mismatch found on your payslips.')

    const underpaid = buildLineItem({ date: '08.01.2026', status: 'UNDERPAID', expected_amount: 100, actual_amount: 40, difference: -60 })
    const actionReport = pendingReport({
      days: [{ date: '08.01.2026', day_of_week: 'Thu', day_type: 'weekday', status: 'UNDERPAID', expected_total: 100, actual_total: 40, difference: -60, items: [underpaid] }],
      actionable_items: [underpaid], not_on_this_payslip_count: 0, discrepancy_count: 1,
    })
    const one = analysisWith(actionReport, { payslips: [{ pay_date: '26.03.2026' }] })
    const two = analysisWith(actionReport, { payslips: [{ pay_date: '12.03.2026' }, { pay_date: '26.03.2026' }] })
    expect(createReportViewModel(one).decisionDetail).toContain('not paid as expected on this payslip')
    const multiAction = createReportViewModel(two)
    expect(multiAction.decisionDetail).toContain('not paid as expected on your payslips')
    const print = buildPrintSummaryModel({ analysis: two, viewModel: multiAction, reportId: 'r', reportCreatedAt: null })
    expect(print.sections[0].subtitle).toContain('on your payslips')
  })
})
