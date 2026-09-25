import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReportPerAvacDetails } from './ReportPerAvacDetails'
import type { AvacDetailSummary, PayrollContextModel, TotalsAcrossAvacs } from '../report-view-model'

const totals: TotalsAcrossAvacs = {
  totalExpected: 223.78,
  totalActual: 0,
  totalDifference: -223.78,
  inScopeExpected: 120,
  inScopeActual: 0,
  inScopeDifference: -120,
  inScopeDays: 1,
  timingExpected: 103.78,
  timingActual: 0,
  timingDifference: -103.78,
  timingDays: 1,
  matchCount: 0,
  discrepancyCount: 0,
  missingCount: 0,
  unmatchedCount: 0,
  notYetPaidCount: 1,
  daysVerified: 1,
  daysWithIssues: 1,
  totalLineItems: 2,
  earliestAdjustmentDate: '28.04.2025',
  latestAdjustmentDate: '05.06.2025',
  reversalCount: 0,
  informationalDifference: 0,
}

const payrollContext: PayrollContextModel = {
  parsedAvacs: '1/1',
  notYetPaidCount: 1,
  checkPreviousCount: 0,
  checkFutureCount: 1,
  withinWindowIssueCount: 1,
  earliestAdjustmentDate: '28.04.2025',
  latestAdjustmentDate: '05.06.2025',
  payPeriodStart: '02.06.2025',
  payPeriodEnd: '15.06.2025',
  adjustmentTotal: 0,
  baseRate: 60.5,
  olderAdjustmentsTotal: 0,
  reversalCount: 1,
  notOnThisPayslipCount: 1,
  needsFortnightCount: 0,
  payslipCount: 2,
}

const summary: AvacDetailSummary = {
  id: 'avac-0',
  avacName: 'Week 19 AVAC.pdf',
  statusKey: 'FOLLOW_UP_REQUIRED',
  statusLabel: 'To check',
  subtitle: '2 follow-up items',
  actionItemCount: 0,
  followUpCount: 2,
  pendingCheckCount: 1,
  issueDays: [],
  cleanDays: [],
  actionableStatusesByDate: new Map(),
  report: {
    overall_status: 'OK_WITH_ANOMALIES',
    match_count: 0,
    discrepancy_count: 0,
    missing_count: 0,
    unmatched_count: 0,
    check_previous_count: 0,
    check_future_count: 1,
    within_window_issue_count: 1,
    not_yet_paid_count: 1,
    possibly_missed_count: 1,
    earliest_adjustment_date: '28.04.2025',
    latest_adjustment_date: '05.06.2025',
    total_expected: 223.78,
    total_actual: 0,
    total_difference: -223.78,
    days: [
      {
        date: '09.06.2025',
        day_of_week: 'Mon',
        day_type: 'weekday',
        status: 'CHECK_FUTURE',
        expected_total: 103.78,
        actual_total: 0,
        difference: -103.78,
        items: [
          {
            date: '09.06.2025',
            day_of_week: 'Mon',
            pay_type: 'Overtime_-_1.5',
            status: 'CHECK_FUTURE',
            expected_units: 1,
            actual_units: 0,
            expected_amount: 103.78,
            actual_amount: 0,
            difference: -103.78,
            notes: 'Check future payslip.',
          },
        ],
      },
      {
        date: '04.06.2025',
        day_of_week: 'Wed',
        day_type: 'weekday',
        status: 'ISSUE_WITHIN_WINDOW',
        expected_total: 120,
        actual_total: 0,
        difference: -120,
        items: [
          {
            date: '04.06.2025',
            day_of_week: 'Wed',
            pay_type: 'Recall_-_T2.0',
            status: 'ISSUE_WITHIN_WINDOW',
            expected_units: 2,
            actual_units: 0,
            expected_amount: 120,
            actual_amount: 0,
            difference: -120,
            notes: 'Within window with no payslip entry.',
          },
        ],
      },
    ],
    actionable_items: [],
    older_adjustments: [],
    older_adjustments_total: 0,
    unmatched_payslip_entries: [],
  },
}

