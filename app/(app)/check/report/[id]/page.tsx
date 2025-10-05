'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Info,
  Loader2,
  ShieldAlert,
  Table as TableIcon,
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
import type { Tables } from '@/lib/database.types'

interface ReportPageProps {
  params: Promise<{
    id: string
  }>
}

const TYPE_LABELS: Record<AvacNormalizedType, string> = {
  overtime: 'Overtime',
  recall_onsite: 'Recall',
  recall_offsite: 'Recall (offsite)',
  fatigue: 'Fatigue',
  other: 'Other',
}

interface BadgeMeta {
  label: string
  className: string
  icon?: LucideIcon
}

const STATUS_BADGE_META: Record<string, BadgeMeta> = {
  paid: {
    label: 'Paid',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  partially_paid: {
    label: 'Partially paid',
    className: 'border-[#FFD9A8] bg-[#FFEED9] text-[#B15B1A]',
    icon: Clock,
  },
  unpaid: {
    label: 'Unpaid',
    className: 'border-[#F6B4B4] bg-[#FDECEC] text-[#D14343]',
    icon: AlertTriangle,
  },
  check_next_payslip: {
    label: 'Check next payslip',
    className: 'border-purple-200 bg-purple-50 text-purple-700',
    icon: Clock,
  },
  check_previous_payslip: {
    label: 'Check previous payslip',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: Clock,
  },
  future: {
    label: 'Future dated',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: CalendarDays,
  },
  invalid: {
    label: 'Invalid',
    className: 'border-slate-300 bg-slate-100 text-slate-600',
    icon: AlertTriangle,
  },
  current_period: {
    label: 'Current period',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: Clock,
  },
}

const ACTIONABLE_STATUSES = new Set<AvacStatus>(['unpaid', 'partially_paid'])

type FilterOption = 'all' | 'paid' | 'partially_paid' | 'unpaid' | 'other_payslip'

const FILTER_OPTIONS: Array<{ value: FilterOption; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other_payslip', label: 'Other payslip' },
]

const FILTER_STATUS_MAP: Record<Exclude<FilterOption, 'all'>, AvacStatus[]> = {
  paid: ['paid'],
  partially_paid: ['partially_paid'],
  unpaid: ['unpaid'],
  other_payslip: ['check_next_payslip', 'check_previous_payslip'],
}

type SummaryCardKey = 'totalClaims' | 'paid' | 'needsFollowUp' | 'otherPayslip'

interface SummaryCardBreakdown {
  label: string
  value: number
}

interface ReportSummaryCard {
  key: SummaryCardKey
  label: string
  value: number
  breakdown?: SummaryCardBreakdown[]
}

const SUMMARY_CARD_STYLES: Record<SummaryCardKey, { card: string; accent: string }> = {
  totalClaims: {
    card: 'from-blue-500/10 to-indigo-500/10 border-blue-200/40',
    accent: 'bg-gradient-to-r from-blue-500 to-indigo-500',
  },
  paid: {
    card: 'from-emerald-500/10 to-teal-500/10 border-emerald-200/40',
    accent: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  },
  needsFollowUp: {
    card: 'from-amber-500/10 to-orange-500/10 border-amber-200/40',
    accent: 'bg-gradient-to-r from-amber-500 to-orange-500',
  },
  otherPayslip: {
    card: 'from-rose-500/10 to-pink-500/10 border-rose-200/40',
    accent: 'bg-gradient-to-r from-rose-500 to-pink-500',
  },
}

type SortColumn = 'date' | 'variation' | 'required_units' | 'matched_units' | 'status'

interface SortConfig {
  column: SortColumn
  direction: 'asc' | 'desc'
}

type ReportRow = AuditRow

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const generatedDateFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'long',
})

const generatedTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeStyle: 'short',
})

const supabase = createClient()

function parseDateString(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{1,2}[\/.]\d{1,2}$/.test(trimmed)) {
    return null
  }

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
  const normalized = value.replace(/\s+to\s+/gi, ' \u2013 ')
  return normalized.replace(/_/g, ' \u2013 ')
}

