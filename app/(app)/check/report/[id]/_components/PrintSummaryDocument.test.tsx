import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SAMPLE_ANALYSIS } from '@/lib/sample-report'
import type { AnalysisJson, LineItem } from '@/lib/jobs'

import { buildPrintSummaryModel, createReportViewModel } from '../report-view-model'
import { PrintSummaryDocument } from './PrintSummaryDocument'

function underpaid(date: string): LineItem {
  return { date, day_of_week: 'Mon', pay_type: 'Overtime_-_1.5', status: 'UNDERPAID', expected_units: 1, actual_units: 0, expected_amount: 60, actual_amount: 0, difference: -60, notes: '' }
}

/** `payslipCount` defaults to one row per date so month grouping is eligible (`payslipCount > 1`); pass 1
 *  to model a single payslip whose fortnight happens to span months (e.g. Dec/Jan), which must stay flat. */
function analysisWithMonths(dates: string[], payslipCount = dates.length): AnalysisJson {
  const first = SAMPLE_ANALYSIS.avac_results[0]
  return {
    ...SAMPLE_ANALYSIS,
    unpaid_weeks: [],
    payslips: Array.from({ length: payslipCount }, (_, i) => ({ pay_date: `0${i + 1}.01.2026` })),
    avac_results: dates.map((date, i) => ({
      avac_name: `Week ${i + 1}.pdf`,
      report: { ...first.report!, days: [], actionable_items: [underpaid(date)], warnings: [] },
    })),
  }
}

describe('PrintSummaryDocument', () => {
  it('adds a month header row per month when several payslips span several months', () => {
    const analysis = analysisWithMonths(['14.04.2025', '02.06.2025'], 2)
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.getByRole('columnheader', { name: /April 2025 · 1 item/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /June 2025 · 1 item/ })).toBeInTheDocument()
  })

  it('adds no month rows for a single month', () => {
    const analysis = analysisWithMonths(['14.04.2025', '21.04.2025'], 2)
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.queryByRole('columnheader', { name: /2025/ })).not.toBeInTheDocument()
  })

  it('adds no month rows for a single payslip, even when rows span months (e.g. a fortnight crossing Dec/Jan, as in the sample report)', () => {
    const analysis = analysisWithMonths(['30.12.2025', '09.01.2026'], 1)
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.queryByRole('columnheader', { name: /December 2025|January 2026/ })).not.toBeInTheDocument()
  })
})
