import { Badge } from '@/components/ui/badge'
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

import { formatCurrency, formatSignedCurrency, getLineStatusClass } from '../report-formatters'
import { type ActionableRow } from '../report-view-model'

interface ActionRowsTableProps {
  rows: ActionableRow[]
  emptyMessage: string
}

function ActionRowsTable({ rows, emptyMessage }: ActionRowsTableProps) {
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
          {rows.map((row, index) => (
            <TableRow key={`${row.avacName}-${row.date}-${row.pay_type}-${index}`}>
              <TableCell>{row.date || '—'}</TableCell>
              <TableCell className="max-w-[220px] truncate">{row.avacName || '—'}</TableCell>
              <TableCell>{row.displayPayType}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn('border-0', getLineStatusClass(row.status))}>
                  {row.issueLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(row.expected_amount)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.actual_amount)}</TableCell>
              <TableCell className="text-right">{formatSignedCurrency(row.difference)}</TableCell>
              <TableCell className="max-w-[320px] text-xs leading-5">
                {row.recommendedAction}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface ReportActionQueueProps {
  payrollActionRows: ActionableRow[]
  followUpRows: ActionableRow[]
}

export function ReportActionQueue({ payrollActionRows, followUpRows }: ReportActionQueueProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-xl">Action queue</CardTitle>
        <CardDescription>
          Prioritized actions first, followed by items that require follow-up checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Payroll action required</p>
            <p className="text-sm text-muted-foreground">
              {payrollActionRows.length} item{payrollActionRows.length === 1 ? '' : 's'} requiring payroll action.
            </p>
          </div>
          <ActionRowsTable
            rows={payrollActionRows}
            emptyMessage="No payroll action items found in parsed AVAC files."
          />
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Follow-up required</p>
            <p className="text-sm text-muted-foreground">
              {followUpRows.length} item{followUpRows.length === 1 ? '' : 's'} that may need previous or next payslip checks.
            </p>
          </div>
          <ActionRowsTable
            rows={followUpRows}
            emptyMessage="No follow-up items were detected."
          />
        </div>
      </CardContent>
    </Card>
  )
}
