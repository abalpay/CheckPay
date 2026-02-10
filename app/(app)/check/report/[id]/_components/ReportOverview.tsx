import { ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
            Clinical snapshot
          </p>
          <p className="mt-2 text-xl font-semibold">{viewModel.snapshotHeadline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{viewModel.snapshotDetail}</p>
          {viewModel.topLevelMeta && (
            <Badge variant="outline" className={cn('mt-3 border-0', viewModel.topLevelMeta.className)}>
              {viewModel.topLevelMeta.label}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Actionable items</p>
              <p className="mt-2 text-2xl font-semibold">{viewModel.actionableCount}</p>
            </CardContent>
          </Card>
          <Card className="border-red-100 bg-red-50/70">
            <CardContent className="pt-6">
              <p className="text-sm text-red-700">Underpaid / missing</p>
              <p className="mt-2 text-2xl font-semibold text-red-800">{viewModel.underpaidMissingCount}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-100 bg-amber-50/70">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-700">Potential overpaid</p>
              <p className="mt-2 text-2xl font-semibold text-amber-800">{viewModel.potentialOverpaidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Parse errors</p>
              <p className="mt-2 text-2xl font-semibold">{viewModel.parseErrorCount}</p>
            </CardContent>
          </Card>
        </div>

        {reportCreatedAt && (
          <p className="text-sm text-muted-foreground">
            Generated {createdFormatter.format(new Date(reportCreatedAt))}
          </p>
        )}

        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Use with care</AlertTitle>
          <AlertDescription>
            This report is generated automatically. Always verify against official Queensland Health payroll records.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