function summaryFor(id: string, firstDate: string): AvacDetailSummary {
  const day = { date: firstDate, day_of_week: 'Mon', day_type: 'weekday', status: 'OK', expected_total: 0, actual_total: 0, difference: 0, items: [] }
  return {
    id, avacName: `${id}.pdf`, statusKey: 'ALL_MATCH', statusLabel: 'All matched', subtitle: '1 day', actionItemCount: 0, followUpCount: 0,
    pendingCheckCount: 0, issueDays: [], cleanDays: [day], actionableStatusesByDate: new Map(),
    report: { overall_status: 'ALL_MATCH', match_count: 1, discrepancy_count: 0, missing_count: 0, unmatched_count: 0, not_yet_paid_count: 0,
      possibly_missed_count: 0, earliest_adjustment_date: firstDate, latest_adjustment_date: firstDate, total_expected: 0, total_actual: 0,
      total_difference: 0, days: [day], actionable_items: [], older_adjustments: [], older_adjustments_total: 0, unmatched_payslip_entries: [] },
  }
}

describe('ReportPerAvacDetails', () => {
  it('uses placeholders for timing-check rows while keeping in-window issues money-visible', async () => {
    const user = userEvent.setup()
    render(
      <ReportPerAvacDetails
        summaries={[summary]}
        totals={totals}
        payrollContext={payrollContext}
        onCopyTroubleshooting={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Week 19 AVAC\.pdf/i }))

    const timingRow = screen.getByText('Mon 9 Jun 2025').closest('tr')
    expect(timingRow).toBeTruthy()
    if (timingRow) {
      expect(within(timingRow).getAllByText('—').length).toBeGreaterThanOrEqual(3)
    }

    const issueRow = screen.getByText('Wed 4 Jun 2025').closest('tr')
    expect(issueRow).toBeTruthy()
    if (issueRow) {
      expect(within(issueRow).getByText('$120.00')).toBeInTheDocument()
      expect(within(issueRow).getByText('-$120.00')).toBeInTheDocument()
    }
  })

  it('hides troubleshooting tools when disabled', () => {
    render(
      <ReportPerAvacDetails
        summaries={[summary]}
        totals={totals}
        payrollContext={payrollContext}
        showTroubleshooting={false}
      />
    )

    expect(screen.queryByText('Troubleshooting data')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy troubleshooting data' })).not.toBeInTheDocument()
  })

  it('shows an ANOMALY day with its difference and marks amounts that are not counted', async () => {
    const user = userEvent.setup()
    const anomaly: AvacDetailSummary = {
      ...summary,
      id: 'avac-1',
      avacName: 'Reversal AVAC.pdf',
      report: {
        ...summary.report!,
        days: [
          {
            date: '14.07.2025', day_of_week: 'Mon', day_type: 'weekday', status: 'ANOMALY',
            expected_total: 400, actual_total: 10, difference: -270,
            items: [
              { date: '14.07.2025', day_of_week: 'Mon', pay_type: 'Overtime_-_1.5', status: 'UNDERPAID', expected_units: 4, actual_units: 0, expected_amount: 270, actual_amount: 0, difference: -270, notes: '' },
              { date: '14.07.2025', day_of_week: 'Mon', pay_type: 'Recall_-', status: 'REVERSAL', expected_units: 0, actual_units: -2, expected_amount: 0, actual_amount: -120, difference: -120, notes: '' },
              { date: '14.07.2025', day_of_week: 'Mon', pay_type: 'Recall_NET_Total', status: 'INFO', expected_units: 0, actual_units: 0, expected_amount: 0, actual_amount: 0, difference: -999, notes: '' },
            ],
          },
        ],
      },
    }
    render(<ReportPerAvacDetails summaries={[anomaly]} totals={{ ...totals, informationalDifference: -120 }} payrollContext={payrollContext} />)
    await user.click(screen.getByRole('button', { name: /Reversal AVAC\.pdf/i }))

    const row = screen.getByText('Mon 14 Jul 2025').closest('tr')!
    expect(within(row).getByText('-$270.00')).toBeInTheDocument()
    expect(within(row).getByText('-$120.00 not counted')).toBeInTheDocument()
    expect(screen.getByText('Not counted (info, thresholds, reversals)')).toBeInTheDocument()
  })

  it('describes the payroll context with the evidence model', () => {
    render(<ReportPerAvacDetails summaries={[summary]} totals={totals} payrollContext={payrollContext} />)
    expect(screen.queryByText('Claims before window')).not.toBeInTheDocument()
    expect(screen.queryByText('Claims after window')).not.toBeInTheDocument()
    const reversals = screen.getByText('Reversals by payroll').closest('div')!
    expect(reversals).toHaveTextContent('1')
    expect(screen.getByText('Payslips uploaded').closest('div')).toHaveTextContent('2')
    expect(screen.getByText('Not on any uploaded payslip').closest('div')).toHaveTextContent('1')
  })

  it('shows no note on a matched day with a tolerance gap, and the split amount on a threshold day', async () => {
    const user = userEvent.setup()
    const line = (status: string, difference: number, pay_type = 'Recall_-') => ({
      date: '15.07.2025', day_of_week: 'Tue', pay_type, status, expected_units: 1, actual_units: 1,
      expected_amount: 100, actual_amount: 100 + difference, difference, notes: '',
    })
    const days = {
      ...summary,
      id: 'avac-2',
      avacName: 'Mixed AVAC.pdf',
      report: {
        ...summary.report!,
        days: [
          { date: '15.07.2025', day_of_week: 'Tue', day_type: 'weekday', status: 'OK', expected_total: 100, actual_total: 100.05, difference: 0, items: [line('MATCH', 0.05)] },
          { date: '16.07.2025', day_of_week: 'Wed', day_type: 'weekday', status: 'OK', expected_total: 200, actual_total: 236.4, difference: 0,
            items: [{ ...line('THRESHOLD_SPLIT', 36.4), date: '16.07.2025' }, { ...line('MATCH', 0), date: '16.07.2025' }] },
        ],
      },
    }
    render(<ReportPerAvacDetails summaries={[days]} totals={totals} payrollContext={payrollContext} />)
    await user.click(screen.getByRole('button', { name: /Mixed AVAC\.pdf/i }))

    expect(within(screen.getByText('Tue 15 Jul 2025').closest('tr')!).queryByText(/not counted/)).toBeNull()
    expect(within(screen.getByText('Wed 16 Jul 2025').closest('tr')!).getByText('+$36.40 not counted')).toBeInTheDocument()
  })

  it('groups AVAC files by the month of their first day and puts unreadable files last, when several payslips were uploaded', () => {
    const unreadable: AvacDetailSummary = { ...summaryFor('bad', ''), report: undefined, error: 'Could not process this AVAC file.', statusKey: 'PARSE_ERROR', statusLabel: 'Could not read', cleanDays: [] }
    render(<ReportPerAvacDetails summaries={[summaryFor('w23', '02.06.2025'), summaryFor('w15', '07.04.2025'), unreadable]} totals={totals} payrollContext={payrollContext} showTroubleshooting={false} byMonth />)
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['April 2025', 'June 2025', 'Files that could not be read'])
  })

  it('shows no month headings for a single month', () => {
    render(<ReportPerAvacDetails summaries={[summaryFor('w1', '02.06.2025'), summaryFor('w2', '09.06.2025')]} totals={totals} payrollContext={payrollContext} showTroubleshooting={false} byMonth />)
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('never groups by month for a single payslip, even when AVAC files span months (e.g. a fortnight crossing Dec/Jan)', () => {
    render(
      <ReportPerAvacDetails
        summaries={[summaryFor('w2', '09.01.2026'), summaryFor('w1', '30.12.2025')]}
        totals={totals}
        payrollContext={payrollContext}
        showTroubleshooting={false}
        // byMonth omitted: defaults to false, exactly as page.tsx passes for a single-payslip report.
      />
    )
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('labels the undated group "Undated", not "Files that could not be read", when its files have reports but no readable date', () => {
    const noDate: AvacDetailSummary = { ...summaryFor('nodate', ''), cleanDays: [] }
    render(
      <ReportPerAvacDetails
        summaries={[summaryFor('w23', '02.06.2025'), summaryFor('w15', '07.04.2025'), noDate]}
        totals={totals}
        payrollContext={payrollContext}
        showTroubleshooting={false}
        byMonth
      />
    )
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['April 2025', 'June 2025', 'Undated'])
  })
})
