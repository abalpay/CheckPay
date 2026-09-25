import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SAMPLE_ANALYSIS } from '@/lib/sample-report'
import type { AnalysisJson, LineItem } from '@/lib/jobs'

import { buildPrintSummaryModel, createReportViewModel } from '../report-view-model'
import { PrintSummaryDocument } from './PrintSummaryDocument'

function underpaid(date: string): LineItem {
  return { date, day_of_week: 'Mon', pay_type: 'Overtime_-_1.5', status: 'UNDERPAID', expected_units: 1, actual_units: 0, expected_amount: 60, actual_amount: 0, difference: -60, notes: '' }
}

function analysisWithMonths(dates: string[]): AnalysisJson {
  const first = SAMPLE_ANALYSIS.avac_results[0]
  return {
    ...SAMPLE_ANALYSIS,
    unpaid_weeks: [],
    avac_results: dates.map((date, i) => ({
      avac_name: `Week ${i + 1}.pdf`,
      report: { ...first.report!, days: [], actionable_items: [underpaid(date)], warnings: [] },
    })),
  }
}

describe('PrintSummaryDocument', () => {
  it('adds a month header row per month when rows span several months', () => {
    const analysis = analysisWithMonths(['14.04.2025', '02.06.2025'])
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.getByRole('columnheader', { name: /April 2025 · 1 item/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /June 2025 · 1 item/ })).toBeInTheDocument()
  })

  it('adds no month rows for a single month', () => {
    const analysis = analysisWithMonths(['14.04.2025', '21.04.2025'])
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.queryByRole('columnheader', { name: /2025/ })).not.toBeInTheDocument()
  })
})
