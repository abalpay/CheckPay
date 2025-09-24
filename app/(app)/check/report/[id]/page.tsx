'use client'

import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react'
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
  Loader2,
  RefreshCw,
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
  icon?: LucideIcon
}

const STATUS_BADGE_META: Record<string, BadgeMeta> = {
  matched: {
    label: 'Matched',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  matched_with_reversal: {
    label: 'Matched',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  partially_matched: {
    label: 'Partially matched',
    className: 'border-[#FFD9A8] bg-[#FFEED9] text-[#B15B1A]',
    icon: Clock,
  },
  partially_matched_with_reversal: {
    label: 'Partially matched',
    className: 'border-[#FFD9A8] bg-[#FFEED9] text-[#B15B1A]',
    icon: Clock,
  },
  unmatched: {
    label: 'Unmatched',
    className: 'border-[#F6B4B4] bg-[#FDECEC] text-[#D14343]',
    icon: AlertTriangle,
  },
  unmatched_with_reversal: {
    label: 'Unmatched',
    className: 'border-[#F6B4B4] bg-[#FDECEC] text-[#D14343]',
    icon: AlertTriangle,
  },
  reversal_only: {
    label: 'Reversal only',
    className: 'border-[#FFD9A8] bg-[#FFEED9] text-[#B15B1A]',
    icon: RefreshCw,
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

function emphasiseVariation(note: string, variation: string): ReactNode {
  if (!note || !variation) return note
  const lowerNote = note.toLowerCase()
  const lowerVariation = variation.toLowerCase()
  const index = lowerNote.indexOf(lowerVariation)
  if (index === -1) return note

  const before = note.slice(0, index)
  const match = note.slice(index, index + variation.length)
  const after = note.slice(index + variation.length)

  return (
    <>
      {before}
      <span className="font-semibold text-foreground">{match}</span>
      {after}
    </>
  )
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
  const [reportCreatedAt, setReportCreatedAt] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
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

        if (!data?.report_data) {
          console.warn('Report record did not include report_data', data)
          setAnalysis(null)
          setReportCreatedAt(null)
          setLoading(false)
          return
        }

        const normalised = normalizeAnalysisJson(data.report_data)
        setReportCreatedAt(data.created_at ?? null)

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

  const statusOptionValues = useMemo(
    () => statusOptions.map((option) => option.value),
    [statusOptions]
  )

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
    if (!analysis || !statusOptionValues.length) return
    setStatusFilter(new Set(statusOptionValues))
  }, [analysis, statusOptionValues])

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

  useEffect(() => {
    if (!activeFollowUpKey) return
    const stillPresent = followUpRows.some((row, index) => rowKey(row, index) === activeFollowUpKey)
    if (!stillPresent) {
      setActiveFollowUpKey(null)
    }
  }, [activeFollowUpKey, followUpRows])

  /**
   * Report summary counts:
   * - Total entries from audit_summary.total_avac_claims (fallback rows.length).
   * - Matched comes from audit_summary.matched_claims.
   * - Partial count = rows where status === 'partially_matched'.
   * - Unmatched count + "Needs follow-up" = statuses 'unmatched' + 'reversal_only'.
   * - Other payslip count summarises audit_summary.check_previous/next_payslip_claims.
   */
  const summary = analysis?.audit_summary
  const payPeriodLabel = summary ? formatPayPeriod(summary.pay_period) : '—'
  const payDateLabel = summary ? formatDisplayDate(summary.pay_date) : '—'
  const matchedPercentageRaw = summary?.coverage_percentage
  const matchedPercentageLabel = useMemo(() => {
    if (matchedPercentageRaw == null || matchedPercentageRaw === '') return '—'
    if (typeof matchedPercentageRaw === 'number') return `${matchedPercentageRaw}%`
    return matchedPercentageRaw
  }, [matchedPercentageRaw])
  const totalEntries = summary?.total_avac_claims ?? rows.length
  const matchedTotal = summary?.matched_claims ?? 0
  const waitingNext =
    summary?.check_next_payslip_claims ??
    rows.filter((row) => row.status === 'check_next_payslip').length
  const waitingPrevious =
    summary?.check_previous_payslip_claims ??
    rows.filter((row) => row.status === 'check_previous_payslip').length
  const waitingTotal = waitingNext + waitingPrevious

  const reportSummaryItems = useMemo(
    () => {
      const items: Array<{
        label: string
        value: number
        breakdown?: { next: number; previous: number }
      }> = [
        { label: 'Total entries', value: totalEntries },
      ]

      if (matchedTotal > 0) {
        items.push({ label: 'Matched', value: matchedTotal })
      }

      if (partiallyMatchedCount > 0) {
        items.push({ label: 'Partially matched', value: partiallyMatchedCount })
      }

      if (unmatchedCount > 0) {
        items.push({ label: 'Unmatched', value: unmatchedCount })
      }

      if (waitingTotal > 0) {
        items.push({
          label: 'Other payslip',
          value: waitingTotal,
          breakdown: { next: waitingNext, previous: waitingPrevious },
        })
      }

      return items
    },
    [
      totalEntries,
      matchedTotal,
      partiallyMatchedCount,
      unmatchedCount,
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
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {reportSummaryItems.map((item, index) => {
                    const breakdownParts: string[] = []
                    if (item.breakdown) {
                      if (item.breakdown.previous > 0) {
                        breakdownParts.push(
                          `Prev ${item.breakdown.previous.toLocaleString()}`
                        )
                      }
                      if (item.breakdown.next > 0) {
                        breakdownParts.push(
                          `Next ${item.breakdown.next.toLocaleString()}`
                        )
                      }
                    }

                    const breakdownLabel =
                      breakdownParts.length > 0
                        ? `(${breakdownParts.join(' / ')})`
                        : null

                    // Color variations for different card types
                    const cardColors = [
                      'from-blue-500/10 to-indigo-500/10 border-blue-200/40',
                      'from-emerald-500/10 to-teal-500/10 border-emerald-200/40', 
                      'from-amber-500/10 to-orange-500/10 border-amber-200/40',
                      'from-violet-500/10 to-purple-500/10 border-violet-200/40',
                      'from-rose-500/10 to-pink-500/10 border-rose-200/40'
                    ]
                    
                    const accentColors = [
                      'bg-gradient-to-r from-blue-500 to-indigo-500',
                      'bg-gradient-to-r from-emerald-500 to-teal-500',
                      'bg-gradient-to-r from-amber-500 to-orange-500', 
                      'bg-gradient-to-r from-violet-500 to-purple-500',
                      'bg-gradient-to-r from-rose-500 to-pink-500'
                    ]

                    return (
                      <div
                        key={item.label}
                        className={cn(
                          "group relative overflow-hidden rounded-2xl border bg-gradient-to-br backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl",
                          "bg-white/80 p-5 text-slate-800 shadow-lg",
                          cardColors[index % cardColors.length]
                        )}
                      >
                        <div className="flex flex-col gap-4">
                          <div
                            className={cn(
                              "h-1.5 w-12 rounded-full shadow-sm",
                              accentColors[index % accentColors.length]
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
                      Matched percentage
                    </span>
                    <div className="h-0.5 w-16 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full mx-auto" />
                  </div>
                  <span className="bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-600 bg-clip-text text-7xl font-black leading-none text-transparent drop-shadow-sm transition-all duration-300 group-hover:scale-105">
                    {matchedPercentageLabel}
                  </span>
                  <p className="max-w-[18rem] text-sm font-medium leading-relaxed text-slate-600">
                    Share of AVAC claims successfully matched to this payslip.
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
                <div className="space-y-4">
                  {followUpRows.map((row, index) => {
                    const key = rowKey(row, index)
                    const statusMeta = getStatusMeta(row.status)
                    const StatusIcon = statusMeta.icon
                    const matchedLabel =
                      row.status === 'reversal_only'
                        ? formatHours(row.payslip_units_raw)
                        : formatHours(row.payslip_units)
                    const reason = row.match_details ?? ''
                    const shortReason = truncate(reason, 96)
                    const showTooltip = reason.length > shortReason.length
                    const flagNotes = getRowFlags(row)
                    const isExpanded = activeFollowUpKey === key

                    // Priority styling based on status
                    const priorityStyles = row.status === 'unmatched' 
                      ? 'border-red-200/60 bg-gradient-to-br from-red-50/80 to-rose-50/60'
                      : 'border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-yellow-50/60'

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleFollowUpCardClick(key)}
                        aria-expanded={isExpanded}
                        className={cn(
                          'group relative w-full overflow-hidden rounded-2xl border text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
                          isExpanded 
                            ? 'border-indigo-300/60 bg-gradient-to-br from-indigo-50/80 to-blue-50/60 shadow-xl scale-[1.01]' 
                            : priorityStyles
                        )}
                      >
                        {/* Priority indicator */}
                        <div
                          className={cn(
                            'absolute inset-y-0 left-0 w-1.5 transition-all duration-300',
                            isExpanded 
                              ? 'bg-gradient-to-b from-indigo-500 to-blue-500' 
                              : row.status === 'unmatched'
                                ? 'bg-gradient-to-b from-red-500 to-rose-500'
                                : 'bg-gradient-to-b from-amber-500 to-orange-500'
                          )}
                          aria-hidden="true"
                        />
                        
                        <div className="p-6 pl-8">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-2">
                              <span className="text-sm font-semibold text-slate-500">
                                {formatDisplayDate(row.date)}
                              </span>
                              <span className="text-lg font-bold text-slate-800 transition-colors group-hover:text-slate-900">
                                {row.variation}
                              </span>
                              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                {TYPE_LABELS[row.normalized_type]}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'flex items-center gap-1.5 border-0 px-3 py-1.5 text-xs font-semibold shadow-sm',
                                  statusMeta.className
                                )}
                              >
                                {StatusIcon && <StatusIcon className="h-4 w-4" aria-hidden="true" />}
                                {statusMeta.label}
                              </Badge>
                              {row.status === 'unmatched' && (
                                <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  High priority
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                            <div className="rounded-xl bg-white/60 p-4 shadow-sm backdrop-blur-sm">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Required (h)
                              </p>
                              <p className="text-xl font-bold text-slate-800">
                                {formatHours(row.required_units)}
                              </p>
                            </div>
                            <div className="rounded-xl bg-white/60 p-4 shadow-sm backdrop-blur-sm">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Matched (h)
                              </p>
                              <p className="text-xl font-bold text-slate-800">{matchedLabel}</p>
                            </div>
                          </div>
                          
                          {reason && !isExpanded && (
                            <div className="mt-4 rounded-xl bg-white/40 p-4 backdrop-blur-sm">
                              {showTooltip ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="line-clamp-2 text-sm text-slate-700">{shortReason}</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md whitespace-pre-line text-sm">
                                    {reason}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="line-clamp-2 text-sm text-slate-700">{shortReason}</span>
                              )}
                            </div>
                          )}
                          
                          {flagNotes.length > 0 && !isExpanded && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {flagNotes.map((flag, flagIndex) => (
                                <span
                                  key={`${key}-flag-pill-${flagIndex}`}
                                  className="rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm"
                                >
                                  {flag}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          <div className="mt-6 flex items-center justify-between rounded-xl bg-white/30 px-4 py-3 backdrop-blur-sm">
                            <span className="text-sm font-semibold text-indigo-700">
                              {isExpanded ? 'Hide details' : 'View details'}
                            </span>
                            <ChevronRight
                              className={cn(
                                'h-5 w-5 text-indigo-600 transition-all duration-300',
                                isExpanded && 'translate-x-1 rotate-90'
                              )}
                              aria-hidden="true"
                            />
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-6 space-y-6 border-t border-slate-200/60 pt-6">
                              {reason && (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Detail
                                  </p>
                                  <p className="mt-2 whitespace-pre-line rounded-xl bg-white/40 p-4 text-slate-800 backdrop-blur-sm">{reason}</p>
                                </div>
                              )}
                              {row.matched_parts && row.matched_parts.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Matched parts
                                  </p>
                                  <ul className="mt-3 space-y-2">
                                    {row.matched_parts.map((part, partIndex) => (
                                      <li key={`${key}-part-${partIndex}`} className="flex items-center justify-between rounded-lg bg-white/40 px-4 py-2 backdrop-blur-sm">
                                        <span className="font-medium text-slate-700">{part.type}</span>
                                        <span className="font-bold text-slate-800">{formatHours(part.units)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {flagNotes.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Additional notes
                                  </p>
                                  <ul className="mt-3 space-y-2">
                                    {flagNotes.map((flag, flagIndex) => (
                                      <li key={`${key}-flag-${flagIndex}`} className="rounded-lg bg-white/40 px-4 py-2 text-slate-700 backdrop-blur-sm">{flag}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {row.status === 'reversal_only' && (
                                <div className="grid gap-4 rounded-xl bg-white/60 p-4 backdrop-blur-sm sm:grid-cols-3">
                                  <div className="text-center">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                      Positive
                                    </p>
                                    <p className="text-lg font-bold text-emerald-600">
                                      {formatHours(row.reversal_pos_sum)}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                      Negative
                                    </p>
                                    <p className="text-lg font-bold text-red-600">
                                      {formatHours(row.reversal_neg_sum)}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                      Net
                                    </p>
                                    <p className="text-lg font-bold text-slate-800">
                                      {formatHours(row.reversal_net_units)}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
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
                      Filter by status or type, sort the grid, and open any row for detail.
                    </p>
                  </div>
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
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="hidden md:block">
                {/* Enhanced Table with better styling */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-lg backdrop-blur-sm">
                  <Table>
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
                        <TableHead className="h-14 font-bold text-slate-700">Notes</TableHead>
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
                          const matchedDisplay =
                            row.status === 'reversal_only'
                              ? formatHours(row.payslip_units_raw)
                              : formatHours(matchedUnits)
                          const note = row.match_details ?? ''
                          const shortNote = truncate(note, 96)
                          const showTooltip = note.length > shortNote.length
                          const flagNotes = getRowFlags(row)
                          const nextRow = sortedRows[index + 1]
                          const currentDate = parseDateString(row.date)
                          const nextDate = nextRow ? parseDateString(nextRow.date) : null
                          const isGroupEnd =
                            sortConfig.column === 'date' &&
                            Boolean(currentDate) &&
                            (!nextDate || currentDate?.getTime() !== nextDate.getTime())
                          const notePreview = emphasiseVariation(shortNote, row.variation)

                          // Enhanced row styling based on status
                          const rowBaseClass = expanded 
                            ? 'bg-gradient-to-r from-indigo-50/80 to-blue-50/60 border-indigo-200/60'
                            : 'bg-white/60 hover:bg-gradient-to-r hover:from-slate-50/80 hover:to-blue-50/40 border-slate-200/40'

                          return (
                            <Fragment key={key}>
                              <TableRow
                                id={`report-row-${key}`}
                                role="button"
                                tabIndex={0}
                                aria-expanded={expanded}
                                onClick={() => toggleRow(key)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    toggleRow(key)
                                  }
                                }}
                                className={cn(
                                  'group cursor-pointer border-b transition-all duration-200 hover:scale-[1.001] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
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
                                <TableCell className="h-16 max-w-sm">
                                  <div className="flex items-start gap-4">
                                    <div className="flex w-full flex-col gap-2">
                                      {note ? (
                                        showTooltip ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="line-clamp-2 text-sm font-medium text-slate-600">
                                                {notePreview}
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-md whitespace-pre-line text-sm">
                                              {note}
                                            </TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <span className="text-sm font-medium text-slate-600">
                                            {notePreview}
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-sm font-medium text-slate-400">—</span>
                                      )}
                                      {flagNotes.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {flagNotes.map((flag, flagIndex) => (
                                            <span
                                              key={`${key}-flag-pill-${flagIndex}`}
                                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                                            >
                                              {flag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <ChevronRight
                                      className={cn(
                                        'mt-1 h-5 w-5 flex-shrink-0 text-slate-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-indigo-600',
                                        expanded && 'rotate-90 text-indigo-600'
                                      )}
                                      aria-hidden="true"
                                    />
                                  </div>
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
                                      {row.status === 'reversal_only' && (
                                        <div className="grid gap-4 rounded-xl bg-white/80 p-6 backdrop-blur-sm md:grid-cols-3">
                                          <div className="text-center">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Positive</p>
                                            <p className="text-2xl font-bold text-emerald-600">{formatHours(row.reversal_pos_sum)}</p>
                                          </div>
                                          <div className="text-center">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Negative</p>
                                            <p className="text-2xl font-bold text-red-600">{formatHours(row.reversal_neg_sum)}</p>
                                          </div>
                                          <div className="text-center">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Net</p>
                                            <p className="text-2xl font-bold text-slate-800">{formatHours(row.reversal_net_units)}</p>
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
  const StatusIcon = statusMeta.icon
  const matchedDisplay =
    row.status === 'reversal_only'
      ? formatHours(row.payslip_units_raw)
      : formatHours(getMatchedUnits(row))
  const note = row.match_details ?? ''
  const flagNotes = getRowFlags(row)
  const notePreview = emphasiseVariation(truncate(note, 120), row.variation)

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
        
        {note && !expanded && (
          <div className="mt-4 rounded-xl bg-white/40 p-3 backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-700">
              {notePreview}
            </p>
          </div>
        )}
        
        {flagNotes.length > 0 && !expanded && (
          <div className="mt-3 flex flex-wrap gap-2">
            {flagNotes.map((flag, flagIndex) => (
              <span
                key={`${row.date}-flag-pill-${flagIndex}`}
                className="rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
        
        <Button
          type="button"
          variant="link"
          className="mt-4 flex h-auto items-center justify-start gap-2 p-0 text-sm font-semibold text-indigo-700"
          onClick={onToggle}
        >
          {expanded ? 'Hide detail' : 'View detail'}
          <ChevronRight
            className={cn('h-4 w-4 transition-all duration-300', expanded && 'rotate-90')}
            aria-hidden="true"
          />
        </Button>
        
        {expanded && (
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
            {row.status === 'reversal_only' && (
              <div className="grid gap-3 rounded-xl bg-white/60 p-4 backdrop-blur-sm">
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Positive</p>
                  <p className="text-lg font-bold text-emerald-600">{formatHours(row.reversal_pos_sum)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Negative</p>
                  <p className="text-lg font-bold text-red-600">{formatHours(row.reversal_neg_sum)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Net</p>
                  <p className="text-lg font-bold text-slate-800">{formatHours(row.reversal_net_units)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
