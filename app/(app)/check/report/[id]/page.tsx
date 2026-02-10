'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { normalizeAnalysisJson, type AnalysisJson } from '@/lib/jobs'
import { getSessionReportById } from '@/lib/session-reports'

import { PayrollContextPanel } from './_components/PayrollContextPanel'
import { ReportActionQueue } from './_components/ReportActionQueue'
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

  useEffect(() => {
    params.then((value) => setReportId(value.id))
  }, [params])

  useEffect(() => {
    if (!reportId) return

    setLoading(true)
    setAnalysis(null)

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
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading report...
          </div>
        </div>
      </div>
    )
  }

  if (!analysis || !viewModel) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Report not found</CardTitle>
            <CardDescription>
              This report is temporary and may be unavailable after refresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/check/new">Run a new check</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="container mx-auto max-w-6xl px-4 py-10 print:hidden">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href="/check/new" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to upload
            </Link>
          </Button>

          <Button type="button" variant="outline" onClick={() => window.print()}>
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print summary
            </span>
          </Button>
        </div>

        <ReportOverview
          analysis={analysis}
          viewModel={viewModel}
          reportCreatedAt={reportCreatedAt}
        />

        <PayrollContextPanel context={viewModel.payrollContext} />

        <Card className="mb-6 border-blue-200/70">
          <CardHeader>
            <CardTitle className="text-lg">What to do now</CardTitle>
            <CardDescription>Use this checklist before contacting payroll.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {viewModel.nextSteps.map((step, index) => (
                <li key={`${step}-${index}`} className="flex gap-3 text-sm">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {analysis.status === 'correction_payslip' && (
          <Card className="mb-6 border-amber-200">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-amber-800">
                <TriangleAlert className="h-5 w-5" />
                Correction payslip detected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{analysis.message || 'This payslip appears to contain only correction entries.'}</p>
              <p>
                <span className="font-medium">Overpayment amount:</span>{' '}
                {formatCurrency(analysis.overpayment_amount)}
              </p>
            </CardContent>
          </Card>
        )}

        {analysis.status === 'ok' && (
          <>
            <ReportActionQueue
              followUpRows={viewModel.followUpRows}
            />

            <div className="mb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDetailedAnalysis((current) => !current)}
              >
                {showDetailedAnalysis ? 'Hide detailed analysis' : 'Show detailed analysis'}
              </Button>
            </div>

            {viewModel.parseErrorResults.length > 0 && (
              <Alert variant="destructive" className="mb-6">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Some AVAC files could not be processed</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-5">
                    {viewModel.parseErrorResults.map((result, index) => (
                      <li key={`${result.avac_name}-${index}`}>
                        {result.avac_name || `AVAC ${index + 1}`}: {result.error}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {showDetailedAnalysis && (
              <ReportPerAvacDetails
                summaries={viewModel.avacSummaries}
                totals={viewModel.totalsAcrossAvacs}
                onCopyTroubleshooting={handleCopyTroubleshooting}
              />
            )}
          </>
        )}
      </div>

      {printModel && (
        <PrintSummaryDocument
          analysis={analysis}
          viewModel={viewModel}
          printModel={printModel}
          reportCreatedAt={reportCreatedAt}
          reportId={reportId}
        />
      )}
    </>
  )
}
