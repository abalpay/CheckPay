/**
 * Jobs client for browser → n8n synchronous analysis
 * Handles file validation, FormData construction, and API communication
 */

import { postMultipart } from './http'

export interface ClaimEntry {
  date: string
  group: string
  avacHours: number
  payrollUnits?: number
  delta?: number
  avacRowIds: string[]
  payrollLineIds: string[]
  confidence?: number
  reason?: string
}

export type AvacNormalizedType =
  | 'overtime'
  | 'recall_onsite'
  | 'recall_offsite'
  | 'fatigue'
  | 'other'

export type AvacStatus =
  | 'matched'
  | 'partially_matched'
  | 'unmatched'
  | 'matched_with_reversal'
  | 'partially_matched_with_reversal'
  | 'unmatched_with_reversal'
  | 'current_period'
  | 'future'
  | 'check_next_payslip'
  | 'check_previous_payslip'
  | 'reversal_only'
  | 'invalid'

export interface ClaimMatchedPart {
  type: string
  units: number
}

export interface AuditRow {
  date: string
  variation: string
  normalized_type: AvacNormalizedType
  required_units: number
  payslip_units?: number
  payslip_units_raw?: number
  unit_difference?: number
  status: AvacStatus
  match_details: string
  bundle_types?: string[]
  type_mapped_from?: string | null
  matched_parts?: ClaimMatchedPart[]
  reason_code?: string
  reversal?: boolean
  reversal_pos_sum?: number
  reversal_neg_sum?: number
  reversal_net_units?: number
  is_fatigue?: boolean
  affects_current_overtime?: boolean
}

export interface RoutingBreakdownItem {
  date: string
  type: string
  required_hours: number
}

export interface CurrentPeriodOvertimeAdjustment {
  date: string
  additional_avac: number
  total_overtime: number
}

export interface AuditSummary {
  pay_date: string
  pay_period: string
  pay_period_end: string
  total_avac_claims: number
  current_period_claims: number
  matched_claims: number
  unmatched_claims: number
  invalid_claims: number
  future_claims: number
  coverage_percentage: string
  validation_status: string
  first_adjustment_date?: string | null
  last_adjustment_date?: string | null
  coverage_percentage_numeric?: number
  check_next_payslip_claims?: number
  check_previous_payslip_claims?: number
}

export interface QuickStats {
  current_period_message: string
  future_message: string
  unmatched_message: string
  total_unmatched_hours: string
  total_matched_hours: string
  total_future_hours: string
}

export interface DebugInfo {
  rows_received: number
  expected_rows: number
  period_end_parsed: string
}

export interface OTCoverageData {
  results: Array<{
    date: string
    need: number
    paid: number
    status: string
  }>
  totals: {
    need: number
    paid: number
    covered: number
    partially_covered: number
    not_paid: number
    future: number
    out_of_period: number
  }
  notes?: string
}

export interface AnalysisSummary {
  payPeriod: string | null
  payPeriodStart?: string
  payPeriodEnd?: string
  avacTotalHours: number
  matchedCount: number
  unmatchedCount: number
  toleranceHours?: number
  tolerancePercent?: number
  coverageRatio?: number
  notes: string[]
}

export interface AnalysisJson {
  audit_summary: AuditSummary
  rows?: AuditRow[]
  matched_breakdown?: ClaimEntry[]
  unmatched_breakdown?: ClaimEntry[]
  future_breakdown?: ClaimEntry[]
  invalid_breakdown?: ClaimEntry[]
  quick_stats: QuickStats
  debug: DebugInfo
  check_next_payslip_breakdown?: RoutingBreakdownItem[]
  check_previous_payslip_breakdown?: RoutingBreakdownItem[]
  current_period_overtime_adjustments?: CurrentPeriodOvertimeAdjustment[]
  /** Raw payload retained for debugging/export */
  raw?: unknown
}

export interface LegacyAnalysisJson {
  summary: AnalysisSummary
  matched: ClaimEntry[]
  unmatched: ClaimEntry[]
  /** Raw payload retained for debugging/export */
  raw?: unknown
}

