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

    await screen.findByRole('heading', { name: 'Reconciliation Report' })
    const printSummaryHeading = screen.getByText('Reconciliation Summary')
    expect(printSummaryHeading).toBeInTheDocument()
    expect(screen.getByText('Coverage and caveats')).toBeInTheDocument()
    expect(printSummaryHeading.closest('section')).toHaveClass('hidden', 'print:block')

    expect(screen.queryByText('Detailed reconciliation totals')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show detailed analysis' }))

    expect(await screen.findByText('Detailed reconciliation totals')).toBeInTheDocument()

    const avacTrigger = screen.getByRole('button', { name: /AVAC Alpha\.pdf/i })
    expect(within(avacTrigger).getAllByText('Issue identified')).toHaveLength(1)

    await user.click(avacTrigger)

    expect(await screen.findByText(/Showing 2 days/)).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Show troubleshooting tools' }))
    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting data' }))

    await waitFor(() => {
      expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0)
    })
  })
})
