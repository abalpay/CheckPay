'use client'

import { Fragment, forwardRef, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Filter,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  normalizeAnalysisJson,
  type AnalysisJson,
  type AuditRow,
  type AvacNormalizedType,
  type AvacStatus,
} from '@/lib/jobs'
import { createClient } from '@/lib/supabase-client'

interface ReportPageProps {
  params: Promise<{
    id: string
  }>
}

const TYPE_LABELS: Record<AvacNormalizedType, string> = {
  overtime: 'Overtime',
  recall_onsite: 'Recall onsite',
  recall_offsite: 'Recall offsite',
  fatigue: 'Fatigue',
  other: 'Other',
}

interface BadgeMeta {
  label: string
  className: string
}

const STATUS_BADGE_META: Record<string, BadgeMeta> = {
  matched: {
    label: 'Matched',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  matched_with_reversal: {
    label: 'Matched',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  partially_matched: {
    label: 'Partially matched',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  partially_matched_with_reversal: {
    label: 'Partially matched',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  unmatched: {
    label: 'Unmatched',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  unmatched_with_reversal: {
    label: 'Unmatched',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  reversal_only: {
    label: 'Reversal only',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  check_next_payslip: {
    label: 'Check next payslip',
    className: 'border-purple-200 bg-purple-50 text-purple-700',
  },
  check_previous_payslip: {
    label: 'Check previous payslip',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  future: {
    label: 'Future dated',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  invalid: {
    label: 'Invalid',
    className: 'border-slate-300 bg-slate-100 text-slate-600',
  },
  current_period: {
    label: 'Current period',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
}

const ACTIONABLE_STATUSES = new Set<AvacStatus>(['unmatched', 'reversal_only'])

const STATUS_FILTER_ORDER: AvacStatus[] = [
  'matched',
  'matched_with_reversal',
  'partially_matched',
  'partially_matched_with_reversal',
  'unmatched',
  'unmatched_with_reversal',
  'reversal_only',
  'check_next_payslip',
  'check_previous_payslip',
  'future',
  'current_period',
  'invalid',
]

const TYPE_FILTER_ORDER: AvacNormalizedType[] = [
  'overtime',
  'recall_onsite',
  'recall_offsite',
  'fatigue',
  'other',
]

type SortColumn = 'date' | 'variation' | 'required_units' | 'matched_units' | 'status'

interface SortConfig {
  column: SortColumn
  direction: 'asc' | 'desc'
}

type ReportRow = AuditRow & {
  matched_via_regular_pay?: boolean
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const supabase = createClient()

function parseDateString(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const direct = new Date(trimmed)
    return Number.isNaN(direct.getTime()) ? null : direct
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/')
    const iso = `${year}-${month}-${day}`
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('.')
    const iso = `${year}-${month}-${day}`
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const fallback = new Date(trimmed)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function formatDisplayDate(value: string | null | undefined): string {
  const parsed = parseDateString(value)
  return parsed ? dateFormatter.format(parsed) : value ?? '—'
}

function formatPayPeriod(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/[_-]/g, '–')
}

function formatHours(value: number | null | undefined, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  const rounded = Number(value.toFixed(2))
  return `${rounded}h`
}

function rowKey(row: AuditRow, index: number): string {
  return `${row.date}-${row.variation}-${index}`
}

function toStartCase(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getStatusMeta(status: string): BadgeMeta {
  return STATUS_BADGE_META[status] ?? {
    label: toStartCase(status),
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  }
}

function getStatusLabel(status: string): string {
  const meta = STATUS_BADGE_META[status]
  if (meta) return meta.label
  if (status.endsWith('_with_reversal')) {
    const base = status.replace('_with_reversal', '')
    return getStatusLabel(base)
  }
  return toStartCase(status)
}

function getTypeLabel(value: string): string {
  return TYPE_LABELS[value as AvacNormalizedType] ?? toStartCase(value)
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function getRowFlags(row: ReportRow): string[] {
  const flags: string[] = []
  if (row.matched_via_regular_pay) {
    flags.push('Matched via regular pay')
  }
  if (row.is_fatigue) {
    flags.push('Fatigue allocation')
  }
  if (row.type_mapped_from) {
    flags.push(`Mapped from ${toStartCase(row.type_mapped_from)}`)
  }
  return flags
}

// Matched (h) column prefers payslip_units, but reversal-only rows surface the raw units to show negatives.
function getMatchedUnits(row: ReportRow): number | null {
  if (row.status === 'reversal_only') {
    if (typeof row.payslip_units_raw === 'number') return row.payslip_units_raw
    return typeof row.payslip_units === 'number' ? row.payslip_units : null
  }
  return typeof row.payslip_units === 'number' ? row.payslip_units : null
}

function compareRows(column: SortColumn, a: ReportRow, b: ReportRow): number {
  switch (column) {
    case 'date': {
      const dateA = parseDateString(a.date)
      const dateB = parseDateString(b.date)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.getTime() - dateB.getTime()
    }
    case 'variation':
      return a.variation.localeCompare(b.variation)
    case 'required_units':
      return (a.required_units ?? 0) - (b.required_units ?? 0)
    case 'matched_units': {
      const unitsA = getMatchedUnits(a)
      const unitsB = getMatchedUnits(b)
      if (unitsA == null && unitsB == null) return 0
      if (unitsA == null) return 1
      if (unitsB == null) return -1
      return unitsA - unitsB
    }
    case 'status':
      return getStatusLabel(a.status).localeCompare(getStatusLabel(b.status))
    default:
      return 0
  }
}

export default function ReportPage({ params }: ReportPageProps) {
  const [analysis, setAnalysis] = useState<AnalysisJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobId, setJobId] = useState('')
  const [debugOpen, setDebugOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: 'date',
    direction: 'asc',
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  useEffect(() => {
    params.then((p) => setJobId(p.id))
  }, [params])

  useEffect(() => {
    if (!jobId) return

    let isMounted = true

    const fetchReport = async () => {
      try {
        setLoading(true)
        setAnalysis(null)

        const { data, error } = await supabase
          .from('reports')
          .select('report_data')
          .eq('id', jobId)
          .single()

        if (!isMounted) return

        if (error) {
          if (error.code !== 'PGRST116') {
            console.error('Failed to load report from Supabase', error)
          }
          setAnalysis(null)
          setLoading(false)
          return
        }

        if (!data?.report_data) {
          console.warn('Report record did not include report_data', data)
          setAnalysis(null)
          setLoading(false)
          return
        }

        const normalised = normalizeAnalysisJson(data.report_data)

        if (normalised) {
          setAnalysis(normalised)
        } else {
          console.warn('Fetched report_data has unexpected shape', data.report_data)
          setAnalysis(null)
        }

        setLoading(false)
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading report', error)
        setAnalysis(null)
        setLoading(false)
      }
    }

    void fetchReport()

    return () => {
      isMounted = false
    }
  }, [jobId])

  const rows = useMemo<ReportRow[]>(
    () => ((analysis?.rows as ReportRow[]) ?? []).map((row) => row),
    [analysis]
  )

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((row) => row.status))
    const ordered = STATUS_FILTER_ORDER.filter((status) => present.has(status))
    const extras = Array.from(present).filter(
      (status) => !STATUS_FILTER_ORDER.includes(status as AvacStatus)
    )
    extras.sort((a, b) => getStatusLabel(a).localeCompare(getStatusLabel(b)))
    return [...ordered, ...extras].map((status) => ({
      value: status,
      label: getStatusLabel(status),
    }))
  }, [rows])

  const typeOptions = useMemo(() => {
    const present = new Set(rows.map((row) => row.normalized_type))
    const ordered = TYPE_FILTER_ORDER.filter((type) => present.has(type))
    const extras = Array.from(present).filter(
      (type) => !TYPE_FILTER_ORDER.includes(type as AvacNormalizedType)
    )
    extras.sort((a, b) => getTypeLabel(a).localeCompare(getTypeLabel(b)))
    return [...ordered, ...extras].map((type) => ({
      value: type,
      label: getTypeLabel(type),
    }))
  }, [rows])

  useEffect(() => {
    if (!analysis || !statusOptions.length) return
    setStatusFilter(new Set(statusOptions.map((option) => option.value)))
  }, [analysis, statusOptions])

  useEffect(() => {
    if (!analysis || !typeOptions.length) return
    setTypeFilter(new Set(typeOptions.map((option) => option.value)))
  }, [analysis, typeOptions])

  const partiallyMatchedCount = useMemo(
    () => rows.filter((row) => row.status === 'partially_matched').length,
    [rows]
  )

  const unmatchedCount = useMemo(
    () =>
      rows.filter(
        (row) => row.status === 'unmatched' || row.status === 'reversal_only'
      ).length,
    [rows]
  )

  // "Needs follow-up" highlights only rows that need action now (unmatched + reversal only).
  const needsFollowUpRows = useMemo(
    () => rows.filter((row) => ACTIONABLE_STATUSES.has(row.status)),
    [rows]
  )

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter.size && !statusFilter.has(row.status)) return false
      if (typeFilter.size && !typeFilter.has(row.normalized_type)) return false
      return true
    })
  }, [rows, statusFilter, typeFilter])

  const sortedRows = useMemo(() => {
    const next = [...filteredRows]
    const multiplier = sortConfig.direction === 'asc' ? 1 : -1
    next.sort((a, b) => {
      const primary = compareRows(sortConfig.column, a, b)
      if (primary !== 0) return primary * multiplier
      const secondary = compareRows('variation', a, b)
      if (secondary !== 0) return secondary
      return compareRows('date', a, b)
    })
    return next
  }, [filteredRows, sortConfig])

  const followUpRows = useMemo(() => {
    const next = [...needsFollowUpRows]
    next.sort((a, b) => {
      const dateCompare = compareRows('date', a, b)
      if (dateCompare !== 0) return dateCompare
      return compareRows('variation', a, b)
    })
    return next
  }, [needsFollowUpRows])

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleStatus = (value: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }

  const toggleType = (value: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }

  const handleSort = (column: SortColumn) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return { column, direction: 'asc' }
    })
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading report…
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Payslip audit not found</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Re-run the check to generate a fresh report.
            </p>
            <Button asChild>
              <Link href="/check/new">Run a new check</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const summary = analysis.audit_summary
  const payPeriodLabel = formatPayPeriod(summary.pay_period)
  const payDateLabel = formatDisplayDate(summary.pay_date)
  const coverageLabel = summary.coverage_percentage ?? '—'

  /**
   * KPI + panel logic (units-first brief):
   * - Total entries from audit_summary.total_avac_claims (fallback rows.length).
   * - Matched comes from audit_summary.matched_claims.
   * - Partial count = rows where status === 'partially_matched'.
   * - Unmatched KPI and "Needs follow-up" = statuses 'unmatched' + 'reversal_only'.
   * - Waiting chip summarises audit_summary.check_previous/next_payslip_claims only.
   */
  const totalEntries = summary.total_avac_claims ?? rows.length
  const matchedTotal = summary.matched_claims ?? 0
  const waitingNext =
    summary.check_next_payslip_claims ??
    rows.filter((row) => row.status === 'check_next_payslip').length
  const waitingPrevious =
    summary.check_previous_payslip_claims ??
    rows.filter((row) => row.status === 'check_previous_payslip').length
  const waitingTotal = waitingNext + waitingPrevious

  return (
    <TooltipProvider>
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <Button variant="ghost" asChild className="mb-6">
          <Link href="/check/new" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to upload
          </Link>
        </Button>

        <section className="mb-8">
          <div className="flex flex-col gap-4 rounded-xl border bg-background px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 text-base font-semibold">
                <CalendarDays className="h-4 w-4" />
                <span>{payPeriodLabel}</span>
              </div>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pay date
                </span>
                <span className="font-medium text-foreground">{payDateLabel}</span>
              </span>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Coverage
              </span>
              <span className="text-2xl font-semibold">{coverageLabel}</span>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="flex flex-wrap gap-3">
            <KpiChip label="Total entries" value={totalEntries} />
            <KpiChip label="Matched" value={matchedTotal} />
            <KpiChip label="Partially matched" value={partiallyMatchedCount} />
            <KpiChip label="Unmatched" value={unmatchedCount} />
            <Popover>
              <PopoverTrigger asChild>
                <KpiChip
                  label="Waiting (other payslip)"
                  value={waitingTotal}
                  interactive
                  ariaLabel="Waiting breakdown"
                />
              </PopoverTrigger>
              <PopoverContent className="w-48 text-sm" align="start">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Prev</span>
                    <span className="font-medium">{waitingPrevious}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Next</span>
                    <span className="font-medium">{waitingNext}</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </section>

        <section className="mb-10">
          <Card>
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Needs follow-up
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {followUpRows.length} {followUpRows.length === 1 ? 'entry' : 'entries'} require action now.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {followUpRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing needs action right now.
                </p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Required (h)</TableHead>
                          <TableHead className="text-right">Matched (h)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {followUpRows.map((row, index) => {
                          const key = rowKey(row, index)
                          const statusMeta = getStatusMeta(row.status)
                          const matchedLabel =
                            row.status === 'reversal_only'
                              ? formatHours(row.payslip_units_raw)
                              : formatHours(row.payslip_units)
                          const reason = row.match_details ?? ''
                          const shortReason = truncate(reason, 72)
                          const showTooltip = reason.length > shortReason.length
                          const reasonNode = (
                            <span className="line-clamp-2 text-sm text-muted-foreground">
                              {shortReason}
                            </span>
                          )

                          return (
                            <TableRow key={key}>
                              <TableCell>{formatDisplayDate(row.date)}</TableCell>
                              <TableCell>
                                <div className="font-medium leading-tight">{row.variation}</div>
                                <div className="text-xs text-muted-foreground">
                                  {TYPE_LABELS[row.normalized_type]}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatHours(row.required_units)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {matchedLabel}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn('flex w-fit items-center gap-1', statusMeta.className)}
                                >
                                  {statusMeta.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs">
                                {showTooltip ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>{reasonNode}</TooltipTrigger>
                                    <TooltipContent className="max-w-sm whitespace-pre-line text-sm">
                                      {reason}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  reasonNode
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 md:hidden">
                    {followUpRows.map((row, index) => {
                      const key = rowKey(row, index)
                      const statusMeta = getStatusMeta(row.status)
                      return (
                        <div key={key} className="rounded-lg border p-4 shadow-sm">
                          <div className="flex justify-between gap-3">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {formatDisplayDate(row.date)}
                              </p>
                              <p className="font-semibold">{row.variation}</p>
                              <p className="text-xs text-muted-foreground">
                                {TYPE_LABELS[row.normalized_type]}
                              </p>
                            </div>
                            <Badge variant="outline" className={statusMeta.className}>
                              {statusMeta.label}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Required (h)</p>
                              <p className="font-medium">{formatHours(row.required_units)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Matched (h)</p>
                              <p className="font-medium">
                                {row.status === 'reversal_only'
                                  ? formatHours(row.payslip_units_raw)
                                  : formatHours(row.payslip_units)}
                              </p>
                            </div>
                          </div>
                          {row.match_details && (
                            <p className="mt-3 text-sm text-muted-foreground">
                              {truncate(row.match_details, 120)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mb-10" aria-labelledby="full-results-heading">
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle id="full-results-heading" className="text-base font-semibold">
                  Full results
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Filter by status or type, sort the grid, and open any row for detail.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <MultiSelect
                  label="Status"
                  options={statusOptions}
                  selected={statusFilter}
                  onToggle={toggleStatus}
                />
                <MultiSelect
                  label="Type"
                  options={typeOptions}
                  selected={typeFilter}
                  onToggle={toggleType}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="hidden md:block">
                {/* Date → row.date, Type → row.variation + normalized_type, Required → required_units, Matched → payslip_units/raw, Status → row.status, Notes → match_details */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <SortHeader
                          column="date"
                          label="Date"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortHeader
                          column="variation"
                          label="Type"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortHeader
                          column="required_units"
                          label="Required (h)"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortHeader
                          column="matched_units"
                          label="Matched (h)"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortHeader
                          column="status"
                          label="Status"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No claims match the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row, index) => {
                        const key = rowKey(row, index)
                        const expanded = expandedRows.has(key)
                        const statusMeta = getStatusMeta(row.status)
                        const matchedUnits = getMatchedUnits(row)
                        const matchedDisplay =
                          row.status === 'reversal_only'
                            ? formatHours(row.payslip_units_raw)
                            : formatHours(matchedUnits)
                        const note = row.match_details ?? ''
                        const shortNote = truncate(note, 96)
                        const showTooltip = note.length > shortNote.length
                        const flagNotes = getRowFlags(row)

                        return (
                          <Fragment key={key}>
                            <TableRow className={cn(expanded && 'bg-muted/40')}>
                              <TableCell>{formatDisplayDate(row.date)}</TableCell>
                              <TableCell className="align-top">
                                <div className="font-medium leading-tight">{row.variation}</div>
                                <div className="text-xs text-muted-foreground">
                                  {TYPE_LABELS[row.normalized_type]}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatHours(row.required_units)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {matchedDisplay}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn('flex w-fit items-center gap-1', statusMeta.className)}
                                >
                                  {statusMeta.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-sm">
                                <div className="flex flex-col gap-2">
                                  {note ? (
                                    showTooltip ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="line-clamp-2 text-sm text-muted-foreground">
                                            {shortNote}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-md whitespace-pre-line text-sm">
                                          {note}
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">
                                        {shortNote}
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="h-auto p-0 text-sm"
                                    onClick={() => toggleRow(key)}
                                  >
                                    {expanded ? 'Hide detail' : 'View detail'}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {expanded && (
                              <TableRow className="bg-muted/20">
                                <TableCell colSpan={6}>
                                  <div className="space-y-4 py-4 text-sm">
                                    {note && (
                                      <div>
                                        <p className="font-medium text-muted-foreground">Detail</p>
                                        <p className="whitespace-pre-line">{note}</p>
                                      </div>
                                    )}
                                    {row.matched_parts && row.matched_parts.length > 0 && (
                                      <div>
                                        <p className="font-medium text-muted-foreground">
                                          Matched parts
                                        </p>
                                        <ul className="list-disc space-y-1 pl-5">
                                          {row.matched_parts.map((part, partIndex) => (
                                            <li key={`${key}-part-${partIndex}`}>
                                              {part.type} — {formatHours(part.units)}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {flagNotes.length > 0 && (
                                      <div>
                                        <p className="font-medium text-muted-foreground">
                                          Additional notes
                                        </p>
                                        <ul className="list-disc space-y-1 pl-5">
                                          {flagNotes.map((flag, flagIndex) => (
                                            <li key={`${key}-flag-${flagIndex}`}>{flag}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {row.status === 'reversal_only' && (
                                      <div className="grid gap-2 text-sm md:grid-cols-3">
                                        <DetailStat label="Positive" value={formatHours(row.reversal_pos_sum)} />
                                        <DetailStat label="Negative" value={formatHours(row.reversal_neg_sum)} />
                                        <DetailStat label="Net" value={formatHours(row.reversal_net_units)} />
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 md:hidden">
                {sortedRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No claims match the selected filters.
                  </p>
                ) : (
                  sortedRows.map((row, index) => {
                    const key = rowKey(row, index)
                    return (
                      <MobileRowCard
                        key={key}
                        row={row}
                        expanded={expandedRows.has(key)}
                        onToggle={() => toggleRow(key)}
                      />
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="mt-8">
          <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <CardTitle className="text-base">Debug information</CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="text-sm">
                  <span className="font-medium">Rows received:</span> {analysis.debug.rows_received}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Expected rows:</span> {analysis.debug.expected_rows}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Period end parsed:</span> {analysis.debug.period_end_parsed}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/check/new">Start another analysis</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

interface DetailStatProps {
  label: string
  value: string
}

function DetailStat({ label, value }: DetailStatProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  label: string
  options: MultiSelectOption[]
  selected: Set<string>
  onToggle: (value: string) => void
}

function MultiSelect({ label, options, selected, onToggle }: MultiSelectProps) {
  const selectedCount = options.reduce(
    (count, option) => (selected.has(option.value) ? count + 1 : count),
    0
  )
  const summary =
    selectedCount === options.length
      ? 'All'
      : `${selectedCount}/${options.length}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[160px] justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5" />
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[220px]" align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={() => onToggle(option.value)}
            className="capitalize"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface SortHeaderProps {
  column: SortColumn
  label: string
  sortConfig: SortConfig
  onSort: (column: SortColumn) => void
}

function SortHeader({ column, label, sortConfig, onSort }: SortHeaderProps) {
  const isActive = sortConfig.column === column
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'flex w-full items-center gap-1 text-left text-sm font-medium text-muted-foreground hover:text-foreground',
        isActive && 'text-foreground'
      )}
    >
      {label}
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 transition',
          !isActive && 'opacity-0',
          isActive && sortConfig.direction === 'asc' && '-rotate-180'
        )}
      />
    </button>
  )
}

interface MobileRowCardProps {
  row: ReportRow
  expanded: boolean
  onToggle: () => void
}

function MobileRowCard({ row, expanded, onToggle }: MobileRowCardProps) {
  const statusMeta = getStatusMeta(row.status)
  const matchedDisplay =
    row.status === 'reversal_only'
      ? formatHours(row.payslip_units_raw)
      : formatHours(getMatchedUnits(row))
  const note = row.match_details ?? ''
  const flagNotes = getRowFlags(row)

  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="flex justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {formatDisplayDate(row.date)}
          </p>
          <p className="font-semibold">{row.variation}</p>
          <p className="text-xs text-muted-foreground">
            {TYPE_LABELS[row.normalized_type]}
          </p>
        </div>
        <Badge variant="outline" className={statusMeta.className}>
          {statusMeta.label}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Required (h)</p>
          <p className="font-medium">{formatHours(row.required_units)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Matched (h)</p>
          <p className="font-medium">{matchedDisplay}</p>
        </div>
      </div>
      {note && !expanded && (
        <p className="mt-3 text-sm text-muted-foreground">
          {truncate(note, 120)}
        </p>
      )}
      <Button
        type="button"
        variant="link"
        className="mt-2 h-auto p-0 text-sm"
        onClick={onToggle}
      >
        {expanded ? 'Hide detail' : 'View detail'}
      </Button>
      {expanded && (
        <div className="mt-3 space-y-3 text-sm">
          {note && <p className="whitespace-pre-line text-muted-foreground">{note}</p>}
          {row.matched_parts && row.matched_parts.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Matched parts</p>
              <ul className="mt-2 space-y-1">
                {row.matched_parts.map((part, index) => (
                  <li key={`${row.date}-${index}`}>
                    {part.type} — {formatHours(part.units)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {flagNotes.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Additional notes</p>
              <ul className="mt-2 space-y-1">
                {flagNotes.map((flag, index) => (
                  <li key={`${row.date}-flag-${index}`}>{flag}</li>
                ))}
              </ul>
            </div>
          )}
          {row.status === 'reversal_only' && (
            <div className="grid gap-2 text-sm">
              <DetailStat label="Positive" value={formatHours(row.reversal_pos_sum)} />
              <DetailStat label="Negative" value={formatHours(row.reversal_neg_sum)} />
              <DetailStat label="Net" value={formatHours(row.reversal_net_units)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface KpiChipProps {
  label: string
  value: number | string
  interactive?: boolean
  ariaLabel?: string
}

const KpiChip = forwardRef<HTMLButtonElement, KpiChipProps>(function KpiChip(
  { label, value, interactive, ariaLabel },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel ?? label}
      className={cn(
        'flex min-w-[150px] flex-col rounded-full border bg-card/90 px-4 py-2 text-left shadow-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-100',
        !interactive && 'cursor-default hover:border-border'
      )}
      disabled={!interactive}
    >
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </button>
  )
})