/**
 * Job error with field-specific information for UI display
 */
export interface JobError {
  field?: string
  message: string
}

/**
 * Parameters for starting an analysis job
 */
interface StartAnalyzeJobParams {
  payslip: File
  avacs: File[]
  baseOvertimePerDay: number
  workingDays: number
  rosteredOvertime: number
}

/**
 * Validate a single file meets PDF requirements
 */
function validatePdfFile(file: File, fieldName: string): JobError | null {
  if (file.type !== 'application/pdf') {
    return {
      field: fieldName,
      message: `${file.name} must be a PDF file`,
    }
  }

  const maxSize = 5 * 1024 * 1024 // 5MB (n8n workflow limit)
  if (file.size > maxSize) {
    return {
      field: fieldName,
      message: `${file.name} is too large (max 5MB)`,
    }
  }

  return null
}

/**
 * Validate all files meet requirements
 */
function validateFiles(payslip: File, avacs: File[]): JobError | null {
  const payslipError = validatePdfFile(payslip, 'payslip')
  if (payslipError) return payslipError

  if (avacs.length === 0) {
    return {
      field: 'avacs',
      message: 'At least one AVAC form is required',
    }
  }

  if (avacs.length > 10) {
    return {
      field: 'avacs',
      message: 'Maximum 10 AVAC forms allowed',
    }
  }

  for (let i = 0; i < avacs.length; i++) {
    const avacError = validatePdfFile(avacs[i], `avac-${i}`)
    if (avacError) return avacError
  }

  return null
}

/**
 * Build FormData for multipart upload to n8n
 */
function buildFormData(params: StartAnalyzeJobParams): FormData {
  const formData = new FormData()

  formData.append('payslip', params.payslip)

  params.avacs.forEach((avac) => {
    formData.append('avacs[]', avac)
  })

  const metadata = {
    baseOvertimePerDay: params.baseOvertimePerDay,
    workingDays: params.workingDays,
    rosteredOvertime: params.rosteredOvertime,
    clientVersion: '1.0.0-mvp',
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }

  formData.append('meta', JSON.stringify(metadata))

  return formData
}

type RecordObject = Record<string, unknown>

interface WebhookSummaryPayload extends RecordObject {
  pay_period?: string
  payPeriod?: string
  avac_total_hours?: number | string
  avacTotalHours?: number | string
  matched_count?: number | string
  matchedCount?: number | string
  unmatched_count?: number | string
  unmatchedCount?: number | string
  tolerance_hours?: number | string
  toleranceHours?: number | string
  tolerance_percent?: number | string
  tolerancePercent?: number | string
  notes?: unknown
}

interface WebhookClaimEntry extends RecordObject {
  date?: string
  group?: string
  avac_hours?: number | string
  avacHours?: number | string
  payroll_units?: number | string
  payrollUnits?: number | string
  delta?: number | string
  avac_row_ids?: unknown
  avacRowIds?: unknown
  payroll_line_ids?: unknown
  payrollLineIds?: unknown
  confidence?: number | string
}

interface WebhookAnalysisPayload extends RecordObject {
  summary: WebhookSummaryPayload
  matched?: WebhookClaimEntry[]
  unmatched?: WebhookClaimEntry[]
}

function isRecord(value: unknown): value is RecordObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeClaimEntry(entry: unknown): ClaimEntry {
  if (!isRecord(entry)) {
    return {
      date: '',
      group: '',
      avacHours: 0,
      avacRowIds: [],
      payrollLineIds: [],
    }
  }

  const date = getString(entry.date ?? entry['date']) ?? ''
  const group = getString(entry.group ?? entry['group']) ?? ''
  const avacHours = getNumber(entry.avacHours ?? entry.avac_hours ?? entry.required_hrs) ?? 0
  const payrollUnits = getNumber(entry.payrollUnits ?? entry.payroll_units ?? entry.payslip_hrs)
  const delta = getNumber(entry.delta ?? entry.diff)
  const confidence = getNumber(entry.confidence)
  const reason = getString(entry.reason)
  const avacRowIds = toStringArray(entry.avacRowIds ?? entry.avac_row_ids)
  const payrollLineIds = toStringArray(entry.payrollLineIds ?? entry.payroll_line_ids)

  const normalized: ClaimEntry = {
    date,
    group,
    avacHours,
    avacRowIds,
    payrollLineIds,
  }

  if (typeof payrollUnits === 'number') {
    normalized.payrollUnits = payrollUnits
  }

  if (typeof delta === 'number') {
    normalized.delta = delta
  }

  if (typeof confidence === 'number') {
    normalized.confidence = confidence
  }

  if (reason) {
    normalized.reason = reason
  }

  return normalized
}