function formatPayPeriodRecon(pp?: string | null): string {
  if (!pp) return '—'
  const [startRaw, endRaw] = pp.split(/\s+to\s+/i)
  if (!startRaw || !endRaw) return formatPayPeriod(pp)
  const fmt = (segment: string) => {
    const trimmed = segment.trim()
    if (/^\d{1,2}[\/.]\d{1,2}$/.test(trimmed)) {
      return trimmed.replace('.', '/')
    }
    return formatDisplayDate(trimmed)
  }
  return `${fmt(startRaw)} \u2013 ${fmt(endRaw)}`
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
  return getStatusMeta(status).label
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

// Matched (h) column reflects payslip_units reported by the recon engine.
function getMatchedUnits(row: ReportRow): number | null {
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
  const [reportCreatedAt, setReportCreatedAt] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: 'date',
    direction: 'asc',
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [activeFollowUpKey, setActiveFollowUpKey] = useState<string | null>(null)
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
        setReportCreatedAt(null)

        const { data, error } = await supabase
          .from('reports')
          .select('report_data, created_at')
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

        const record = data as Pick<Tables<'reports'>, 'report_data' | 'created_at'> | null

        if (!record?.report_data) {
          console.warn('Report record did not include report_data', data)
          setAnalysis(null)
          setReportCreatedAt(null)
          setLoading(false)
          return
        }

        const normalised = normalizeAnalysisJson(record.report_data)
        setReportCreatedAt(record.created_at ?? null)

        if (normalised) {
          setAnalysis(normalised)
        } else {
          console.warn('Fetched report_data has unexpected shape', record.report_data)
          setAnalysis(null)
        }

        setLoading(false)
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading report', error)
        setAnalysis(null)
        setReportCreatedAt(null)
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

  const paidCount = useMemo(
    () => rows.filter((row) => row.status === 'paid').length,
    [rows]
  )

  const partiallyPaidCount = useMemo(
    () => rows.filter((row) => row.status === 'partially_paid').length,
    [rows]
  )

  const unpaidCount = useMemo(
    () => rows.filter((row) => row.status === 'unpaid').length,
    [rows]
  )

  // "Needs follow-up" highlights rows that still require action (unpaid and partially paid).
  const needsFollowUpRows = useMemo(
    () => rows.filter((row) => ACTIONABLE_STATUSES.has(row.status)),
    [rows]
  )

  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return rows
    const allowedStatuses = FILTER_STATUS_MAP[activeFilter]
    return rows.filter((row) => allowedStatuses.includes(row.status))
  }, [rows, activeFilter])

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

  useEffect(() => {
    if (!activeFollowUpKey) return
    const stillPresent = followUpRows.some((row, index) => rowKey(row, index) === activeFollowUpKey)
    if (!stillPresent) {
      setActiveFollowUpKey(null)
    }
  }, [activeFollowUpKey, followUpRows])

  /**
   * Report summary counts:
   * - Total claims from audit_summary.total_avac_claims (fallback rows.length).
   * - Paid / Partially paid / Unpaid sourced from audit_summary counters with row fallbacks.
   * - Other payslip chips reflect note-derived counts.
   */
  const summary = analysis?.audit_summary
  const headerEcho = analysis?.recon_header_echo
  const payPeriodLabel = summary ? formatPayPeriodRecon(summary.pay_period) : '—'
  const payDateLabel = summary ? formatDisplayDate(summary.pay_date) : '—'
  const paidPercentageRaw = summary?.coverage_percentage
  const paidPercentageLabel = useMemo(() => {
    if (paidPercentageRaw == null || paidPercentageRaw === '') return '—'
    if (typeof paidPercentageRaw === 'number') return `${paidPercentageRaw}%`
    return paidPercentageRaw
  }, [paidPercentageRaw])
  const totalClaims = summary?.total_avac_claims ?? rows.length
  const summaryPaid = summary?.paid_claims ?? paidCount
  const summaryPartiallyPaid = summary?.partially_paid_claims ?? partiallyPaidCount
  const summaryUnpaid = summary?.unpaid_claims ?? unpaidCount
  const summaryNeedsFollowUp = summaryPartiallyPaid + summaryUnpaid
  const waitingNext =
    summary?.check_next_payslip_claims ??
    rows.filter((row) => row.status === 'check_next_payslip').length
  const waitingPrevious =
    summary?.check_previous_payslip_claims ??
    rows.filter((row) => row.status === 'check_previous_payslip').length
  const waitingTotal = waitingNext + waitingPrevious

  const rosteredOvertimeInfo = useMemo(() => {
    if (!headerEcho) return null
    const totalLabel =
      typeof headerEcho.rostered_overtime_total === 'number' &&
      headerEcho.rostered_overtime_total > 0
        ? formatHours(headerEcho.rostered_overtime_total)
        : null
    const parts = headerEcho.rostered_overtime_by_rate
      ? Object.entries(headerEcho.rostered_overtime_by_rate)
          .filter(([, value]) => typeof value === 'number' && value > 0)
          .map(([rate, value]) => `${formatHours(value)} @${rate}x`)
      : []

    if (!totalLabel && parts.length === 0) return null

    return {
      totalLabel,
      parts,
    }
  }, [headerEcho])

  const reportSummaryItems = useMemo(
    () => {
      const items: ReportSummaryCard[] = [
        { key: 'totalClaims', label: 'Total claims', value: totalClaims },
        { key: 'paid', label: 'Paid', value: summaryPaid },
        {
          key: 'needsFollowUp',
          label: 'Needs follow-up',
          value: summaryNeedsFollowUp,
          breakdown: [
            { label: 'Partially paid', value: summaryPartiallyPaid },
            { label: 'Unpaid', value: summaryUnpaid },
          ],
        },
      ]

      if (waitingTotal > 0) {
        items.push({
          key: 'otherPayslip',
          label: 'Other payslip',
          value: waitingTotal,
          breakdown: [
            { label: 'Prev', value: waitingPrevious },
            { label: 'Next', value: waitingNext },
          ],
        })
      }

      return items
    },
    [
      totalClaims,
      summaryPaid,
      summaryNeedsFollowUp,
      summaryPartiallyPaid,
      summaryUnpaid,
      waitingTotal,
      waitingNext,
      waitingPrevious,
    ]
  )

  const toggleRow = (key: string, nextState?: boolean) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      const shouldExpand = nextState ?? !next.has(key)
      if (shouldExpand) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  const handleFollowUpCardClick = (key: string) => {
    const isOpening = activeFollowUpKey !== key
    setActiveFollowUpKey(isOpening ? key : null)
    toggleRow(key, isOpening)

    if (!isOpening || typeof window === 'undefined') return

    window.requestAnimationFrame(() => {
      const target = document.getElementById(`report-row-${key}`)
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.focus({ preventScroll: true })
      }
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

  const generatedLabel = useMemo(() => {
    if (!reportCreatedAt) return null
    const parsed = new Date(reportCreatedAt)
    if (Number.isNaN(parsed.getTime())) return null
    const datePart = generatedDateFormatter.format(parsed)
    const timePart = generatedTimeFormatter.format(parsed).toUpperCase()
    return `${datePart} at ${timePart}`
  }, [reportCreatedAt])

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

  return (
    <TooltipProvider>
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <Button variant="ghost" asChild className="mb-6">
          <Link href="/check/new" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to upload
          </Link>
        </Button>

        <section className="mb-10">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 p-8 shadow-xl backdrop-blur-sm">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.05),_transparent_50%),_radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.05),_transparent_50%)]" aria-hidden="true" />
            
            <div className="relative grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-lg font-bold text-slate-800">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <span className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                      {payPeriodLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                    <span className="flex items-center gap-3 rounded-full bg-white/60 px-4 py-2 shadow-sm backdrop-blur-sm">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pay date</span>
                      <span className="font-bold text-slate-700">{payDateLabel}</span>
                    </span>
                    {generatedLabel && (
                      <span className="flex items-center gap-3 rounded-full bg-white/60 px-4 py-2 shadow-sm backdrop-blur-sm">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Generated
                        </span>
                        <span className="font-bold text-slate-700 normal-case">
                          {generatedLabel}
                        </span>
                      </span>
                    )}
                  </div>
                  {rosteredOvertimeInfo && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur-sm">
                      <span>Rostered overtime</span>
                      <span className="text-slate-700 normal-case">
                        {rosteredOvertimeInfo.parts.length > 0
                          ? rosteredOvertimeInfo.parts.join(' + ')
                          : rosteredOvertimeInfo.totalLabel}
                      </span>
                      {rosteredOvertimeInfo.totalLabel && rosteredOvertimeInfo.parts.length > 0 && (
                        <span className="text-slate-400 normal-case">
                          (total {rosteredOvertimeInfo.totalLabel})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {reportSummaryItems.map((item) => {
                    const breakdownParts =
                      item.breakdown?.filter(({ value }) => value > 0).map((part) =>
                        `${part.label} ${part.value.toLocaleString()}`
                      ) ?? []

                    const breakdownLabel =
                      breakdownParts.length > 0
                        ? `(${breakdownParts.join(' / ')})`
                        : null

                    const style =
                      SUMMARY_CARD_STYLES[item.key] ?? SUMMARY_CARD_STYLES.totalClaims

                    return (
                      <div
                        key={item.key}
                        className={cn(
                          "group relative overflow-hidden rounded-2xl border bg-gradient-to-br backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl",
                          "bg-white/80 p-5 text-slate-800 shadow-lg",
                          style.card
                        )}
                      >
                        <div className="flex flex-col gap-4">
                          <div
                            className={cn(
                              "h-1.5 w-12 rounded-full shadow-sm",
                              style.accent
                            )}
                            aria-hidden="true"
                          />
                          <span className="text-4xl font-bold tracking-tight text-slate-800 transition-colors group-hover:text-slate-900">
                            {item.value.toLocaleString()}
                          </span>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                              {item.label}
                            </span>
                            {breakdownLabel && (
                              <span className="text-xs font-medium text-slate-500">{breakdownLabel}</span>
                            )}
                          </div>
                        </div>
                        {/* Subtle gradient overlay on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      </div>
                    )
                  })}
                </div>
                <Alert className="mt-1 rounded-2xl border-blue-200/70 bg-blue-50/80 text-blue-900 shadow-sm backdrop-blur-sm">
                  <ShieldAlert className="h-5 w-5 text-blue-500" aria-hidden="true" />
                  <AlertTitle className="text-sm font-semibold uppercase tracking-wider text-blue-800">
                    Use with care
                  </AlertTitle>
                  <AlertDescription className="text-sm leading-relaxed text-blue-900/80">
                    CheckPay generates this analysis automatically. It isn&apos;t produced or endorsed by Queensland Health, and figures may be incomplete or inaccurate. Use it as a guide only and verify every outcome against the official payslip and Queensland Health policies before making decisions.
                  </AlertDescription>
                </Alert>
              </div>
              <div className="group relative overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-white via-indigo-50/50 to-blue-50/50 p-8 text-center shadow-2xl backdrop-blur-sm transition-all duration-500 hover:scale-[1.01] hover:shadow-3xl">
                {/* Enhanced background effects */}
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.15),_transparent_70%),_radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.1),_transparent_70%)]"
                  aria-hidden="true"
                />
                <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-gradient-to-tr from-blue-400/20 to-indigo-400/20 blur-2xl" />
                
                <div className="relative flex h-full flex-col items-center justify-center gap-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600/80">
                      Paid percentage
                    </span>
                    <div className="h-0.5 w-16 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full mx-auto" />
                  </div>
                  <span className="bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-600 bg-clip-text text-7xl font-black leading-none text-transparent drop-shadow-sm transition-all duration-300 group-hover:scale-105">
                    {paidPercentageLabel}
                  </span>
                  <p className="max-w-[18rem] text-sm font-medium leading-relaxed text-slate-600">
                    Share of AVAC claims paid on this payslip.
                  </p>
                  
                  {/* Progress ring decoration */}
                  <div className="absolute inset-6 rounded-full border border-indigo-200/40 opacity-30" />
                  <div className="absolute inset-12 rounded-full border border-indigo-300/30 opacity-20" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <div className="overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-white via-amber-50/30 to-orange-50/20 shadow-xl backdrop-blur-sm">
            <div className="border-b border-amber-200/40 bg-gradient-to-r from-amber-50/50 to-orange-50/30 px-8 py-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">
                      Needs follow-up
                    </h2>
                    <p className="text-sm font-medium text-slate-600">
                      {followUpRows.length} {followUpRows.length === 1 ? 'entry' : 'entries'} require immediate action
                    </p>
                  </div>
                </div>
                {followUpRows.length > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-amber-100/60 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm">
                    <Clock className="h-4 w-4" />
                    Action needed
                  </div>
                )}
              </div>
            </div>
            <div className="p-8">
              {followUpRows.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-700">
                      All caught up!
                    </p>
                    <p className="text-sm text-slate-500">
                      Nothing needs action right now.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-white/85 shadow-lg backdrop-blur-sm">
                      <Table className="min-w-full">
                        <TableHeader>
                          <TableRow className="border-b border-amber-200/70 bg-gradient-to-r from-amber-50/70 to-orange-50/40">
                            <TableHead className="h-14 font-bold text-slate-700">Date</TableHead>
                            <TableHead className="h-14 font-bold text-slate-700">Type</TableHead>
                            <TableHead className="h-14 text-right font-bold text-slate-700">Required (h)</TableHead>
                            <TableHead className="h-14 text-right font-bold text-slate-700">Matched (h)</TableHead>
                            <TableHead className="h-14 font-bold text-slate-700">Status</TableHead>
                            <TableHead className="h-14 font-bold text-slate-700">Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {followUpRows.map((row, index) => {
                            const key = rowKey(row, index)
                            const expanded = activeFollowUpKey === key
                            const statusMeta = getStatusMeta(row.status)
                            const StatusIcon = statusMeta.icon
                            const matchedUnits = getMatchedUnits(row)
                            const matchedDisplay = formatHours(matchedUnits)
                            const note = row.match_details?.trim() ?? ''
                            const flagNotes = getRowFlags(row)
                            const hasDetails =
                              Boolean(note) ||
                              flagNotes.length > 0 ||
                              Boolean(row.matched_parts && row.matched_parts.length > 0)
                            const detailLabel = hasDetails
                              ? expanded
                                ? 'Hide details'
                                : 'View details'
                              : 'No additional info'

                            const rowBaseClass = expanded
                              ? 'bg-gradient-to-r from-amber-50/80 to-orange-50/60 border-amber-300/80'
                              : 'bg-white/70 hover:bg-amber-50/70 border-amber-100/80'

                            return (
                              <Fragment key={key}>
                                <TableRow
                                  id={`follow-up-row-${key}`}
                                  role={hasDetails ? 'button' : undefined}
                                  tabIndex={hasDetails ? 0 : undefined}
                                  aria-expanded={hasDetails ? expanded : undefined}
                                  onClick={() => {
                                    if (!hasDetails) return
                                    handleFollowUpCardClick(key)
                                  }}
                                  onKeyDown={(event) => {
                                    if (!hasDetails) return
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      handleFollowUpCardClick(key)
                                    }
                                  }}
                                  className={cn(
                                    'group border-b border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
                                    hasDetails ? 'cursor-pointer' : 'cursor-default',
                                    rowBaseClass
                                  )}
                                >
                                  <TableCell className="h-16 font-semibold text-slate-800">
                                    {formatDisplayDate(row.date)}
                                  </TableCell>
                                  <TableCell className="h-16 align-top">
                                    <div className="font-bold leading-tight text-slate-800">{row.variation}</div>
                                    <div className="text-xs font-medium text-slate-500">
                                      {TYPE_LABELS[row.normalized_type]}
                                    </div>
                                  </TableCell>
                                  <TableCell className="h-16 text-right font-bold text-slate-800">
                                    {formatHours(row.required_units)}
                                  </TableCell>
                                  <TableCell className="h-16 text-right font-bold text-slate-800">
                                    {matchedDisplay}
                                  </TableCell>
                                  <TableCell className="h-16">
                                    <Badge
                                      variant="outline"
                                      className={cn('flex w-fit items-center gap-1.5 border-0 px-3 py-1.5 text-xs font-semibold shadow-sm', statusMeta.className)}
                                    >
                                      {StatusIcon && <StatusIcon className="h-4 w-4" aria-hidden="true" />}
                                      {statusMeta.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="h-16 w-48 max-w-xs">
                                    <div className="flex items-center justify-between gap-3">
                                      <span
                                        className={cn(
                                          'text-sm font-semibold transition-colors',
                                          hasDetails
                                            ? 'text-amber-700 group-hover:text-amber-800'
                                            : 'text-slate-400'
                                        )}
                                      >
                                        {detailLabel}
                                      </span>
                                      <ChevronRight
                                        className={cn(
                                          'mt-1 h-5 w-5 flex-shrink-0 transition-all duration-300',
                                          hasDetails
                                            ? 'text-amber-500 group-hover:translate-x-1 group-hover:text-amber-600'
                                            : 'text-slate-300',
                                          expanded && hasDetails && 'rotate-90 text-amber-600'
                                        )}
                                        aria-hidden="true"
                                      />
                                    </div>
                                    {hasDetails && flagNotes.length > 0 && (
                                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                        {flagNotes.length === 1 ? 'Flagged' : `${flagNotes.length} flags`}
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                                {expanded && hasDetails && (
                                  <TableRow className="bg-gradient-to-r from-amber-50/70 to-orange-50/50">
                                    <TableCell colSpan={6}>
                                      <div className="space-y-6 py-6">
                                        {note && (
                                          <div>
                                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600">
                                              Follow-up detail
                                            </p>
                                            <div className="rounded-xl bg-white/70 p-4 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-sm">
                                              <p className="whitespace-pre-line">{note}</p>
                                            </div>
                                          </div>
                                        )}
                                        {row.matched_parts && row.matched_parts.length > 0 && (
                                          <div>
                                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600">
                                              Matched parts
                                            </p>
                                            <div className="space-y-2">
                                              {row.matched_parts.map((part, partIndex) => (
                                                <div
                                                  key={`${key}-fu-part-${partIndex}`}
                                                  className="flex items-center justify-between rounded-lg bg-white/70 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-sm"
                                                >
                                                  <span>{part.type}</span>
                                                  <span className="font-bold">{formatHours(part.units)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {flagNotes.length > 0 && (
                                          <div>
                                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600">
                                              Additional notes
                                            </p>
                                            <div className="space-y-2">
                                              {flagNotes.map((flag, flagIndex) => (
                                                <div
                                                  key={`${key}-fu-flag-${flagIndex}`}
                                                  className="rounded-lg bg-white/70 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-sm"
                                                >
                                                  {flag}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 md:hidden">
                    {followUpRows.map((row, index) => {
                      const key = rowKey(row, index)
                      return (
                        <MobileRowCard
                          key={`follow-up-${key}`}
                          row={row}
                          expanded={activeFollowUpKey === key}
                          onToggle={() => handleFollowUpCardClick(key)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="full-results-heading">
          <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/30 to-blue-50/20 shadow-xl backdrop-blur-sm">
            <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-blue-50/30 px-8 py-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-lg">
                    <TableIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 id="full-results-heading" className="text-xl font-bold text-slate-800">
                      Full results
                    </h2>
                    <p className="text-sm font-medium text-slate-600">
                      Use the quick filters to spotlight paid, partially paid, or unpaid rows.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {FILTER_OPTIONS.map(({ value, label }) => {
                    const isActive = activeFilter === value
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={isActive}
                        onClick={() => setActiveFilter(value)}
                        className={cn(
                          'rounded-full border px-4 py-1.5 text-sm font-semibold transition-all',
                          isActive
                            ? 'border-indigo-300 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md hover:from-indigo-500 hover:to-blue-500'
                            : 'border-slate-200/70 bg-white/60 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                        )}
                      >
                        {label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="hidden md:block">
                {/* Enhanced Table with better styling */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-lg backdrop-blur-sm">
                    <Table className="min-w-full">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-blue-50/30 hover:bg-slate-50/70">
                        <TableHead className="h-14 font-bold text-slate-700">
                          <SortHeader
                            column="date"
                            label="Date"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                          />
                        </TableHead>
                        <TableHead className="h-14 font-bold text-slate-700">
                          <SortHeader
                            column="variation"
                            label="Type"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                          />
                        </TableHead>
                        <TableHead className="h-14 text-right font-bold text-slate-700">
                          <SortHeader
                            column="required_units"
                            label="Required (h)"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                          />
                        </TableHead>
                        <TableHead className="h-14 text-right font-bold text-slate-700">
                          <SortHeader
                            column="matched_units"
                            label="Matched (h)"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                          />
                        </TableHead>
                        <TableHead className="h-14 font-bold text-slate-700">
                          <SortHeader
                            column="status"
                            label="Status"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                          />
                        </TableHead>
                        <TableHead className="h-14 font-bold text-slate-700">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-4">
                              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                                <Filter className="h-8 w-8 text-slate-400" />
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-slate-600">No matches found</p>
                                <p className="text-sm text-slate-500">No claims match the selected filters.</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedRows.map((row, index) => {
                          const key = rowKey(row, index)
                          const expanded = expandedRows.has(key)
                          const statusMeta = getStatusMeta(row.status)
                          const StatusIcon = statusMeta.icon
                          const matchedUnits = getMatchedUnits(row)
                          const matchedDisplay = formatHours(matchedUnits)
                          const note = row.match_details?.trim() ?? ''
                          const flagNotes = getRowFlags(row)
                          const nextRow = sortedRows[index + 1]
                          const currentDate = parseDateString(row.date)
                          const nextDate = nextRow ? parseDateString(nextRow.date) : null
                          const isGroupEnd =
                            sortConfig.column === 'date' &&
                            Boolean(currentDate) &&
                            (!nextDate || currentDate?.getTime() !== nextDate.getTime())
                          const hasDetails =
                            Boolean(note) ||
                            flagNotes.length > 0 ||
                            Boolean(row.matched_parts && row.matched_parts.length > 0)
                          const detailLabel = hasDetails
                            ? expanded
                              ? 'Hide details'
                              : 'View details'
                            : 'No additional info'

                          // Enhanced row styling based on status
                          const rowBaseClass = expanded 
                            ? 'bg-gradient-to-r from-indigo-50/80 to-blue-50/60 border-indigo-200/60'
                            : 'bg-white/60 hover:bg-gradient-to-r hover:from-slate-50/80 hover:to-blue-50/40 border-slate-200/40'

                          return (
                            <Fragment key={key}>
                              <TableRow
                                id={`report-row-${key}`}
                                role={hasDetails ? 'button' : undefined}
                                tabIndex={hasDetails ? 0 : undefined}
                                aria-expanded={hasDetails ? expanded : undefined}
                                onClick={() => {
                                  if (!hasDetails) return
                                  toggleRow(key)
                                }}
                                onKeyDown={(event) => {
                                  if (!hasDetails) return
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    toggleRow(key)
                                  }
                                }}
                                className={cn(
                                  'group border-b transition-all duration-200',
                                  hasDetails
                                    ? 'cursor-pointer hover:scale-[1.001] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
                                    : 'cursor-default',
                                  rowBaseClass,
                                  isGroupEnd && 'border-b-2 border-slate-300/60'
                                )}
                              >
                                <TableCell className="h-16 font-semibold text-slate-800">
                                  {formatDisplayDate(row.date)}
                                </TableCell>
                                <TableCell className="h-16 align-top">
                                  <div className="font-bold leading-tight text-slate-800">{row.variation}</div>
                                  <div className="text-xs font-medium text-slate-500">
                                    {TYPE_LABELS[row.normalized_type]}
                                  </div>
                                </TableCell>
                                <TableCell className="h-16 text-right font-bold text-slate-800">
                                  {formatHours(row.required_units)}
                                </TableCell>
                                <TableCell className="h-16 text-right font-bold text-slate-800">
                                  {matchedDisplay}
                                </TableCell>
                                <TableCell className="h-16">
                                  <Badge
                                    variant="outline"
                                    className={cn('flex w-fit items-center gap-1.5 border-0 px-3 py-1.5 font-semibold shadow-sm', statusMeta.className)}
                                  >
                                    {StatusIcon && (
                                      <StatusIcon className="h-4 w-4" aria-hidden="true" />
                                    )}
                                    {statusMeta.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="h-16 w-48 max-w-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <span
                                      className={cn(
                                        'text-sm font-semibold transition-colors',
                                        hasDetails
                                          ? 'text-indigo-600 group-hover:text-indigo-700'
                                          : 'text-slate-400'
                                      )}
                                    >
                                      {detailLabel}
                                    </span>
                                    <ChevronRight
                                      className={cn(
                                        'mt-1 h-5 w-5 flex-shrink-0 transition-all duration-300',
                                        hasDetails
                                          ? 'text-slate-400 group-hover:translate-x-1 group-hover:text-indigo-600'
                                          : 'text-slate-300',
                                        expanded && hasDetails && 'rotate-90 text-indigo-600'
                                      )}
                                      aria-hidden="true"
                                    />
                                  </div>
                                  {hasDetails && flagNotes.length > 0 && (
                                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                      {flagNotes.length === 1 ? 'Flagged' : `${flagNotes.length} flags`}
                                    </div>
                                  )}
                                </TableCell>
                            </TableRow>
                              {expanded && (
                                <TableRow className="bg-gradient-to-r from-indigo-50/60 to-blue-50/40">
                                  <TableCell colSpan={6}>
                                    <div className="space-y-6 py-6">
                                      {note && (
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Detail</p>
                                          <div className="rounded-xl bg-white/60 p-4 backdrop-blur-sm">
                                            <p className="whitespace-pre-line text-slate-800 font-medium">{note}</p>
                                          </div>
                                        </div>
                                      )}
                                      {row.matched_parts && row.matched_parts.length > 0 && (
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                            Matched parts
                                          </p>
                                          <div className="space-y-2">
                                            {row.matched_parts.map((part, partIndex) => (
                                              <div key={`${key}-part-${partIndex}`} className="flex items-center justify-between rounded-lg bg-white/60 px-4 py-3 backdrop-blur-sm">
                                                <span className="font-semibold text-slate-700">{part.type}</span>
                                                <span className="font-bold text-slate-800">{formatHours(part.units)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {flagNotes.length > 0 && (
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                            Additional notes
                                          </p>
                                          <div className="space-y-2">
                                            {flagNotes.map((flag, flagIndex) => (
                                              <div key={`${key}-flag-${flagIndex}`} className="rounded-lg bg-white/60 px-4 py-3 text-slate-700 font-medium backdrop-blur-sm">{flag}</div>
                                            ))}
                                          </div>
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
              </div>

              <div className="flex flex-col gap-4 md:hidden">
                {sortedRows.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                      <Filter className="h-8 w-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-600">No matches found</p>
                      <p className="text-sm text-slate-500">No claims match the selected filters.</p>
                    </div>
                  </div>
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
            </div>
          </div>
        </section>

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
  const StatusIcon = statusMeta.icon
  const matchedDisplay = formatHours(getMatchedUnits(row))
  const note = row.match_details?.trim() ?? ''
  const flagNotes = getRowFlags(row)
  const hasDetails =
    Boolean(note) ||
    flagNotes.length > 0 ||
    Boolean(row.matched_parts && row.matched_parts.length > 0)

  return (
    <div className={cn(
      "group overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
      expanded 
        ? "border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 to-blue-50/60" 
        : "border-slate-200/60 bg-gradient-to-br from-white to-slate-50/40"
    )}>
      <div className="p-5">
        <div className="flex justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-slate-500">
              {formatDisplayDate(row.date)}
            </p>
            <p className="text-lg font-bold text-slate-800">{row.variation}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {TYPE_LABELS[row.normalized_type]}
            </p>
          </div>
          <Badge 
            variant="outline" 
            className={cn('flex items-center gap-1.5 border-0 px-3 py-1.5 font-semibold shadow-sm', statusMeta.className)}
          >
            {StatusIcon && <StatusIcon className="h-4 w-4" aria-hidden="true" />}
            {statusMeta.label}
          </Badge>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/60 p-3 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Required (h)</p>
            <p className="text-xl font-bold text-slate-800">{formatHours(row.required_units)}</p>
          </div>
          <div className="rounded-xl bg-white/60 p-3 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Matched (h)</p>
            <p className="text-xl font-bold text-slate-800">{matchedDisplay}</p>
          </div>
        </div>
        {hasDetails && !expanded && (
          <div className="mt-3 flex flex-wrap gap-2">
            {flagNotes.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {flagNotes.length === 1 ? 'Flagged detail' : `${flagNotes.length} flags`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                Additional detail available
              </span>
            )}
          </div>
        )}
        {hasDetails ? (
          <Button
            type="button"
            variant="link"
            className="mt-4 flex h-auto items-center justify-start gap-2 p-0 text-sm font-semibold text-indigo-700"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide details' : 'View details'}
            <ChevronRight
              className={cn('h-4 w-4 transition-all duration-300', expanded && 'rotate-90')}
              aria-hidden="true"
            />
          </Button>
        ) : (
          <p className="mt-4 text-sm font-medium text-slate-400">No additional info</p>
        )}

        {expanded && hasDetails && (
          <div className="mt-4 space-y-4 border-t border-slate-200/60 pt-4">
            {note && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Detail</p>
                <div className="rounded-xl bg-white/40 p-3 backdrop-blur-sm">
                  <p className="whitespace-pre-line text-slate-800 font-medium">{note}</p>
                </div>
              </div>
            )}
            {row.matched_parts && row.matched_parts.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Matched parts</p>
                <div className="space-y-2">
                  {row.matched_parts.map((part, index) => (
                    <div key={`${row.date}-${index}`} className="flex items-center justify-between rounded-lg bg-white/40 px-3 py-2 backdrop-blur-sm">
                      <span className="font-semibold text-slate-700">{part.type}</span>
                      <span className="font-bold text-slate-800">{formatHours(part.units)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {flagNotes.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Additional notes</p>
                <div className="space-y-2">
                  {flagNotes.map((flag, index) => (
                    <div key={`${row.date}-flag-${index}`} className="rounded-lg bg-white/40 px-3 py-2 text-slate-700 font-medium backdrop-blur-sm">{flag}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
