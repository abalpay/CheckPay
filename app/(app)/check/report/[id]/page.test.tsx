import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReconcileResponseOk } from '@/lib/jobs'

const mockGetSessionReportById = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
let clipboardWriteText = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/session-reports', () => ({
  getSessionReportById: (...args: unknown[]) => mockGetSessionReportById(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

import ReportPage from './page'

function buildAnalysis(): ReconcileResponseOk {
  return {
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
      {
        avac_name: 'AVAC Alpha.pdf',
        report: {
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
              date: '29.04.2025',
              day_of_week: 'Tue',
              day_type: 'weekday',
              status: 'OK',
              expected_total: 121,
              actual_total: 121,
              difference: 0,
              items: [
                {
                  date: '29.04.2025',
                  day_of_week: 'Tue',
                  pay_type: 'Recall_-_T2.0',
                  status: 'MATCH',
                  expected_units: 2,
                  actual_units: 2,
                  expected_amount: 121,
                  actual_amount: 121,
                  difference: 0,
                  notes: 'Within adjustment window with no payment.',
                },
              ],
            },
            {
              date: '30.04.2025',
              day_of_week: 'Wed',
              day_type: 'weekday',
              status: 'OK',
              expected_total: 100,
              actual_total: 100,
              difference: 0,
              items: [
                {
                  date: '30.04.2025',
                  day_of_week: 'Wed',
                  pay_type: 'Overtime_-_1.5',
                  status: 'MATCH',
                  expected_units: 1,
                  actual_units: 1,
                  expected_amount: 100,
                  actual_amount: 100,
                  difference: 0,
                  notes: '',
                },
              ],
            },
          ],
          actionable_items: [
            {
              date: '29.04.2025',
              day_of_week: 'Tue',
              pay_type: 'Recall_-_T2.0',
              status: 'POSSIBLY_MISSED',
              expected_units: 2,
              actual_units: 0,
              expected_amount: 121,
              actual_amount: 0,
              difference: -121,
              notes: 'Within adjustment window with no payment.',
            },
          ],
          older_adjustments: [],
          older_adjustments_total: 0,
          unmatched_payslip_entries: [],
        },
      },
    ],
  }
}

describe('ReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(window, 'print', {
      value: vi.fn(),
      configurable: true,
    })

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: clipboardWriteText,
      },
      configurable: true,
    })

    mockGetSessionReportById.mockReturnValue({
      id: 'r1',
      createdAt: '2026-02-10T00:00:00.000Z',
      analysis: buildAnalysis(),
    })
  })

  it('supports default and detailed modes with human-readable labels and troubleshooting copy', async () => {
    const user = userEvent.setup()

    render(<ReportPage params={Promise.resolve({ id: 'r1' })} />)

    await screen.findByRole('heading', { level: 1, name: '1 item to raise with payroll.' })
    expect(screen.getByText('Overtime reconciliation report')).toBeInTheDocument()
    const verdict = screen.getByRole('region', { name: '1 item to raise with payroll.' })
    expect(within(verdict).getByText('Dr Test')).toBeInTheDocument()
    expect(within(verdict).getByText('6 May 2025')).toBeInTheDocument()
    expect(within(verdict).getByText('Possibly underpaid')).toBeInTheDocument()
    // Once on screen, once in the print-only summary.
    expect(screen.getAllByRole('heading', { name: 'Raise with payroll' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: 'What to do next' })).toHaveLength(2)
    expect(screen.queryByText('How this report was assessed')).not.toBeInTheDocument()
    const printSummaryHeading = screen.getByText('Reconciliation Summary')
    expect(printSummaryHeading).toBeInTheDocument()
    expect(screen.getByText('Coverage and caveats')).toBeInTheDocument()
    expect(printSummaryHeading.closest('section')).toHaveClass('hidden', 'print:block')

    expect(screen.queryByText('Totals for this payslip')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show breakdown' }))

    expect(await screen.findByText('Totals for this payslip')).toBeInTheDocument()
    expect(screen.getByText('How this report was assessed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy payroll query draft' })).not.toBeInTheDocument()

    const avacTrigger = screen.getByRole('button', { name: /AVAC Alpha\.pdf/i })
    expect(within(avacTrigger).getAllByText('Issues found')).toHaveLength(1)

    await user.click(avacTrigger)

    expect(await screen.findByText('2 days on AVAC Alpha.pdf')).toBeInTheDocument()
    expect(screen.getAllByText('Weekday').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Possibly missed').length).toBeGreaterThan(0)
    expect(screen.queryByText('POSSIBLY_MISSED')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clean days/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Print summary' }))
    expect(window.print).toHaveBeenCalledTimes(1)

    const renderedTables = screen.getAllByRole('table')
    expect(
      renderedTables.some((table) => table.classList.contains('print-summary-table'))
    ).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting data' }))

    await waitFor(() => {
      expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0)
    })
  })

  it('renders sample report in read-only mode with banner and print disclaimer', async () => {
    const user = userEvent.setup()

    render(<ReportPage params={Promise.resolve({ id: 'sample' })} />)

    await screen.findByRole('heading', { level: 1, name: '2 items to raise with payroll.' })
    expect(screen.getByText('Sample report preview — fictional data, not your payroll result.')).toBeInTheDocument()
    const verdict = screen.getByRole('region', { name: '2 items to raise with payroll.' })
    expect(within(verdict).getByText('Dr Sample')).toBeInTheDocument()
    expect(within(verdict).getByText('15 Jan 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print summary' })).toBeInTheDocument()
    expect(
      screen.getByText('Sample data preview - not a personal payroll assessment.')
    ).toBeInTheDocument()
    expect(mockGetSessionReportById).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Show breakdown' }))

    expect(await screen.findByText('Totals for this payslip')).toBeInTheDocument()
    expect(screen.queryByText('Troubleshooting data')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy troubleshooting data' })).not.toBeInTheDocument()

    const week1Trigger = screen.getByRole('button', { name: /AVAC Week 1\.pdf/i })
    const week2Trigger = screen.getByRole('button', { name: /AVAC Week 2\.pdf/i })

    expect(within(week1Trigger).getByText('Issues found')).toBeInTheDocument()
    expect(within(week1Trigger).getByText(/follow-up items/i)).toBeInTheDocument()
    expect(within(week2Trigger).getByText('To check')).toBeInTheDocument()
    expect(within(week2Trigger).getByText(/pending checks/i)).toBeInTheDocument()

    await user.click(week2Trigger)
    expect(screen.getAllByText('Check next payslip').length).toBeGreaterThan(0)
  })
})