const NORMALIZED_TYPES: AvacNormalizedType[] = [
  'overtime',
  'recall_onsite',
  'recall_offsite',
  'fatigue',
  'other',
]

const STATUSES: AvacStatus[] = [
  'matched',
  'partially_matched',
  'unmatched',
  'matched_with_reversal',
  'partially_matched_with_reversal',
  'unmatched_with_reversal',
  'current_period',
  'future',
  'check_next_payslip',
  'check_previous_payslip',
  'reversal_only',
  'invalid',
]

function isNormalizedType(value: string | null): value is AvacNormalizedType {
  if (!value) return false
  return (NORMALIZED_TYPES as string[]).includes(value)
}

function isStatus(value: string | null): value is AvacStatus {
  if (!value) return false
  return (STATUSES as string[]).includes(value)
}

function normalizeMatchedPart(entry: unknown): ClaimMatchedPart | null {
  if (!isRecord(entry)) return null
  const type = getString(entry.type)
  const units = getNumber(entry.units)

  if (!type || units === null) return null

  return {
    type,
    units,
  }
}

function normalizeAuditRow(entry: unknown): AuditRow | null {
  if (!isRecord(entry)) return null

  const date = getString(entry.date) ?? ''
  const variation = getString(entry.variation) ?? ''
  const normalizedType = getString(entry.normalized_type)
  const requiredUnits =
    getNumber(entry.required_units) ??
    getNumber(entry.requiredUnits) ??
    getNumber(entry.required_hours) ??
    0
  const payslipUnits =
    getNumber(entry.payslip_units) ?? getNumber(entry.payslipUnits)
  const payslipUnitsRaw =
    getNumber(entry.payslip_units_raw) ?? getNumber(entry.payslipUnitsRaw)
  const unitDifference =
    getNumber(entry.unit_difference) ?? getNumber(entry.unitDifference)
  const status = getString(entry.status)
  const matchDetails = getString(entry.match_details ?? entry.matchDetails) ?? ''
  const bundleTypes = toStringArray(entry.bundle_types ?? entry.bundleTypes)
  const typeMappedFrom = getString(entry.type_mapped_from ?? entry.typeMappedFrom)
  const matchedPartsInput = entry.matched_parts ?? entry.matchedParts
  const matchedParts = Array.isArray(matchedPartsInput)
    ? matchedPartsInput
        .map(normalizeMatchedPart)
        .filter((part): part is ClaimMatchedPart => Boolean(part))
    : []
  const reasonCodeRaw = getString(entry.reason_code ?? entry.reasonCode)
  const reasonCode = reasonCodeRaw ? reasonCodeRaw.toLowerCase() : null
  const reversal = Boolean(entry.reversal)
  const reversalPos = getNumber(entry.reversal_pos_sum ?? entry.reversalPosSum)
  const reversalNeg = getNumber(entry.reversal_neg_sum ?? entry.reversalNegSum)
  const reversalNet = getNumber(entry.reversal_net_units ?? entry.reversalNetUnits)
  const isFatigue = Boolean(entry.is_fatigue)
  const affectsCurrentOvertime = Boolean(entry.affects_current_overtime)

  let resolvedStatus: AvacStatus = isStatus(status) ? status : 'matched'

  if (reasonCode === 'reversal_only' || reasonCode === 'reversal_present_no_pay') {
    resolvedStatus = 'reversal_only'
  } else if (reasonCode === 'has_reversal' || reasonCode === 'reversal_present') {
    if (resolvedStatus === 'matched') {
      resolvedStatus = 'matched_with_reversal'
    } else if (resolvedStatus === 'partially_matched') {
      resolvedStatus = 'partially_matched_with_reversal'
    } else if (resolvedStatus === 'unmatched') {
      resolvedStatus = 'unmatched_with_reversal'
    }
  } else if (reasonCode === 'route_prev') {
    resolvedStatus = 'check_previous_payslip'
  } else if (reasonCode === 'route_next') {
    resolvedStatus = 'check_next_payslip'
  }

  const normalizedRow: AuditRow = {
    date,
    variation,
    normalized_type: isNormalizedType(normalizedType) ? normalizedType : 'other',
    required_units: requiredUnits,
    status: resolvedStatus,
    match_details: matchDetails,
  }

  if (typeof payslipUnits === 'number') {
    normalizedRow.payslip_units = payslipUnits
  }

  if (typeof payslipUnitsRaw === 'number') {
    normalizedRow.payslip_units_raw = payslipUnitsRaw
  }

  if (typeof unitDifference === 'number') {
    normalizedRow.unit_difference = unitDifference
  }

  if (bundleTypes.length > 0) {
    normalizedRow.bundle_types = bundleTypes
  }

  if (typeMappedFrom) {
    normalizedRow.type_mapped_from = typeMappedFrom
  }

  if (matchedParts.length > 0) {
    normalizedRow.matched_parts = matchedParts
  }

  if (reasonCodeRaw) {
    normalizedRow.reason_code = reasonCodeRaw
  }

  if (reversal || reasonCode === 'reversal_only' || reasonCode === 'has_reversal' || reasonCode === 'reversal_present' || reasonCode === 'reversal_present_no_pay') {
    normalizedRow.reversal = true
  }

  if (typeof reversalPos === 'number') {
    normalizedRow.reversal_pos_sum = reversalPos
  }

  if (typeof reversalNeg === 'number') {
    normalizedRow.reversal_neg_sum = reversalNeg
  }

  if (typeof reversalNet === 'number') {
    normalizedRow.reversal_net_units = reversalNet
  }

  if (isFatigue) {
    normalizedRow.is_fatigue = true
  }

  if (affectsCurrentOvertime) {
    normalizedRow.affects_current_overtime = true
  }

  return normalizedRow
}

