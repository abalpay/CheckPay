import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  formatSignedCurrency,
  getLineStatusClass,
  isTimingCheckStatus,
} from '../report-formatters'
import { type ActionableRow } from '../report-view-model'

interface ActionRowsTableProps {
  rows: ActionableRow[]
  emptyMessage: string
}

function ActionRowsTable({
  rows,
  emptyMessage,
}: ActionRowsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>AVAC</TableHead>
            <TableHead>Claim type</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            <TableHead>Next step</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isTimingRow = isTimingCheckStatus(row.status)
            return (
              <TableRow key={`${row.avacName}-${row.date}-${row.pay_type}-${index}`}>
                <TableCell>{row.date || '—'}</TableCell>
                <TableCell className="max-w-[220px] truncate">{row.avacName || '—'}</TableCell>
                <TableCell>{row.displayPayType}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border-0', getLineStatusClass(row.status))}>
                    {row.issueLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {isTimingRow ? '—' : formatCurrency(row.expected_amount)}
                </TableCell>
                <TableCell className="text-right">
                  {isTimingRow ? '—' : formatCurrency(row.actual_amount)}
                </TableCell>
                <TableCell className="text-right">
                  {isTimingRow ? '—' : formatSignedCurrency(row.difference)}
                </TableCell>
                <TableCell className="max-w-[320px] text-xs leading-5">
                  {row.recommendedAction}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

interface TimingDayRow {
  key: string
  date: string
  dayOfWeek: string
  avacName: string
  status: string
  issueLabel: string
  recommendedAction: string
  avacRowCount: number
}

function groupTimingRows(rows: ActionableRow[]): TimingDayRow[] {
  const grouped = new Map<string, TimingDayRow>()

  for (const row of rows) {
    const key = [row.avacName, row.date, row.day_of_week, row.status].join('|')
    const existing = grouped.get(key)
    if (existing) {
      existing.avacRowCount += 1
      continue
    }

    grouped.set(key, {
      key,
      date: row.date,
      dayOfWeek: row.day_of_week,
      avacName: row.avacName,
      status: row.status,
      issueLabel: row.issueLabel,
      recommendedAction: row.recommendedAction,
      avacRowCount: 1,
    })
  }

  return [...grouped.values()]
}

interface TimingRowsTableProps {
  rows: TimingDayRow[]
  emptyMessage: string
  previewLimit?: number
}

function TimingRowsTable({
  rows,
  emptyMessage,
  previewLimit = 5,
}: TimingRowsTableProps) {
  const [expanded, setExpanded] = useState(false)

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {emptyMessage}
      </p>
    )
  }

  const isPreviewing = !expanded && rows.length > previewLimit
  const visibleRows = isPreviewing ? rows.slice(0, previewLimit) : rows

  return (
    <div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>AVAC</TableHead>
              <TableHead>Rows in AVAC</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Next step</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.date || '—'}</TableCell>
                <TableCell>{row.dayOfWeek || '—'}</TableCell>
                <TableCell className="max-w-[240px] truncate">{row.avacName || '—'}</TableCell>
                <TableCell>
                  {row.avacRowCount} row{row.avacRowCount === 1 ? '' : 's'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border-0', getLineStatusClass(row.status))}>
                    {row.issueLabel}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[340px] text-xs leading-5">
                  {row.recommendedAction}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {isPreviewing && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {visibleRows.length} of {rows.length} AVAC rows.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            See more
          </Button>
        </div>
      )}
    </div>
  )
}

interface ReportActionQueueProps {
  needsFollowUpNowRows: ActionableRow[]
  timingCheckRows: ActionableRow[]
}

export function ReportActionQueue({
  needsFollowUpNowRows,
  timingCheckRows,
}: ReportActionQueueProps) {
  const timingDayRows = useMemo(() => groupTimingRows(timingCheckRows), [timingCheckRows])

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-xl">Action queue</CardTitle>
        <CardDescription>
          Follow this list to decide what to raise now versus what to recheck on adjacent payslips.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Needs follow-up now</p>
            <p className="text-sm text-muted-foreground">
              {needsFollowUpNowRows.length} item{needsFollowUpNowRows.length === 1 ? '' : 's'} that may need a payroll query now.
            </p>
          </div>
          <ActionRowsTable
            rows={needsFollowUpNowRows}
            emptyMessage="No immediate follow-up items were detected."
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              Recheck on previous/next payslip
            </p>
            <p className="text-sm text-muted-foreground">
              {timingDayRows.length} AVAC row{timingDayRows.length === 1 ? '' : 's'} likely belong to a previous or future payslip.
            </p>
          </div>
          <TimingRowsTable
            rows={timingDayRows}
            emptyMessage="No timing-check items were detected."
          />
        </div>
      </CardContent>
    </Card>
  )
}
