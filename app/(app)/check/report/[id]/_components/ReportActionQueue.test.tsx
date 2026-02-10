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
  it('shows first five timing-check rows and expands on see more', async () => {
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
    expect(screen.getByText('Showing 5 of 6 AVAC dates.')).toBeInTheDocument()
    expect(screen.queryByText('06.06.2025')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'See more' }))

    expect(screen.getByText('06.06.2025')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'See more' })).not.toBeInTheDocument()
  })
})