function normalizeRoutingBreakdown(value: unknown): RoutingBreakdownItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null
      const date = getString(entry.date) ?? ''
      const type = getString(entry.type) ?? ''
      const requiredHours =
        getNumber(entry.required_hours) ?? getNumber(entry.requiredHours) ?? 0
      return {
        date,
        type,
        required_hours: requiredHours,
      }
    })
    .filter((item): item is RoutingBreakdownItem => item !== null)
}

function normalizeCurrentPeriodAdjustments(value: unknown): CurrentPeriodOvertimeAdjustment[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null
      const date = getString(entry.date) ?? ''
      const additionalAvac =
        getNumber(entry.additional_avac) ?? getNumber(entry.additionalAvac) ?? 0
      const totalOvertime =
        getNumber(entry.total_overtime) ?? getNumber(entry.totalOvertime) ?? 0
      return {
        date,
        additional_avac: additionalAvac,
        total_overtime: totalOvertime,
      }
    })
    .filter((item): item is CurrentPeriodOvertimeAdjustment => item !== null)
}

function normalizeDebugInfo(value: unknown): DebugInfo {
  if (!isRecord(value)) {
    return {
      rows_received: 0,
      expected_rows: 0,
      period_end_parsed: '',
    }
  }

  const rowsReceived = getNumber(value.rows_received ?? value.rowsReceived) ?? 0
  const expectedRows = getNumber(value.expected_rows ?? value.expectedRows) ?? 0
  const periodEndParsed = getString(value.period_end_parsed ?? value.periodEndParsed) ?? ''

  return {
    rows_received: rowsReceived,
    expected_rows: expectedRows,
    period_end_parsed: periodEndParsed,
  }
}

