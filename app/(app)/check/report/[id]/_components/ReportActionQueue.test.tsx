import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { ActionableRow } from '../report-view-model'
import { ReportActionQueue } from './ReportActionQueue'

function buildTimingRow(index: number): ActionableRow {
  const day = String(index + 1).padStart(2, '0')
  const date = `${day}.06.2025`
  return {
    date,
    day_of_week: 'Mon',
    pay_type: 'Overtime_-_1.5',
    status: 'CHECK_FUTURE',
    expected_units: 1,
    actual_units: 0,
    expected_amount: 120,
    actual_amount: 0,
    difference: -120,
    notes: 'Check future payslip',
    avacName: 'Week 19 AVAC.pdf',
    issueLabel: 'Check future',
    recommendedAction: 'Check a future payslip for this date.',
    displayPayType: 'Overtime (1.5x)',
    category: 'timing_check',
  }
}

describe('ReportActionQueue', () => {
  it('shows first five timing-check dates and expands on show all', async () => {
    const user = userEvent.setup()
    const timingRows = Array.from({ length: 6 }, (_, index) => buildTimingRow(index))

    render(
      <ReportActionQueue
        needsFollowUpNowRows={[]}
        timingCheckRows={timingRows}
      />
    )

    expect(screen.queryByRole('button', { name: 'Copy payroll query draft' })).not.toBeInTheDocument()
    expect(screen.queryByText('AVAC claims (that day)')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 5 of 6 dates.')).toBeInTheDocument()
    expect(screen.queryByText('Mon 6 Jun 2025')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all 6 dates' }))

    expect(screen.getByText('Mon 6 Jun 2025')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('shows unpaid weeks neutrally with outstanding amount and age, instead of repeating their dates', () => {
    // 06.01.2026 (Tue) belongs to the listed week of 05.01.2026; 14.01.2026 belongs to no listed week.
    const notOnPayslip = { ...buildTimingRow(0), date: '06.01.2026', avacName: 'Week 2.pdf', status: 'NOT_ON_THIS_PAYSLIP', issueLabel: 'Not on this payslip yet' }
    const unlisted = { ...buildTimingRow(0), date: '14.01.2026', day_of_week: 'Wed', avacName: 'Week 3.pdf', status: 'NOT_ON_THIS_PAYSLIP', issueLabel: 'Not on this payslip yet' }
    const fortnight = { ...buildTimingRow(1), status: 'NEEDS_FORTNIGHT_PAYSLIP', issueLabel: 'Needs the fortnight payslip' }
    render(
      <ReportActionQueue
        needsFollowUpNowRows={[]}
        timingCheckRows={[notOnPayslip, unlisted, fortnight]}
        unpaidWeeks={[
          { week_start: '05.01.2026', avac_name: 'Week 2.pdf', expected_total: 230, age_days: 80 },
          { week_start: '30.03.2026', avac_name: 'Week 14.pdf', expected_total: 50, age_days: -3 },
        ]}
      />
    )

    const week = screen.getByText('Week of Mon 5 Jan 2026').closest('li')!
    expect(week).toHaveTextContent('$230.00 outstanding')
    expect(week).toHaveTextContent('11 weeks before your latest payslip')
    expect(week.innerHTML).not.toMatch(/cp-owed/)
    expect(screen.getByText('Week of Mon 30 Mar 2026').closest('li')).toHaveTextContent('After your latest payslip')
    expect(screen.getByText(/usually appears 3–10 weeks after the AVAC week/)).toBeInTheDocument()
    // The fortnight-payslip date still shows; the week's own date is not repeated.
    expect(screen.getByText('Mon 2 Jun 2025')).toBeInTheDocument()
    expect(screen.queryByText('Mon 6 Jan 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('Tue 6 Jan 2026')).not.toBeInTheDocument()
    // A date whose week the backend did not list stays visible.
    expect(screen.getByText('Wed 14 Jan 2026')).toBeInTheDocument()
  })

  it('groups "Raise with payroll" rows by month with a subtotal when they span several months', () => {
    const april = { ...buildTimingRow(0), date: '14.04.2025', status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const, difference: -50 }
    const june = { ...buildTimingRow(1), date: '02.06.2025', status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const, difference: -70 }
    render(<ReportActionQueue needsFollowUpNowRows={[june, april]} timingCheckRows={[]} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toContain('April 2025')
    expect(headings[0]).toContain('1 item')
    expect(headings[0]).toContain('-$50.00')
    expect(headings[1]).toContain('June 2025')
    expect(screen.getByText('Total difference').nextElementSibling).toHaveTextContent('-$120.00')
  })

  it('shows no month headings when everything is in one month', () => {
    const rows = [0, 1].map((i) => ({ ...buildTimingRow(i), status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const }))
    render(<ReportActionQueue needsFollowUpNowRows={rows} timingCheckRows={[]} />)
    expect(screen.queryByRole('heading', { level: 3, name: /2025/ })).not.toBeInTheDocument()
  })

  it('groups unpaid weeks and dates to verify by month', () => {
    const weeks = [
      { week_start: '07.04.2025', avac_name: 'Week 15.pdf', expected_total: 100, age_days: 60 },
      { week_start: '02.06.2025', avac_name: 'Week 23.pdf', expected_total: 120, age_days: 4 },
    ]
    const rows = [{ ...buildTimingRow(0), date: '10.04.2025' }, { ...buildTimingRow(1), date: '12.06.2025' }]
    render(<ReportActionQueue needsFollowUpNowRows={[]} timingCheckRows={rows} unpaidWeeks={weeks} />)
    expect(screen.getAllByRole('heading', { level: 4, name: 'April 2025' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 4, name: 'June 2025' })).toHaveLength(2)
  })
})
