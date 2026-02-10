import { ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type AnalysisJson } from '@/lib/jobs'
import { cn } from '@/lib/utils'

import { formatReportDate } from '../report-formatters'
import { type ReportViewModel } from '../report-view-model'

const createdFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

interface ReportOverviewProps {
  analysis: AnalysisJson
  viewModel: ReportViewModel
  reportCreatedAt: string | null
}

export function ReportOverview({
  analysis,
  viewModel,
  reportCreatedAt,
}: ReportOverviewProps) {
  return (
    <Card className="mb-6 border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <CardHeader>
        <CardTitle className="text-2xl">Reconciliation Report</CardTitle>
        <CardDescription>
          Employee {analysis.employee || '—'} | Pay date {formatReportDate(analysis.pay_date)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What to do now
          </p>
          <p className="mt-2 text-xl font-semibold">{viewModel.decisionHeadline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{viewModel.decisionDetail}</p>
          {viewModel.topLevelMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('border-0', viewModel.topLevelMeta.className)}>
                {viewModel.topLevelMeta.label}
              </Badge>
              <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700">
                Confidence {viewModel.confidenceLevel.toLowerCase()}
              </Badge>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{viewModel.confidenceDetail}</p>
          {viewModel.hasTimingChecks && (
            <p className="mt-2 text-xs text-amber-700">
              Some claims are outside this payslip adjustment window and are shown as timing checks.
            </p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-red-100 bg-red-50/70">
            <CardContent className="pt-6">
              <p className="text-sm text-red-700">Needs follow-up now</p>
              <p className="mt-2 text-2xl font-semibold text-red-800">{viewModel.needsFollowUpNowCount}</p>
              <p className="mt-1 text-xs text-red-700">
                Likely missed this payslip: {viewModel.likelyMissedThisPayslipCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-amber-100 bg-amber-50/70">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-700">Likely on another payslip</p>
              <p className="mt-2 text-2xl font-semibold text-amber-800">{viewModel.likelyOtherPayslipCount}</p>
              <p className="mt-1 text-xs text-amber-700">
                Previous: {viewModel.payrollContext.checkPreviousCount} · Future: {viewModel.payrollContext.checkFutureCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Report coverage</p>
              <p className="mt-2 text-lg font-semibold">Parsed AVACs {viewModel.topParsedAvacsLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Parse errors: {viewModel.topParseErrorCount}</p>
            </CardContent>
          </Card>
        </div>

        {reportCreatedAt && (
          <p className="text-sm text-muted-foreground">
            Generated {createdFormatter.format(new Date(reportCreatedAt))}
          </p>
        )}

        <p className="inline-flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This report is automated decision support for doctors. Verify against official payroll records before lodging a query.
        </p>
      </CardContent>
    </Card>
  )
}