function normalizeSummary(
  summaryInput: unknown,
  matched: ClaimEntry[],
  unmatched: ClaimEntry[]
): AnalysisSummary {
  const summary = isRecord(summaryInput) ? summaryInput : {}

  const payPeriodRaw =
    getString(summary.payPeriod) ?? getString(summary.pay_period) ?? null

  let payPeriodStart: string | undefined
  let payPeriodEnd: string | undefined

  if (payPeriodRaw && payPeriodRaw.includes('_')) {
    const [startRaw, endRaw] = payPeriodRaw.split('_')
    if (isIsoDate(startRaw)) {
      payPeriodStart = startRaw
    }
    if (isIsoDate(endRaw)) {
      payPeriodEnd = endRaw
    }
  }

  const matchedCount =
    getNumber(summary.matchedCount) ??
    getNumber(summary.matched_count) ??
    matched.length

  const unmatchedCount =
    getNumber(summary.unmatchedCount) ??
    getNumber(summary.unmatched_count) ??
    unmatched.length

  const toleranceHours =
    getNumber(summary.toleranceHours) ?? getNumber(summary.tolerance_hours) ?? undefined

  const tolerancePercent =
    getNumber(summary.tolerancePercent) ?? getNumber(summary.tolerance_percent) ?? undefined

  const avacTotalHours =
    getNumber(summary.avacTotalHours) ??
    getNumber(summary.avac_total_hours) ??
    matched.reduce((total, entry) => total + entry.avacHours, 0) +
      unmatched.reduce((total, entry) => total + entry.avacHours, 0)

  const totalClaims = matchedCount + unmatchedCount
  const coverageRatio = totalClaims > 0 ? matchedCount / totalClaims : undefined

  const notes = toStringArray(summary.notes)

  return {
    payPeriod: payPeriodRaw,
    payPeriodStart,
    payPeriodEnd,
    avacTotalHours,
    matchedCount,
    unmatchedCount,
    toleranceHours,
    tolerancePercent,
    coverageRatio,
    notes,
  }
}

function buildAnalysis(
  payload: WebhookAnalysisPayload,
  rawSource: unknown
): AnalysisJson {
  const matched = (payload.matched ?? []).map(normalizeClaimEntry)
  const unmatched = (payload.unmatched ?? []).map(normalizeClaimEntry)

  const summary = normalizeSummary(payload.summary, matched, unmatched)

  // Convert legacy webhook format to new format
  return {
    audit_summary: {
      pay_date: summary.payPeriodEnd ?? '',
      pay_period: summary.payPeriod ?? '',
      pay_period_end: summary.payPeriodEnd ?? '',
      total_avac_claims: matched.length + unmatched.length,
      current_period_claims: matched.length + unmatched.length,
      matched_claims: summary.matchedCount,
      unmatched_claims: summary.unmatchedCount,
      invalid_claims: 0,
      future_claims: 0,
      coverage_percentage: summary.coverageRatio ? `${Math.round(summary.coverageRatio * 100)}%` : '0%',
      validation_status: 'OK',
      check_next_payslip_claims: 0,
      check_previous_payslip_claims: 0,
    },
    matched_breakdown: matched,
    unmatched_breakdown: unmatched,
    future_breakdown: [],
    invalid_breakdown: [],
    quick_stats: {
      current_period_message: `${summary.matchedCount} of ${matched.length + unmatched.length} current period claims matched`,
      future_message: 'No future claims',
      unmatched_message: summary.unmatchedCount > 0 ? `⚠ ${summary.unmatchedCount} claims missing from payslip` : 'All claims matched',
      total_unmatched_hours: unmatched.reduce((total, entry) => total + entry.avacHours, 0).toFixed(2),
      total_matched_hours: matched.reduce((total, entry) => total + entry.avacHours, 0).toFixed(2),
      total_future_hours: '0.00'
    },
    debug: {
      rows_received: matched.length + unmatched.length,
      expected_rows: 0,
      period_end_parsed: summary.payPeriodEnd ?? ''
    },
    check_next_payslip_breakdown: [],
    check_previous_payslip_breakdown: [],
    current_period_overtime_adjustments: [],
    raw: rawSource,
  }
}

