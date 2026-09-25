'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { normalizeAnalysisJson, type AnalysisJson } from '@/lib/jobs'
import {
  isSampleReportId,
  SAMPLE_ANALYSIS,
  SAMPLE_REPORT_CREATED_AT,
} from '@/lib/sample-report'
import { getSessionReportById } from '@/lib/session-reports'
import { cn } from '@/lib/utils'

import { ReportActionQueue } from './_components/ReportActionQueue'
import { ReportNextSteps } from './_components/ReportNextSteps'
import { ReportOverview } from './_components/ReportOverview'
import { ReportPerAvacDetails } from './_components/ReportPerAvacDetails'
import { formatCurrency } from './report-formatters'
import { PrintSummaryDocument } from './_components/PrintSummaryDocument'
import {
  buildPrintSummaryModel,
  buildTroubleshootingPayload,
  createReportViewModel,
} from './report-view-model'

interface ReportPageProps {
  params: Promise<{
    id: string
  }>
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'absolute'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

export default function ReportPage({ params }: ReportPageProps) {
  const [reportId, setReportId] = useState('')
  const [reportCreatedAt, setReportCreatedAt] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false)
  const isSampleReport = isSampleReportId(reportId)

  useEffect(() => {
    params.then((value) => setReportId(value.id))
  }, [params])

  useEffect(() => {
    if (!reportId) return

    setLoading(true)
    setAnalysis(null)

    if (isSampleReportId(reportId)) {
      setReportCreatedAt(SAMPLE_REPORT_CREATED_AT)
      setAnalysis(SAMPLE_ANALYSIS)
      setLoading(false)
      return
    }

    const record = getSessionReportById(reportId)
    if (!record) {
      setReportCreatedAt(null)
      setLoading(false)
      return
    }

    setReportCreatedAt(record.createdAt)
    setAnalysis(normalizeAnalysisJson(record.analysis))
    setLoading(false)
  }, [reportId])

  const viewModel = useMemo(
    () => (analysis ? createReportViewModel(analysis) : null),
    [analysis]
  )

  const printModel = useMemo(
    () =>
      analysis && viewModel
        ? buildPrintSummaryModel({
            analysis,
            viewModel,
            reportId,
            reportCreatedAt,
          })
        : null,
    [analysis, reportCreatedAt, reportId, viewModel]
  )

