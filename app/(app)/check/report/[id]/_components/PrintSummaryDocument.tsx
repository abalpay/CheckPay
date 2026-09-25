import { Fragment } from 'react'

import { type AnalysisJson } from '@/lib/jobs'

import { formatCurrency, formatLongDate, formatSignedCurrency, isTimingCheckStatus, monthGroupsOf } from '../report-formatters'
import { type PrintSummaryModel, type PrintSummarySection, type ReportViewModel } from '../report-view-model'

interface PrintSummaryDocumentProps {
  analysis: AnalysisJson
  viewModel: ReportViewModel
  printModel: PrintSummaryModel
  reportCreatedAt: string | null
  reportId: string
  isSampleReport?: boolean
}

const fallbackCreatedFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatFallbackCreatedAt(value: string | null): string {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return fallbackCreatedFormatter.format(parsed)
}

function ActionSection({ section, byMonth }: { section: PrintSummarySection; byMonth: boolean }) {
  return (
    <section className="print-summary-section print-break-avoid">
      <div className="print-summary-section-head">
        <h2>{section.title}</h2>
        <p>{section.subtitle}</p>
      </div>

      {section.rows.length === 0 ? (
        <p className="print-summary-empty">{section.emptyMessage}</p>
      ) : (
        <div className="print-summary-table-wrap">
          <table className="print-summary-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">AVAC</th>
                <th scope="col">Claim type</th>
                <th scope="col">Issue</th>
                <th scope="col" className="text-right">Expected</th>
                <th scope="col" className="text-right">Paid</th>
                <th scope="col" className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {monthGroupsOf(byMonth, section.rows, (row) => row.date).map((group, _, groups) => (
                <Fragment key={group.key}>
                  {byMonth && groups.length > 1 && (
                    <tr className="print-summary-month-row">
                      <th scope="colgroup" colSpan={7}>{group.label} · {group.items.length} item{group.items.length === 1 ? '' : 's'}</th>
                    </tr>
                  )}
                  {group.items.map((row, index) => {
                    const isTimingRow = isTimingCheckStatus(row.status)
                    return (
                      <Fragment key={`${section.id}-${group.key}-${row.avacName}-${row.date}-${row.pay_type}-${index}`}>
                        <tr className="print-break-avoid">
                          <td>{row.date ? formatLongDate(row.date, row.day_of_week) : '—'}</td>
                          <td className="print-summary-cell-wrap">{row.avacName || '—'}</td>
                          <td>{row.displayPayType}</td>
                          <td>{row.issueLabel}</td>
                          <td className="text-right">{isTimingRow ? '—' : formatCurrency(row.expected_amount)}</td>
                          <td className="text-right">{isTimingRow ? '—' : formatCurrency(row.actual_amount)}</td>
                          <td className="text-right">{isTimingRow ? '—' : formatSignedCurrency(row.difference)}</td>
                        </tr>
                        <tr className="print-break-avoid">
                          <td colSpan={7} className="print-summary-next-step">
                            <span className="print-summary-next-step-label">Next step:</span>{' '}
                            {row.recommendedAction}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function PrintSummaryDocument({
  analysis,
  viewModel,
  printModel,
  reportCreatedAt,
  reportId,
  isSampleReport = false,
}: PrintSummaryDocumentProps) {
  const headerReportId = printModel.header.reportId || reportId || '—'
  const generatedAt =
    printModel.header.generatedAt !== '—'
      ? printModel.header.generatedAt
      : formatFallbackCreatedAt(reportCreatedAt)

  return (
    <section className="hidden print:block">
      <article className="print-summary-document">
        <header className="print-summary-section print-break-avoid">
          <p className="print-summary-kicker">CheckPay</p>
          <h1 className="print-summary-title">Reconciliation Summary</h1>
          {isSampleReport && (
            <p className="print-summary-detail">Sample data preview - not a personal payroll assessment.</p>
          )}
          <div className="print-summary-meta">
            <p>
              <strong>Employee:</strong> {printModel.header.employee}
            </p>
            <p>
              <strong>Pay date:</strong> {printModel.header.payDate}
            </p>
            <p>
              <strong>Generated:</strong> {generatedAt}
            </p>
            <p>
              <strong>Report ID:</strong> {headerReportId}
            </p>
          </div>
        </header>

        <section className="print-summary-section print-break-avoid">
          <div className="print-summary-section-head">
            <h2>Result</h2>
          </div>
          <p className="print-summary-headline">{printModel.snapshot.headline}</p>
          <p className="print-summary-detail">{printModel.snapshot.detail}</p>
          <p className="print-summary-status">
            <strong>Status:</strong> {printModel.snapshot.statusLabel}
          </p>
          <p className="print-summary-status">
            <strong>Confidence:</strong> {printModel.snapshot.confidenceLabel.charAt(0)}{printModel.snapshot.confidenceLabel.slice(1).toLowerCase()}
          </p>
          <p className="print-summary-detail">{printModel.snapshot.confidenceDetail}</p>
        </section>

        <section className="print-summary-section print-break-avoid">
          <div className="print-summary-section-head">
            <h2>Key metrics</h2>
          </div>
          <ul className="print-summary-metric-grid">
            {printModel.metrics.map((metric) => (
              <li key={metric.key} className="print-summary-metric-card">
                <p>{metric.label}</p>
                <p className="print-summary-metric-value">{metric.value}</p>
              </li>
            ))}
          </ul>
        </section>

        {analysis.status === 'correction_payslip' ? (
          <section className="print-summary-section print-break-avoid">
            <div className="print-summary-section-head">
              <h2>Correction payslip note</h2>
            </div>
            <p className="print-summary-detail">
              {printModel.correctionSummary?.message || 'Correction or reversal entries were detected for this pay period.'}
            </p>
            {typeof printModel.correctionSummary?.overpaymentAmount === 'number' && (
              <p className="print-summary-status">
                <strong>Overpayment amount:</strong> {formatCurrency(printModel.correctionSummary.overpaymentAmount)}
              </p>
            )}
          </section>
        ) : (
          printModel.sections.map((section) => (
            <ActionSection key={section.id} section={section} byMonth={viewModel.payslipCount > 1} />
          ))
        )}

        <section className="print-summary-section print-break-avoid">
          <div className="print-summary-section-head">
            <h2>What to do next</h2>
          </div>
          <ol className="print-summary-steps">
            {printModel.nextSteps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="print-summary-section print-break-avoid">
          <div className="print-summary-section-head">
            <h2>Coverage and caveats</h2>
          </div>

          <dl className="print-summary-coverage-grid">
            {printModel.coverage.map((item) => (
              <Fragment key={`${item.label}-${item.value}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </Fragment>
            ))}
          </dl>

          <ul className="print-summary-caveats">
            {printModel.caveats.map((caveat, index) => (
              <li key={`${index}-${caveat}`}>{caveat}</li>
            ))}
          </ul>
        </section>

        <footer className="print-summary-footer">
          <p>
            Generated by CheckPay: {viewModel.needsFollowUpNowCount} item
            {viewModel.needsFollowUpNowCount === 1 ? '' : 's'} to raise with payroll and{' '}
            {viewModel.timingCheckRows.length} claim{viewModel.timingCheckRows.length === 1 ? '' : 's'} to check on
            other payslips.
          </p>
        </footer>
      </article>
    </section>
  )
}