function isWebhookAnalysisPayload(value: unknown): value is WebhookAnalysisPayload {
  if (!isRecord(value)) return false
  if (!('summary' in value)) return false
  const summary = (value as RecordObject).summary
  if (!isRecord(summary)) return false
  return true
}

function isNormalizedAnalysis(value: unknown): value is LegacyAnalysisJson {
  if (!isRecord(value)) return false
  if (!('summary' in value) || !isRecord((value as RecordObject).summary)) {
    return false
  }
  if (!('matched' in value) || !Array.isArray((value as RecordObject).matched)) {
    return false
  }
  if (!('unmatched' in value) || !Array.isArray((value as RecordObject).unmatched)) {
    return false
  }
  return true
}

function isNewAnalysisFormat(value: unknown): value is AnalysisJson {
  if (!isRecord(value)) return false
  if (!('audit_summary' in value)) return false
  if (!('matched_breakdown' in value)) return false
  if (!('unmatched_breakdown' in value)) return false
  return true
}

function normalizeAuditSummary(value: unknown): AuditSummary {
  if (!isRecord(value)) {
    return {
      pay_date: '',
      pay_period: '',
      pay_period_end: '',
      total_avac_claims: 0,
      current_period_claims: 0,
      matched_claims: 0,
      unmatched_claims: 0,
      invalid_claims: 0,
      future_claims: 0,
      coverage_percentage: '0%',
      validation_status: '',
      check_next_payslip_claims: 0,
      check_previous_payslip_claims: 0,
    }
  }

  const payDate = getString(value.pay_date ?? value.payDate) ?? ''
  const payPeriod = getString(value.pay_period ?? value.payPeriod) ?? ''
  const payPeriodEnd = getString(value.pay_period_end ?? value.payPeriodEnd) ?? ''
  const totalAvac = getNumber(value.total_avac_claims ?? value.totalAvacClaims) ?? 0
  const currentPeriod =
    getNumber(value.current_period_claims ?? value.currentPeriodClaims) ?? 0
  const matchedClaims = getNumber(value.matched_claims ?? value.matchedClaims) ?? 0
  const unmatchedClaims =
    getNumber(value.unmatched_claims ?? value.unmatchedClaims) ?? 0
  const invalidClaims = getNumber(value.invalid_claims ?? value.invalidClaims) ?? 0
  const futureClaims = getNumber(value.future_claims ?? value.futureClaims) ?? 0
  const coveragePercentage =
    getString(value.coverage_percentage ?? value.coveragePercentage) ?? '0%'
  const coverageNumeric =
    getNumber(
      value.coverage_percentage_numeric ?? value.coveragePercentageNumeric
    ) ?? undefined
  const validationStatus =
    getString(value.validation_status ?? value.validationStatus) ?? ''
  const firstAdjustment = getString(
    value.first_adjustment_date ?? value.firstAdjustmentDate
  )
  const lastAdjustment = getString(
    value.last_adjustment_date ?? value.lastAdjustmentDate
  )
  const checkNext =
    getNumber(value.check_next_payslip_claims ?? value.checkNextPayslipClaims) ??
    0
  const checkPrev =
    getNumber(value.check_previous_payslip_claims ?? value.checkPreviousPayslipClaims) ??
    0

  const summary: AuditSummary = {
    pay_date: payDate,
    pay_period: payPeriod,
    pay_period_end: payPeriodEnd,
    total_avac_claims: totalAvac,
    current_period_claims: currentPeriod,
    matched_claims: matchedClaims,
    unmatched_claims: unmatchedClaims,
    invalid_claims: invalidClaims,
    future_claims: futureClaims,
    coverage_percentage: coveragePercentage,
    validation_status: validationStatus,
    check_next_payslip_claims: checkNext,
    check_previous_payslip_claims: checkPrev,
  }

  if (typeof coverageNumeric === 'number') {
    summary.coverage_percentage_numeric = coverageNumeric
  }

  if (firstAdjustment) {
    summary.first_adjustment_date = firstAdjustment
  }

  if (lastAdjustment) {
    summary.last_adjustment_date = lastAdjustment
  }

  return summary
}

