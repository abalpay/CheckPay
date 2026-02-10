'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2, Printer, ShieldAlert, TriangleAlert } from 'lucide-react'

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
  getOverallStatusMeta,
  normalizeAnalysisJson,
  type AnalysisJson,
  type AvacReport,
  type AvacResult,
  type LineItem,
} from '@/lib/jobs'
import { getSessionReportById } from '@/lib/session-reports'

interface ReportPageProps {
  params: Promise<{
    id: string
  }>
}

interface ActionableRow extends LineItem {
  avac_name: string
}

const createdFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function toSafeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatCurrency(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatSignedCurrency(value: number | undefined): string {
  const numberValue = toSafeNumber(value)
  const sign = numberValue > 0 ? '+' : numberValue < 0 ? '-' : ''
  return `${sign}${formatCurrency(Math.abs(numberValue))}`
}

function formatReportDate(value: string): string {
  if (!value) return '—'

  const trimmed = value.trim()
  if (!trimmed) return '—'

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('.')
    return `${day}/${month}/${year}`
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(parsed)
}

function summarizeShifts(items: LineItem[]): string {
  const ignoredPatterns = ['THRESHOLD_SPLIT', 'THRESHOLD_EXCESS', 'INFO', 'Guaranteed']

  const actionable = items.filter(
    (item) => !ignoredPatterns.some((p) => item.pay_type.includes(p))
  )

  const recalls = actionable.filter(
    (item) => item.pay_type.includes('Recall') && !item.pay_type.includes('Guaranteed') && !item.pay_type.includes('THRESHOLD')
  ).length
  const overtime = actionable.filter((item) => item.pay_type.includes('Overtime')).length
  const fatigue = actionable.filter((item) => item.pay_type.includes('Fatigue')).length

  const parts: string[] = []
  if (overtime > 0) parts.push('OT')
  if (recalls === 1) parts.push('1 recall')
  else if (recalls > 1) parts.push(`${recalls} recalls`)
  if (fatigue > 0) parts.push('fatigue')

  if (parts.length > 0) return parts.join(' + ')
  if (actionable.length > 0) return `${actionable.length} item${actionable.length !== 1 ? 's' : ''}`
  return `${items.length} line${items.length !== 1 ? 's' : ''}`
}

function getDayStatusIcon(status: string): { icon: string; label: string } | null {
  switch (status) {
    case 'NOT_YET_PAID':
      return { icon: '⏳', label: 'Check next payslip' }
    case 'POSSIBLY_MISSED':
      return { icon: '⚠️', label: 'Follow up with payroll' }
    case 'CHECK_PREVIOUS':
      return { icon: '🔍', label: 'Check earlier payslip' }
    default:
      return null
  }
}

function getLineStatusClass(status: string): string {
  switch (status) {
    case 'UNDERPAID':
    case 'MISSING':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'OVERPAID':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'UNMATCHED':
      return 'border-slate-200 bg-slate-100 text-slate-700'
    case 'NOT_YET_PAID':
      return 'border-gray-200 bg-gray-50 text-gray-600'
    case 'POSSIBLY_MISSED':
    case 'CHECK_PREVIOUS':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'MATCH':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'REVERSAL':
    case 'THRESHOLD_SPLIT':
    case 'THRESHOLD_EXCESS':
    case 'INFO':
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700'
  }
}

function getDayStatusClass(status: string): string {
  switch (status) {
    case 'UNDERPAID':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'OVERPAID':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'ANOMALY':
      return 'border-slate-200 bg-slate-100 text-slate-700'
    case 'NOT_YET_PAID':
      return 'border-gray-200 bg-gray-50 text-gray-600'
    case 'POSSIBLY_MISSED':
    case 'CHECK_PREVIOUS':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'OK':
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
}

function getActionPriority(status: string): number {
  switch (status) {
    case 'UNDERPAID':
    case 'MISSING':
      return 0
    case 'OVERPAID':
      return 1
    case 'UNMATCHED':
      return 2
    case 'POSSIBLY_MISSED':
      return 4
    case 'CHECK_PREVIOUS':
      return 5
    default:
      return 3
  }
}

function getIssueLabel(status: string): string {
  switch (status) {
    case 'UNDERPAID':
      return 'Underpaid'
    case 'MISSING':
      return 'Missing from payslip'
    case 'OVERPAID':
      return 'Potential overpayment'
    case 'UNMATCHED':
      return 'Unmatched line'
    case 'POSSIBLY_MISSED':
      return 'Possibly missed'
    case 'CHECK_PREVIOUS':
      return 'Check previous payslip'
    default:
      return status || 'Review'
  }
}

function getRecommendedAction(item: LineItem): string {
  switch (item.status) {
    case 'UNDERPAID':
    case 'MISSING':
      return 'Prepare payroll query and attach matching AVAC line.'
    case 'OVERPAID':
      return 'Confirm reversal or clawback handling with payroll.'
    case 'UNMATCHED':
      return 'Verify date and pay type against AVAC and payslip.'
    case 'POSSIBLY_MISSED':
      return 'This AVAC date falls within the adjustment window but was not paid. Follow up with payroll.'
    case 'CHECK_PREVIOUS':
      return 'This date may have been paid on an earlier payslip. Check previous pay period.'
    default:
      return item.notes || 'Review against payroll records before submitting.'
  }
}

function DoctorActionableTable({ items }: { items: ActionableRow[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        No actionable items were found in parsed AVAC files.
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
          {items.map((item, index) => {
            const recommendation = getRecommendedAction(item)
            const hasUniqueNote = Boolean(item.notes && item.notes.trim() && item.notes !== recommendation)

            return (
              <TableRow key={`${item.avac_name}-${item.date}-${item.pay_type}-${index}`}>
                <TableCell>{item.date || '—'}</TableCell>
                <TableCell className="max-w-[220px] truncate">{item.avac_name || '—'}</TableCell>
                <TableCell>{item.pay_type}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border-0', getLineStatusClass(item.status))}>
                    {getIssueLabel(item.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(item.expected_amount)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.actual_amount)}</TableCell>
                <TableCell className="text-right">{formatSignedCurrency(item.difference)}</TableCell>
                <TableCell className="max-w-[320px] text-xs leading-5">
                  <p>{recommendation}</p>
                  {hasUniqueNote && <p className="mt-1 text-muted-foreground">{item.notes}</p>}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function PendingItemsTable({ items }: { items: ActionableRow[] }) {
  if (items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-amber-50/50">
            <TableHead>Date</TableHead>
            <TableHead>AVAC</TableHead>
            <TableHead>Claim type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            <TableHead>Follow-up action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const recommendation = getRecommendedAction(item)
            const hasUniqueNote = Boolean(item.notes && item.notes.trim() && item.notes !== recommendation)

            return (
              <TableRow key={`${item.avac_name}-${item.date}-${item.pay_type}-${index}`}>
                <TableCell>{item.date || '—'}</TableCell>
                <TableCell className="max-w-[220px] truncate">{item.avac_name || '—'}</TableCell>
                <TableCell>{item.pay_type}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border-0', getLineStatusClass(item.status))}>
                    {getIssueLabel(item.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(item.expected_amount)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.actual_amount)}</TableCell>
                <TableCell className="text-right">{formatSignedCurrency(item.difference)}</TableCell>
                <TableCell className="max-w-[320px] text-xs leading-5">
                  <p>{recommendation}</p>
                  {hasUniqueNote && <p className="mt-1 text-muted-foreground">{item.notes}</p>}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function AvacActionableTable({ items }: { items: LineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        No actionable items for this AVAC.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Difference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={`${item.date}-${item.pay_type}-${index}`}>
              <TableCell>{item.date || '—'}</TableCell>
              <TableCell>{item.pay_type}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn('border-0', getLineStatusClass(item.status))}>
                  {item.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(item.expected_amount)}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.actual_amount)}</TableCell>
              <TableCell className="text-right">{formatSignedCurrency(item.difference)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AvacItemsTables({ actionableItems, pendingItems, avacName }: { actionableItems: LineItem[]; pendingItems: LineItem[]; avacName?: string }) {
  const pendingRows: ActionableRow[] = pendingItems.map((item) => ({
    ...item,
    avac_name: avacName || '',
  }))
  const hasActionable = actionableItems.length > 0
  const hasPending = pendingRows.length > 0

  if (!hasActionable && !hasPending) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        No actionable items for this AVAC.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {hasActionable && <AvacActionableTable items={actionableItems} />}
      {!hasActionable && hasPending && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No actionable discrepancies, but {pendingRows.length} item(s) require follow-up.
        </p>
      )}
      {hasPending && (
        <div>
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Pending follow-up
          </h5>
          <div className="overflow-hidden rounded-lg border border-amber-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingItems.map((item, index) => (
                  <TableRow key={`${item.date}-${item.pay_type}-${index}`}>
                    <TableCell>{item.date || '—'}</TableCell>
                    <TableCell>{item.pay_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border-0', getLineStatusClass(item.status))}>
                        {getIssueLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.expected_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.actual_amount)}</TableCell>
                    <TableCell className="text-right">{formatSignedCurrency(item.difference)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportSummary({ report }: { report: AvacReport }) {
  const overallMeta = getOverallStatusMeta(report.overall_status)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())

  const toggleDay = (index: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const daysVerified = report.days.filter((d) => d.status === 'OK').length
  const daysWithIssues = report.days.filter((d) =>
    ['UNDERPAID', 'OVERPAID', 'ANOMALY'].includes(d.status)
  ).length
  const daysPending = report.days.filter((d) =>
    ['NOT_YET_PAID', 'POSSIBLY_MISSED', 'CHECK_PREVIOUS'].includes(d.status)
  ).length
  const totalLineItems = report.days.reduce((sum, d) => sum + d.items.length, 0)

  const showPendingCard = daysPending > 0

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3 sm:grid-cols-2', showPendingCard ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Overall status</p>
            <Badge variant="outline" className={cn('mt-2 border-0', overallMeta.className)}>
              {overallMeta.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Days verified</p>
            <p className="mt-2 text-2xl font-semibold">{daysVerified}</p>
            <p className="mt-1 text-xs text-muted-foreground">{totalLineItems} line items checked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Days with issues</p>
            <p className="mt-2 text-2xl font-semibold">{daysWithIssues}</p>
          </CardContent>
        </Card>
        {showPendingCard && (
          <Card className="border-gray-200 bg-gray-50/70">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">Days pending</p>
              <p className="mt-2 text-2xl font-semibold text-gray-700">{daysPending}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {report.earliest_adjustment_date && report.latest_adjustment_date && (
        <Card className="border-slate-200 bg-slate-50/70">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600">Adjustment window</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {formatReportDate(report.earliest_adjustment_date)} – {formatReportDate(report.latest_adjustment_date)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total expected</p>
            <p className="mt-1 font-semibold">{formatCurrency(report.total_expected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total actual</p>
            <p className="mt-1 font-semibold">{formatCurrency(report.total_actual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Difference</p>
            <p className="mt-1 font-semibold">{formatSignedCurrency(report.total_difference)}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Actionable items for this AVAC
        </h4>
        <AvacItemsTables actionableItems={report.actionable_items} pendingItems={report.pending_items ?? []} />
      </div>

      {report.days.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Daily breakdown
          </h4>
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
                {report.days.map((day, index) => {
                  const pendingInfo = getDayStatusIcon(day.status)
                  const isExpandable = !pendingInfo
                  const isExpanded = expandedDays.has(index)

                  return (
                    <React.Fragment key={`${day.date}-${day.day_type}-${index}`}>
                      <TableRow
                        className={cn(
                          isExpandable && 'cursor-pointer hover:bg-muted/50',
                          pendingInfo && getDayStatusClass(day.status).replace('border-', 'bg-').split(' ').find(c => c.startsWith('bg-'))
                        )}
                        onClick={isExpandable ? () => toggleDay(index) : undefined}
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
                        <TableCell>{day.date}</TableCell>
                        <TableCell>{day.day_of_week}</TableCell>
                        <TableCell>{day.day_type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {pendingInfo
                            ? <span>{pendingInfo.icon} {pendingInfo.label}</span>
                            : summarizeShifts(day.items)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border-0', getDayStatusClass(day.status))}>
                            {day.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(day.expected_total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(day.actual_total)}</TableCell>
                        <TableCell className="text-right">{formatSignedCurrency(day.difference)}</TableCell>
                      </TableRow>
                      {isExpandable && isExpanded && day.items.map((item, itemIndex) => (
                        <TableRow
                          key={`${day.date}-item-${itemIndex}`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell className="text-sm">{item.pay_type}</TableCell>
                          <TableCell />
                          <TableCell>
                            <Badge variant="outline" className={cn('border-0 text-xs', getLineStatusClass(item.status))}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(item.expected_amount)}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(item.actual_amount)}</TableCell>
                          <TableCell className="text-right text-sm">{formatSignedCurrency(item.difference)}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReportPage({ params }: ReportPageProps) {
  const [reportId, setReportId] = useState('')
  const [reportCreatedAt, setReportCreatedAt] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisJson | null>(null)
  const [loading, setLoading] = useState(true)

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

  const successfulAvacs = useMemo(
    () =>
      analysis?.avac_results.filter(
        (result): result is AvacResult & { report: AvacReport } => Boolean(result.report)
      ) ?? [],
    [analysis]
  )

  const parseErrorResults = useMemo(
    () =>
      analysis?.avac_results.filter((result): result is AvacResult & { error: string } =>
        Boolean(result.error)
      ) ?? [],
    [analysis]
  )

  const actionableRows = useMemo<ActionableRow[]>(
    () =>
      successfulAvacs.flatMap((result) => {
        const avacName = result.avac_name || 'Unnamed AVAC'
        return result.report.actionable_items.map((item) => ({
          ...item,
          avac_name: avacName,
        }))
      }),
    [successfulAvacs]
  )

  const pendingRows = useMemo<ActionableRow[]>(
    () =>
      successfulAvacs.flatMap((result) => {
        const avacName = result.avac_name || 'Unnamed AVAC'
        return (result.report.pending_items ?? []).map((item) => ({
          ...item,
          avac_name: avacName,
        }))
      }),
    [successfulAvacs]
  )

  const sortedActionableRows = useMemo(() => {
    return [...actionableRows].sort((a, b) => {
      const priorityDiff = getActionPriority(a.status) - getActionPriority(b.status)
      if (priorityDiff !== 0) return priorityDiff

      const magnitudeDiff = Math.abs(toSafeNumber(b.difference)) - Math.abs(toSafeNumber(a.difference))
      if (magnitudeDiff !== 0) return magnitudeDiff

      return `${a.date}-${a.pay_type}`.localeCompare(`${b.date}-${b.pay_type}`)
    })
  }, [actionableRows])

  const sortedPendingRows = useMemo(() => {
    return [...pendingRows].sort((a, b) => {
      const priorityDiff = getActionPriority(a.status) - getActionPriority(b.status)
      if (priorityDiff !== 0) return priorityDiff

      const magnitudeDiff = Math.abs(toSafeNumber(b.difference)) - Math.abs(toSafeNumber(a.difference))
      if (magnitudeDiff !== 0) return magnitudeDiff

      return `${a.date}-${a.pay_type}`.localeCompare(`${b.date}-${b.pay_type}`)
    })
  }, [pendingRows])

  const parseErrorCount = parseErrorResults.length
  const actionableCount = sortedActionableRows.length
  const pendingCount = sortedPendingRows.length

  const statusCounts = useMemo(() => {
    return sortedActionableRows.reduce(
      (acc, item) => {
        if (item.status === 'UNDERPAID' || item.status === 'MISSING') {
          acc.underpaid += 1
        } else if (item.status === 'OVERPAID') {
          acc.overpaid += 1
        } else if (item.status === 'UNMATCHED') {
          acc.unmatched += 1
        } else {
          acc.other += 1
        }
        return acc
      },
      {
        underpaid: 0,
        overpaid: 0,
        unmatched: 0,
        other: 0,
      }
    )
  }, [sortedActionableRows])

  const totalsAcrossAvacs = useMemo(
    () =>
      successfulAvacs.reduce(
        (acc, result) => {
          acc.totalExpected += toSafeNumber(result.report.total_expected)
          acc.totalActual += toSafeNumber(result.report.total_actual)
          acc.totalDifference += toSafeNumber(result.report.total_difference)
          acc.matchCount += result.report.match_count
          acc.discrepancyCount += result.report.discrepancy_count
          acc.missingCount += result.report.missing_count
          acc.unmatchedCount += result.report.unmatched_count
          acc.notYetPaidCount += result.report.not_yet_paid_count ?? 0
          acc.possiblyMissedCount += result.report.possibly_missed_count ?? 0
          // Day-level counts
          for (const day of result.report.days) {
            if (day.status === 'OK') acc.daysVerified += 1
            else if (['UNDERPAID', 'OVERPAID', 'ANOMALY'].includes(day.status)) acc.daysWithIssues += 1
            else if (['NOT_YET_PAID', 'POSSIBLY_MISSED', 'CHECK_PREVIOUS'].includes(day.status)) acc.daysPending += 1
            acc.totalLineItems += day.items.length
          }
          // Widen the adjustment window across all AVACs
          const ea = result.report.earliest_adjustment_date
          const la = result.report.latest_adjustment_date
          if (ea && (!acc.earliestAdjustmentDate || ea < acc.earliestAdjustmentDate)) {
            acc.earliestAdjustmentDate = ea
          }
          if (la && (!acc.latestAdjustmentDate || la > acc.latestAdjustmentDate)) {
            acc.latestAdjustmentDate = la
          }
          return acc
        },
        {
          totalExpected: 0,
          totalActual: 0,
          totalDifference: 0,
          matchCount: 0,
          discrepancyCount: 0,
          missingCount: 0,
          unmatchedCount: 0,
          notYetPaidCount: 0,
          possiblyMissedCount: 0,
          daysVerified: 0,
          daysWithIssues: 0,
          daysPending: 0,
          totalLineItems: 0,
          earliestAdjustmentDate: '' as string,
          latestAdjustmentDate: '' as string,
        }
      ),
    [successfulAvacs]
  )

  const actionableNetDifference = useMemo(
    () => sortedActionableRows.reduce((sum, item) => sum + toSafeNumber(item.difference), 0),
    [sortedActionableRows]
  )

  const actionableGrossDifference = useMemo(
    () => sortedActionableRows.reduce((sum, item) => sum + Math.abs(toSafeNumber(item.difference)), 0),
    [sortedActionableRows]
  )

  const nextSteps = useMemo(() => {
    const steps: string[] = []

    if (analysis?.status === 'correction_payslip') {
      steps.push('Treat this as a correction-only payslip for this pay period.')
      steps.push('Keep this report with the payslip for your records.')
      steps.push('Check the next standard payslip for AVAC-linked entries.')
      return steps
    }

    if (actionableCount === 0 && parseErrorCount === 0) {
      if (totalsAcrossAvacs.possiblyMissedCount > 0) {
        steps.push(
          `Review ${totalsAcrossAvacs.possiblyMissedCount} possibly missed item(s) within the adjustment window and follow up with payroll if needed.`
        )
      }
      if (totalsAcrossAvacs.notYetPaidCount > 0 && totalsAcrossAvacs.notYetPaidCount > totalsAcrossAvacs.possiblyMissedCount) {
        steps.push('Some AVAC dates fall after this payslip\'s adjustment window — check your next payslip.')
      }
      if (totalsAcrossAvacs.possiblyMissedCount === 0 && totalsAcrossAvacs.notYetPaidCount === 0) {
        steps.push('No discrepancy needs payroll follow-up for the parsed AVAC files.')
      }
      steps.push('Store this report with your payslip and AVAC forms.')
      steps.push('Re-run reconciliation if you add more AVAC files later.')
      return steps
    }

    if (statusCounts.underpaid > 0) {
      steps.push(
        `Review ${statusCounts.underpaid} underpaid or missing line item(s), then prepare a payroll query with AVAC evidence.`
      )
    }

    if (statusCounts.overpaid > 0 || statusCounts.unmatched > 0) {
      const issueCount = statusCounts.overpaid + statusCounts.unmatched
      steps.push(
        `Confirm ${issueCount} overpaid or unmatched line item(s) before lodging, to reduce avoidable back-and-forth.`
      )
    }

    if (parseErrorCount > 0) {
      steps.push(`Re-upload ${parseErrorCount} AVAC file(s) that failed parsing so no shift is missed.`)
    }

    steps.push('Use Print summary and attach this report, payslip, and AVAC PDFs to your payroll request.')

    return steps.slice(0, 4)
  }, [
    actionableCount,
    analysis?.status,
    parseErrorCount,
    statusCounts.overpaid,
    statusCounts.underpaid,
    statusCounts.unmatched,
    totalsAcrossAvacs.possiblyMissedCount,
    totalsAcrossAvacs.notYetPaidCount,
  ])

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

  if (!analysis) {
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

  const topLevelStatus =
    analysis.status === 'correction_payslip'
      ? 'CORRECTION_PAYSLIP'
      : statusCounts.underpaid > 0 || statusCounts.overpaid > 0
        ? 'DISCREPANCIES_FOUND'
        : statusCounts.unmatched > 0 || parseErrorCount > 0
          ? 'OK_WITH_ANOMALIES'
          : totalsAcrossAvacs.possiblyMissedCount > 0
            ? 'OK_WITH_PENDING'
            : successfulAvacs.length > 0
              ? 'ALL_MATCH'
              : undefined

  const topLevelMeta = topLevelStatus ? getOverallStatusMeta(topLevelStatus) : null

  const snapshotHeadline =
    analysis.status === 'correction_payslip'
      ? 'Correction payslip detected for this pay period.'
      : actionableCount === 0 && pendingCount > 0 && parseErrorCount === 0 && successfulAvacs.length > 0
        ? `No discrepancies found, but ${pendingCount} item(s) pending follow-up.`
        : actionableCount === 0 && parseErrorCount === 0 && successfulAvacs.length > 0
          ? 'No actionable discrepancy found in parsed AVAC files.'
          : actionableCount === 0 && parseErrorCount > 0
          ? 'Some AVAC files failed parsing, so the report is incomplete.'
          : actionableNetDifference > 0.01
            ? `Potential overpayment ${formatCurrency(actionableNetDifference)} across ${actionableCount} item(s).`
            : actionableNetDifference < -0.01
              ? `Potential underpayment ${formatCurrency(Math.abs(actionableNetDifference))} across ${actionableCount} item(s).`
              : `Mixed discrepancies across ${actionableCount} item(s).`

  const snapshotDetail =
    analysis.status === 'correction_payslip'
      ? 'This period appears to include correction or reversal entries rather than new overtime or recall payments.'
      : actionableCount > 0
        ? `Largest-impact items are listed first below. Gross discrepancy across actionable items: ${formatCurrency(actionableGrossDifference)}.`
        : 'This summary is based only on AVAC files that parsed successfully.'

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
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
            <p className="mt-2 text-xl font-semibold">{snapshotHeadline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{snapshotDetail}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Top-level status</p>
                {topLevelMeta ? (
                  <Badge variant="outline" className={cn('mt-2 border-0', topLevelMeta.className)}>
                    {topLevelMeta.label}
                  </Badge>
                ) : (
                  <p className="mt-2 text-sm">—</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Parsed AVACs</p>
                <p className="mt-2 text-2xl font-semibold">
                  {successfulAvacs.length}/{analysis.avac_results.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Parse errors</p>
                <p className="mt-2 text-2xl font-semibold">{parseErrorCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Actionable items</p>
                <p className="mt-2 text-2xl font-semibold">{actionableCount}</p>
                {pendingCount > 0 && (
                  <p className="mt-1 text-xs text-amber-700">{pendingCount} pending</p>
                )}
              </CardContent>
            </Card>
          </div>

          {totalsAcrossAvacs.notYetPaidCount > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-gray-200 bg-gray-50/70">
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Not yet paid</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-700">{totalsAcrossAvacs.notYetPaidCount}</p>
                </CardContent>
              </Card>
              {totalsAcrossAvacs.possiblyMissedCount > 0 && (
                <Card className="border-amber-200 bg-amber-50/70">
                  <CardContent className="pt-6">
                    <p className="text-sm text-amber-700">Possibly missed</p>
                    <p className="mt-2 text-2xl font-semibold text-amber-800">{totalsAcrossAvacs.possiblyMissedCount}</p>
                  </CardContent>
                </Card>
              )}
              {totalsAcrossAvacs.earliestAdjustmentDate && totalsAcrossAvacs.latestAdjustmentDate && (
                <Card className="border-slate-200 bg-slate-50/70">
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-600">Adjustment window</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {formatReportDate(totalsAcrossAvacs.earliestAdjustmentDate)} – {formatReportDate(totalsAcrossAvacs.latestAdjustmentDate)}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Adjustment total</p>
                <p className="mt-1 font-semibold">{formatCurrency(analysis.adjustment_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Base rate</p>
                <p className="mt-1 font-semibold">{formatCurrency(analysis.base_rate)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Older adjustments total</p>
                <p className="mt-1 font-semibold">{formatCurrency(analysis.older_adjustments_total)}</p>
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

      <Card className="mb-6 border-blue-200/70">
        <CardHeader>
          <CardTitle className="text-lg">What to do now</CardTitle>
          <CardDescription>Use this checklist before contacting payroll.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {nextSteps.map((step, index) => (
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Actionable items to review first</CardTitle>
              <CardDescription>
                Sorted by severity and difference to support faster payroll triage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn('grid gap-3 sm:grid-cols-2', pendingCount > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
                <Card className="border-red-100 bg-red-50/70">
                  <CardContent className="pt-6">
                    <p className="text-sm text-red-700">Underpaid / missing</p>
                    <p className="mt-2 text-2xl font-semibold text-red-800">{statusCounts.underpaid}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-100 bg-amber-50/70">
                  <CardContent className="pt-6">
                    <p className="text-sm text-amber-700">Potential overpaid</p>
                    <p className="mt-2 text-2xl font-semibold text-amber-800">{statusCounts.overpaid}</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-slate-100/60">
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-700">Unmatched items</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">{statusCounts.unmatched}</p>
                  </CardContent>
                </Card>
                {pendingCount > 0 && (
                  <Card className="border-amber-200 bg-amber-50/70">
                    <CardContent className="pt-6">
                      <p className="text-sm text-amber-700">Pending follow-up</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-800">{pendingCount}</p>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Net discrepancy</p>
                    <p className="mt-2 text-2xl font-semibold">{formatSignedCurrency(actionableNetDifference)}</p>
                  </CardContent>
                </Card>
              </div>

              <DoctorActionableTable items={sortedActionableRows} />

              {sortedPendingRows.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-amber-800">Pending items — follow up with payroll</h3>
                  <p className="text-sm text-muted-foreground">
                    These items fall within the adjustment window but were not found on this payslip. They may have been paid on an earlier payslip or may need follow-up.
                  </p>
                  <PendingItemsTable items={sortedPendingRows} />
                </div>
              )}
            </CardContent>
          </Card>

          {parseErrorResults.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Some AVAC files could not be processed</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-5">
                  {parseErrorResults.map((result, index) => (
                    <li key={`${result.avac_name}-${index}`}>
                      {result.avac_name || `AVAC ${index + 1}`}: {result.error}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reconciliation totals (parsed AVACs)</CardTitle>
              <CardDescription>
                Day-level summary across successfully parsed files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Days verified</p>
                    <p className="mt-1 text-2xl font-semibold">{totalsAcrossAvacs.daysVerified}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{totalsAcrossAvacs.matchCount} line matches</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Days with issues</p>
                    <p className="mt-1 text-2xl font-semibold">{totalsAcrossAvacs.daysWithIssues}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {totalsAcrossAvacs.discrepancyCount} discrepancies, {totalsAcrossAvacs.missingCount} missing, {totalsAcrossAvacs.unmatchedCount} unmatched
                    </p>
                  </CardContent>
                </Card>
                {totalsAcrossAvacs.daysPending > 0 && (
                  <Card className="border-gray-200 bg-gray-50/70">
                    <CardContent className="pt-6">
                      <p className="text-sm text-gray-600">Days pending</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-700">{totalsAcrossAvacs.daysPending}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total expected</p>
                    <p className="mt-1 font-semibold">{formatCurrency(totalsAcrossAvacs.totalExpected)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total actual</p>
                    <p className="mt-1 font-semibold">{formatCurrency(totalsAcrossAvacs.totalActual)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total difference</p>
                    <p className="mt-1 font-semibold">{formatSignedCurrency(totalsAcrossAvacs.totalDifference)}</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Per-AVAC details</CardTitle>
              <CardDescription>
                Expand any file for day-level breakdown and the full reconciliation detail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full rounded-lg border">
                {analysis.avac_results.map((result, index) => {
                  const reportMeta = result.report
                    ? getOverallStatusMeta(result.report.overall_status)
                    : getOverallStatusMeta('OK_WITH_ANOMALIES')

                  return (
                    <AccordionItem
                      key={`${result.avac_name}-${index}`}
                      value={`avac-${index}`}
                      className="px-4 last:border-b-0"
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 pr-2 text-left">
                          <span className="truncate font-medium">
                            {result.avac_name || `AVAC ${index + 1}`}
                          </span>

                          {result.error ? (
                            <Badge variant="outline" className="border-0 bg-red-50 text-red-700">
                              Parse error
                            </Badge>
                          ) : result.report ? (
                            <>
                              {result.report.actionable_items.length > 0 && (
                                <Badge variant="outline" className="border-0 bg-red-50 text-red-700">
                                  {result.report.actionable_items.length} actionable
                                </Badge>
                              )}
                              {(result.report.pending_items ?? []).length > 0 && (
                                <Badge variant="outline" className="border-0 bg-amber-50 text-amber-700">
                                  {(result.report.pending_items ?? []).length} pending
                                </Badge>
                              )}
                              {result.report.actionable_items.length === 0 && (result.report.pending_items ?? []).length === 0 && (
                                <Badge variant="outline" className="border-0 bg-emerald-50 text-emerald-700">
                                  All clear
                                </Badge>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700">
                              No report
                            </Badge>
                          )}

                          {!result.error && (
                            <Badge variant="outline" className={cn('border-0', reportMeta.className)}>
                              {reportMeta.label}
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {result.error ? (
                          <Alert variant="destructive">
                            <AlertTitle>Failed to process AVAC</AlertTitle>
                            <AlertDescription>{result.error}</AlertDescription>
                          </Alert>
                        ) : result.report ? (
                          <ReportSummary report={result.report} />
                        ) : (
                          <p className="text-sm text-muted-foreground">No report returned for this AVAC.</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Technical details
          </CardTitle>
          <CardDescription>Open only if you need debug-level payload detail.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full rounded-lg border px-4">
            <AccordionItem value="raw-json" className="border-none">
              <AccordionTrigger className="hover:no-underline">
                Raw JSON response from /api/reconcile
              </AccordionTrigger>
              <AccordionContent>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
