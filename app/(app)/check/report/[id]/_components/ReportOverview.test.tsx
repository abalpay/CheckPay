import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ReconcileResponseOk } from '@/lib/jobs'

import { createReportViewModel } from '../report-view-model'
import { ReportOverview } from './ReportOverview'

const analysis = (payslipCount: number): ReconcileResponseOk => ({
  status: 'ok', employee: 'Dr Test', pay_date: '26.03.2026', base_rate: 60, is_overpayment_payslip: false,
  adjustment_total: 0, older_adjustments_total: 0, avac_results: [],
  payslips: Array.from({ length: payslipCount }, (_, i) => ({ pay_date: `1${i}.03.2026` })),
})

describe('ReportOverview', () => {
  it.each([
    [1, 'Underpaid on this payslip'],
    [2, 'Underpaid on your payslips'],
  ])('labels the headline figure for %i payslip(s)', (count, label) => {
    const a = analysis(count)
    render(<ReportOverview analysis={a} viewModel={createReportViewModel(a)} reportCreatedAt={null} isSampleReport={false} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('shows the range of all uploaded payslips, not just the latest one', () => {
    const a: ReconcileResponseOk = {
      ...analysis(1),
      pay_date: '04.06.2025', pay_period_start: '12/05', pay_period_end: '25/05',
      payslips: [
        { pay_date: '26.02.2025', period_start: '03/02', period_end: '16/02' },
        { pay_date: '04.06.2025', period_start: '12/05', period_end: '25/05' },
      ],
    }
    render(<ReportOverview analysis={a} viewModel={createReportViewModel(a)} reportCreatedAt={null} isSampleReport={false} />)
    expect(screen.getByText('Pay dates')).toBeInTheDocument()
    expect(screen.getByText('26 Feb 2025 – 4 Jun 2025')).toBeInTheDocument()
    expect(screen.getByText('3 Feb – 25 May')).toBeInTheDocument()
    expect(screen.getByText('Payslips')).toBeInTheDocument()
  })
})