function normalizeNewAnalysisJson(data: unknown): AnalysisJson {
  const record = isRecord(data) ? (data as RecordObject) : null
  const auditSummary = normalizeAuditSummary(record?.audit_summary ?? record?.['audit_summary'])
  const matchedBreakdown = Array.isArray(record?.matched_breakdown)
    ? record!.matched_breakdown.map(normalizeClaimEntry)
    : []
  const unmatchedBreakdown = Array.isArray(record?.unmatched_breakdown)
    ? record!.unmatched_breakdown.map(normalizeClaimEntry)
    : []
  const futureBreakdown = Array.isArray(record?.future_breakdown)
    ? record!.future_breakdown.map(normalizeClaimEntry)
    : []
  const invalidBreakdown = Array.isArray(record?.invalid_breakdown)
    ? record!.invalid_breakdown.map(normalizeClaimEntry)
    : []
  const rows = Array.isArray(record?.rows)
    ? record!.rows
        .map(normalizeAuditRow)
        .filter((row): row is AuditRow => row !== null)
    : []
  const quickStats = isRecord(record?.quick_stats)
    ? (record!.quick_stats as unknown as QuickStats)
    : {
        current_period_message: '',
        future_message: '',
        unmatched_message: '',
        total_unmatched_hours: '0',
        total_matched_hours: '0',
        total_future_hours: '0',
      }
  const debug = normalizeDebugInfo(record?.debug)
  const checkNextBreakdown = normalizeRoutingBreakdown(
    record?.check_next_payslip_breakdown
  )
  const checkPrevBreakdown = normalizeRoutingBreakdown(
    record?.check_previous_payslip_breakdown
  )
  const overtimeAdjustments = normalizeCurrentPeriodAdjustments(
    record?.current_period_overtime_adjustments
  )

  return {
    audit_summary: auditSummary,
    rows,
    matched_breakdown: matchedBreakdown,
    unmatched_breakdown: unmatchedBreakdown,
    future_breakdown: futureBreakdown,
    invalid_breakdown: invalidBreakdown,
    quick_stats: quickStats,
    debug,
    check_next_payslip_breakdown: checkNextBreakdown,
    check_previous_payslip_breakdown: checkPrevBreakdown,
    current_period_overtime_adjustments: overtimeAdjustments,
    raw: record?.raw ?? data,
  }
}

