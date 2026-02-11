import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  formatDayTypeLabel,
  formatPayTypeLabel,
  formatSignedCurrency,
  formatStatusLabel,
  getEffectiveDayStatus,
  getDayStatusClass,
  getDayStatusHint,
  getLineStatusClass,
  isTimingCheckStatus,
} from '../report-formatters'
import { type AvacDetailSummary, type PayrollContextModel, type TotalsAcrossAvacs } from '../report-view-model'
import { PayrollContextPanel } from './PayrollContextPanel'

interface ReportPerAvacDetailsProps {
  summaries: AvacDetailSummary[]
  totals: TotalsAcrossAvacs
  payrollContext: PayrollContextModel
  onCopyTroubleshooting?: () => void
  showTroubleshooting?: boolean
}

function summarizeShifts(itemCount: number): string {
  if (itemCount === 1) return '1 line item'
  return `${itemCount} line items`
}

function AvacDayBreakdown({ summary }: { summary: AvacDetailSummary }) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const report = summary.report

  const daysToDisplay = report?.days ?? []

  if (!report) {
    return null
  }

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {daysToDisplay.length} day{daysToDisplay.length === 1 ? '' : 's'}
        </p>
      </div>

      {daysToDisplay.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          No issue days for this AVAC.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Shifts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daysToDisplay.map((day, dayIndex) => {
                const rowKey = `${summary.id}-${day.date}-${dayIndex}`
                const isExpanded = expandedDays.has(rowKey)
                const displayStatus = getEffectiveDayStatus({
                  dayStatus: day.status,
                  dayDifference: day.difference,
                  itemStatuses: day.items.map((item) => item.status),
                  supplementalStatuses: summary.actionableStatusesByDate[day.date] ?? [],
                })
                const statusHint = getDayStatusHint(displayStatus)
                const isExpandable = day.items.length > 0
                const isTimingRow = isTimingCheckStatus(displayStatus)

                return (
                  <React.Fragment key={rowKey}>
                    <TableRow
                      className={cn(
                        isExpandable && 'cursor-pointer hover:bg-muted/50'
                      )}
                      onClick={isExpandable ? () => toggleDay(rowKey) : undefined}
                    >
                      <TableCell className="w-8 px-2">
                        {isExpandable && (
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-180'
                            )}
                          />
                        )}
                      </TableCell>
                      <TableCell>{day.date || '—'}</TableCell>
                      <TableCell>{day.day_of_week || '—'}</TableCell>
                      <TableCell>{formatDayTypeLabel(day.day_type)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {statusHint
                          ? `${statusHint.icon} ${statusHint.label}`
                          : summarizeShifts(day.items.length)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('border-0', getDayStatusClass(displayStatus))}>
                          {formatStatusLabel(displayStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isTimingRow ? '—' : formatCurrency(day.expected_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTimingRow ? '—' : formatCurrency(day.actual_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTimingRow ? '—' : formatSignedCurrency(day.difference)}
                      </TableCell>
                    </TableRow>

                    {isExpandable && isExpanded &&
                      day.items.map((item, itemIndex) => {
                        const isTimingItem = isTimingCheckStatus(item.status)
                        return (
                          <TableRow key={`${rowKey}-item-${itemIndex}`} className="bg-muted/30">
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-sm">{formatPayTypeLabel(item.pay_type)}</TableCell>
                            <TableCell />
                            <TableCell>
                              <Badge variant="outline" className={cn('border-0 text-xs', getLineStatusClass(item.status))}>
                                {formatStatusLabel(item.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {isTimingItem ? '—' : formatCurrency(item.expected_amount)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {isTimingItem ? '—' : formatCurrency(item.actual_amount)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {isTimingItem ? '—' : formatSignedCurrency(item.difference)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function ReportPerAvacDetails({
  summaries,
  totals,
  payrollContext,
  onCopyTroubleshooting,
  showTroubleshooting = true,
}: ReportPerAvacDetailsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detailed reconciliation totals</CardTitle>
          <CardDescription>
            In-scope totals focus on this payslip window. Timing-check totals are informational only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">In-scope expected</p>
                <p className="mt-2 font-semibold">{formatCurrency(totals.inScopeExpected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">In-scope difference</p>
                <p className="mt-2 font-semibold">{formatSignedCurrency(totals.inScopeDifference)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Timing-check expected (info)</p>
                <p className="mt-2 font-semibold">{formatCurrency(totals.timingExpected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Timing-check days</p>
                <p className="mt-2 text-2xl font-semibold">{totals.timingDays}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-AVAC details</CardTitle>
          <CardDescription>
            Expand any file to review a full day-by-day breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full rounded-lg border">
            {summaries.map((summary) => (
              <AccordionItem key={summary.id} value={summary.id} className="px-4 last:border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-1 pr-2 text-left sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <span className="truncate font-medium">{summary.avacName}</span>
                    <Badge variant="outline" className={cn('w-fit border-0', summary.statusClassName)}>
                      {summary.statusLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{summary.subtitle}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {summary.error ? (
                    <Alert variant="destructive">
                      <AlertTitle>Failed to process AVAC</AlertTitle>
                      <AlertDescription>{summary.error}</AlertDescription>
                    </Alert>
                  ) : summary.report ? (
                    <AvacDayBreakdown summary={summary} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No report returned for this AVAC.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <PayrollContextPanel context={payrollContext} />

      {showTroubleshooting && onCopyTroubleshooting && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Troubleshooting data</CardTitle>
            <CardDescription>
              If you need help investigating this report, copy a compact payload and share it with support.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full rounded-lg border px-4">
              <AccordionItem value="troubleshooting" className="border-none">
                <AccordionTrigger className="hover:no-underline">Show troubleshooting tools</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This includes high-level counts, per-AVAC summaries, and the raw reconciliation payload.
                  </p>
                  <Button type="button" variant="outline" onClick={onCopyTroubleshooting}>
                    Copy troubleshooting data
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