  const handleCopyTroubleshooting = useCallback(async () => {
    if (!analysis || !viewModel) return

    try {
      const payload = buildTroubleshootingPayload({
        reportId,
        reportCreatedAt,
        analysis,
        viewModel,
      })

      await copyTextToClipboard(JSON.stringify(payload, null, 2))
      toast.success('Troubleshooting data copied to clipboard.')
    } catch {
      toast.error('Could not copy troubleshooting data. Please try again.')
    }
  }, [analysis, reportCreatedAt, reportId, viewModel])

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[420px] max-w-6xl items-center px-4 sm:px-6">
        <p role="status" className="inline-flex items-center gap-2 text-[var(--cp-text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading report…
        </p>
      </div>
    )
  }

  if (!analysis || !viewModel) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cp-text-secondary)]">
          Report not found
        </p>
        <h1 className="cp-display mt-4 text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.08] text-[var(--cp-text-primary)]">
          This report is no longer available.
        </h1>
        <p className="mt-4 max-w-[60ch] leading-relaxed text-[var(--cp-text-secondary)]">
          Reports are kept only while this tab is open, so refreshing or opening the link elsewhere clears them.
          Upload your payslip and AVAC forms again to get a new report.
        </p>
        <Button
          asChild
          className="mt-8 h-11 gap-2 rounded-lg bg-[var(--cp-accent)] px-6 font-semibold text-white hover:bg-[var(--cp-accent-hover)]"
        >
          <Link href="/check/new">
            Start a new check
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="print:hidden">
        <ReportOverview
          analysis={analysis}
          viewModel={viewModel}
          reportCreatedAt={reportCreatedAt}
          isSampleReport={isSampleReport}
        />

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
            <div className="min-w-0 space-y-14">
              {viewModel.parseErrorResults.length > 0 && (
                <section
                  aria-labelledby="unread-files-heading"
                  className="rounded-lg border border-[var(--cp-owed-ring)] bg-[var(--cp-owed-bg)] px-5 py-4"
                >
                  <h2
                    id="unread-files-heading"
                    className="inline-flex items-center gap-2 font-semibold text-[var(--cp-owed)]"
                  >
                    <TriangleAlert className="h-4 w-4" aria-hidden />
                    {viewModel.parseErrorResults.length === 1
                      ? '1 AVAC file could not be read'
                      : `${viewModel.parseErrorResults.length} AVAC files could not be read`}
                  </h2>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--cp-text-primary)]">
                    {viewModel.parseErrorResults.map((result, index) => (
                      <li key={`${result.avac_name}-${index}`}>
                        <span className="font-medium">{result.avac_name || `AVAC ${index + 1}`}</span>: {result.error}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {analysis.status === 'correction_payslip' && (
                <section aria-labelledby="correction-heading">
                  <h2
                    id="correction-heading"
                    className="cp-display border-b border-[var(--cp-text-primary)] pb-3 text-2xl text-[var(--cp-text-primary)] md:text-[1.75rem]"
                  >
                    Correction payslip
                  </h2>
                  <p className="mt-4 max-w-[65ch] leading-relaxed text-[var(--cp-text-primary)]">
                    {analysis.message || 'This payslip appears to contain only correction entries.'}
                  </p>
                  <p className="mt-3 text-sm text-[var(--cp-text-secondary)]">
                    Overpayment amount:{' '}
                    <span className="font-semibold tabular-nums text-[var(--cp-text-primary)]">
                      {formatCurrency(analysis.overpayment_amount)}
                    </span>
                  </p>
                </section>
              )}

              {analysis.status === 'ok' && (
                <ReportActionQueue
                  needsFollowUpNowRows={viewModel.needsFollowUpNowRows}
                  timingCheckRows={viewModel.timingCheckRows}
                />
              )}
            </div>
            <aside>
              <div className="lg:sticky lg:top-24">
                <ReportNextSteps
                  steps={viewModel.nextSteps}
                  confidenceLevel={viewModel.confidenceLevel}
                  confidenceDetail={viewModel.confidenceDetail}
                  onPrint={() => window.print()}
                />
              </div>
            </aside>

          </div>

          {analysis.status === 'ok' && (
            <section aria-labelledby="breakdown-heading" className="mt-20">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--cp-text-primary)] pb-3">
                <div>
                  <h2
                    id="breakdown-heading"
                    className="cp-display text-2xl text-[var(--cp-text-primary)] md:text-[1.75rem]"
                  >
                    Line-by-line breakdown
                  </h2>
                  <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
                    Every day on each AVAC compared with your payslip, and the figures behind this result.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={showDetailedAnalysis}
                  aria-controls="report-breakdown"
                  onClick={() => setShowDetailedAnalysis((current) => !current)}
                  className="gap-2 rounded-lg border-[var(--cp-text-primary)] bg-transparent font-semibold text-[var(--cp-text-primary)] hover:bg-[var(--cp-text-primary)] hover:text-[var(--cp-text-inverse)]"
                >
                  {showDetailedAnalysis ? 'Hide breakdown' : 'Show breakdown'}
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', showDetailedAnalysis && 'rotate-180')}
                    aria-hidden
                  />
                </Button>
              </div>

              {showDetailedAnalysis && (
                <div id="report-breakdown" className="pt-8">
                  <ReportPerAvacDetails
                    summaries={viewModel.avacSummaries}
                    totals={viewModel.totalsAcrossAvacs}
                    payrollContext={viewModel.payrollContext}
                    onCopyTroubleshooting={isSampleReport ? undefined : handleCopyTroubleshooting}
                    showTroubleshooting={!isSampleReport}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {printModel && (
        <PrintSummaryDocument
          analysis={analysis}
          viewModel={viewModel}
          printModel={printModel}
          reportCreatedAt={reportCreatedAt}
          reportId={reportId}
          isSampleReport={isSampleReport}
        />
      )}
    </>
  )
}