export function normalizeAnalysisJson(data: unknown): AnalysisJson | null {
  if (!data) return null

  // Handle new format
  if (Array.isArray(data) && data.length > 0 && isNewAnalysisFormat(data[0])) {
    return normalizeNewAnalysisJson(data[0])
  }

  if (isNewAnalysisFormat(data)) {
    return normalizeNewAnalysisJson(data as AnalysisJson)
  }

  // Handle legacy format
  if (isNormalizedAnalysis(data)) {
    const legacyData = data as LegacyAnalysisJson
    const matched = (legacyData.matched ?? []).map(normalizeClaimEntry)
    const unmatched = (legacyData.unmatched ?? []).map(normalizeClaimEntry)
    const summary = normalizeSummary(legacyData.summary, matched, unmatched)

    // Convert legacy format to new format
    return {
      audit_summary: {
        pay_date: summary.payPeriodEnd ?? '',
        pay_period: summary.payPeriod ?? '',
        pay_period_end: summary.payPeriodEnd ?? '',
        total_avac_claims: matched.length + unmatched.length,
        current_period_claims: matched.length + unmatched.length,
        matched_claims: summary.matchedCount,
        unmatched_claims: summary.unmatchedCount,
        invalid_claims: 0,
        future_claims: 0,
        coverage_percentage: summary.coverageRatio ? `${Math.round(summary.coverageRatio * 100)}%` : '0%',
        validation_status: 'Migrated from legacy format',
        check_next_payslip_claims: 0,
        check_previous_payslip_claims: 0,
      },
      matched_breakdown: matched,
      unmatched_breakdown: unmatched,
      future_breakdown: [],
      invalid_breakdown: [],
      quick_stats: {
        current_period_message: `${summary.matchedCount} of ${matched.length + unmatched.length} current period claims matched`,
        future_message: 'No future claims',
        unmatched_message: summary.unmatchedCount > 0 ? `⚠ ${summary.unmatchedCount} claims missing from payslip` : 'All claims matched',
        total_unmatched_hours: unmatched.reduce((total, entry) => total + entry.avacHours, 0).toFixed(2),
        total_matched_hours: matched.reduce((total, entry) => total + entry.avacHours, 0).toFixed(2),
        total_future_hours: '0.00'
      },
      debug: {
        rows_received: matched.length + unmatched.length,
        expected_rows: 0,
        period_end_parsed: summary.payPeriodEnd ?? ''
      },
      check_next_payslip_breakdown: [],
      check_previous_payslip_breakdown: [],
      current_period_overtime_adjustments: [],
      raw: legacyData.raw ?? data,
    }
  }

  if (Array.isArray(data) && data.length > 0) {
    const candidate = data[0]
    if (isWebhookAnalysisPayload(candidate)) {
      return buildAnalysis(candidate, data)
    }
  }

  if (isWebhookAnalysisPayload(data)) {
    return buildAnalysis(data, data)
  }

  return null
}

/**
 * Start an analysis job by uploading files to n8n
 * Returns analysis result from n8n response on success, throws JobError on failure
 */
export async function startAnalyzeJob(
  params: StartAnalyzeJobParams
): Promise<AnalysisJson> {
  const validationError = validateFiles(params.payslip, params.avacs)
  if (validationError) {
    throw validationError
  }

  try {
    const apiUrl = '/api/analyze'

    const formData = buildFormData(params)

    console.log('Posting analysis request to internal API route', {
      url: apiUrl,
      formDataKeys: Array.from(formData.keys())
    })

    const result = await postMultipart<any>(apiUrl, formData, {
      timeout: 35000,
      retries: 1,
      headers: {
        Accept: 'application/json',
      },
    })
    
    console.log('n8n webhook response received:', {
      responseType: typeof result,
      isArray: Array.isArray(result),
      keys: result && typeof result === 'object' ? Object.keys(result) : []
    });

    let responseData: unknown = result

    if (typeof result === 'string') {
      try {
        responseData = JSON.parse(result)
      } catch (error) {
        throw new Error('Failed to parse string response as JSON')
      }
    }

    if (isRecord(result) && 'data' in result) {
      responseData = result.data
    }

    if (isRecord(result) && 'result' in result) {
      responseData = result.result
    }

    if (isRecord(result) && 'body' in result) {
      responseData = result.body
    }

    if (isRecord(result) && 'json' in result) {
      responseData = result.json
    }

    const analysis = normalizeAnalysisJson(responseData)

    if (!analysis) {
      const responseType = Array.isArray(responseData)
        ? 'array'
        : typeof responseData
      const responseKeys = isRecord(responseData)
        ? Object.keys(responseData)
        : []

      // Special handling for empty responses
      if (responseData === null || responseData === undefined) {
        throw new Error(
          'n8n webhook returned empty response. Please check that your n8n workflow has a "Respond to Webhook" node that returns the analysis results.'
        )
      }

      throw new Error(
        `Invalid n8n response format. Expected summary with matched/unmatched claims. Got ${responseType} with keys: ${responseKeys.join(', ')}`
      )
    }

    if (!('raw' in analysis)) {
      analysis.raw = responseData
    }

    return analysis
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      throw {
        message: (error as any).message,
      } as JobError
    }

    throw {
      message: 'Failed to analyze documents via n8n. Please try again.',
    } as JobError
  }
}
