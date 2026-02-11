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
}

const summary: AvacDetailSummary = {
  id: 'avac-0',
  avacName: 'Week 19 AVAC.pdf',
  statusKey: 'FOLLOW_UP_REQUIRED',
  statusLabel: 'Follow-up',
  statusClassName: 'bg-amber-50 text-amber-700',
  subtitle: '2 follow-up items',
  actionItemCount: 0,
  followUpCount: 2,
  pendingCheckCount: 1,
  issueDays: [],
  cleanDays: [],
  actionableStatusesByDate: {},
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

    const timingRow = screen.getByText('09.06.2025').closest('tr')
    expect(timingRow).toBeTruthy()
    if (timingRow) {
      expect(within(timingRow).getAllByText('—').length).toBeGreaterThanOrEqual(3)
    }

    const issueRow = screen.getByText('04.06.2025').closest('tr')
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
})
