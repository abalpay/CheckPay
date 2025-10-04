/**
 * Jobs client for browser → n8n synchronous analysis
 * Handles file validation, FormData construction, and API communication
 */

import { upload } from '@vercel/blob/client'

import { fetchJSON, postMultipart } from './http'

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
  | 'paid'
  | 'partially_paid'
  | 'unpaid'
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
  matched_via_regular_pay?: boolean
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
  paid_claims?: number
  partially_paid_claims?: number
  unpaid_claims?: number
  paid_percentage_numeric?: number
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

export interface ReconHeaderEcho {
  rostered_overtime_total?: number
  rostered_overtime_by_rate?: Record<string, number>
  tolerance_hours?: number
  adjustment_bounds?: {
    first?: string
    last?: string
  }
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
  recon_header_echo?: ReconHeaderEcho
  report_type?: 'recon' | 'analysis'
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

interface UploadedBlobInfo {
  url: string
  downloadUrl: string
  pathname: string
  size: number
  uploadedAt: string
  contentType: string
}

interface UploadedFileReference {
  blob: UploadedBlobInfo
  originalName: string
}

interface AnalyzeJobRequestBody {
  payslip: UploadedFileReference
  avacs: UploadedFileReference[]
  metadata: Record<string, unknown>
  uploadSessionId: string
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
 * Sanitize a filename segment for blob storage paths
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

function buildJobMetadata(params: StartAnalyzeJobParams): Record<string, unknown> {
  return {
    baseOvertimePerDay: params.baseOvertimePerDay,
    workingDays: params.workingDays,
    rosteredOvertime: params.rosteredOvertime,
    clientVersion: '1.0.0-mvp',
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }
}

function createUploadSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function uploadFileToBlob(
  file: File,
  sessionId: string,
  fileType: 'payslip' | 'avac',
  index: number
): Promise<UploadedFileReference> {
  try {
    const safeName = sanitizeFileName(file.name || `${fileType}-${index}.pdf`)
    const path = `${sessionId}/${fileType}-${index + 1}-${safeName}`
    const blob = await upload(path, file, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload',
      clientPayload: JSON.stringify({
        sessionId,
        fileType,
        originalName: file.name,
      }),
      contentType: 'application/pdf',
    })

    return {
      blob: {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
        contentType: blob.contentType,
      },
      originalName: file.name,
    }
  } catch (error) {
    console.error('Failed to upload file to Vercel Blob', {
      fileType,
      sessionId,
      error,
    })

    throw {
      field: fileType,
      message:
        fileType === 'payslip'
          ? 'Failed to upload payslip. Please try again.'
          : 'Failed to upload AVAC files. Please try again.',
    } satisfies JobError
  }
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
  'paid',
  'partially_paid',
  'unpaid',
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

function normalizeStatusValue(value: string | null): AvacStatus | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const toSnake = (input: string) =>
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
  const lower = trimmed.toLowerCase()
  if (isStatus(lower)) {
    return lower
  }

  const snakeLower = toSnake(trimmed).toLowerCase()
  if (isStatus(snakeLower)) {
    return snakeLower
  }

  const aliasMap: Record<string, AvacStatus> = {
    CORRECTLY_PAID: 'paid',
    PAID: 'paid',
    PAID_IN_FULL: 'paid',
    PARTIALLY_PAID_OR_MISMATCHED: 'partially_paid',
    PARTIALLY_PAID: 'partially_paid',
    MISSING: 'unpaid',
    UNPAID: 'unpaid',
    MATCHED: 'matched',
    PARTIALLY_MATCHED: 'partially_matched',
    UNMATCHED: 'unmatched',
    MATCHED_WITH_REVERSAL: 'matched_with_reversal',
    PARTIALLY_MATCHED_WITH_REVERSAL: 'partially_matched_with_reversal',
    UNMATCHED_WITH_REVERSAL: 'unmatched_with_reversal',
    REVERSAL_ONLY: 'reversal_only',
    CURRENT_PERIOD: 'current_period',
    CHECK_NEXT: 'check_next_payslip',
    CHECK_NEXT_PAYSLIP: 'check_next_payslip',
    CHECK_NEXT_PAY_SLIP: 'check_next_payslip',
    CHECK_FUTURE: 'check_next_payslip',
    FUTURE: 'check_next_payslip',
    CHECK_PREVIOUS: 'check_previous_payslip',
    CHECK_PREV: 'check_previous_payslip',
    CHECK_PREVIOUS_PAYSLIP: 'check_previous_payslip',
    CHECK_PREVIOUS_PAY_SLIP: 'check_previous_payslip',
    CHECK_PREV_PAYSLIP: 'check_previous_payslip',
    CHECK_PREV_PAY_SLIP: 'check_previous_payslip',
    INVALID: 'invalid',
  }

  const snakeUpper = toSnake(trimmed).toUpperCase()
  if (snakeUpper in aliasMap) {
    return aliasMap[snakeUpper]
  }

  const upper = trimmed.replace(/\s+/g, '_').replace(/-+/g, '_').toUpperCase()
  if (upper in aliasMap) {
    return aliasMap[upper]
  }

  return null
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

  let resolvedStatus: AvacStatus = normalizeStatusValue(status) ?? 'matched'

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

interface ReconTotalsRecord extends Record<string, unknown> {
  claims_processed?: unknown
  paid?: unknown
  partially_paid?: unknown
  unpaid?: unknown
  pct_paid?: unknown
}

interface ReconClaimRowRecord extends Record<string, unknown> {
  date?: unknown
  claim_type?: unknown
  expected_hours?: unknown
  matched_hours?: unknown
  outcome?: unknown
  notes?: unknown
  matched_buckets?: unknown
  source_breakdown?: unknown
}

interface ReconReportRecord extends Record<string, unknown> {
  pay_period?: unknown
  pay_date?: unknown
  totals?: unknown
  claims_table?: unknown
  header_echo?: unknown
}

interface StringifiedReconSummaryRecord extends Record<string, unknown> {
  total_claims?: unknown
  correctly_paid?: unknown
  missing?: unknown
  partially_paid_or_mismatched?: unknown
  check_previous?: unknown
  check_future?: unknown
  action_required?: unknown
  coverage?: unknown
}

interface StringifiedReconRowRecord extends Record<string, unknown> {
  claim_date?: unknown
  claim_type?: unknown
  claimed_hours?: unknown
  status?: unknown
  reasoning?: unknown
}

interface StringifiedReconOutOfWindowRecord extends Record<string, unknown> {
  check_previous?: unknown
  check_future?: unknown
}

interface StringifiedReconRecord extends Record<string, unknown> {}

function normalizeReconKey(key: string): string {
  return key.replace(/\s+/g, ' ').trim().toLowerCase()
}

function getReconKey<T extends string>(record: Record<string, unknown>, target: T): string | null {
  const normalizedTarget = normalizeReconKey(target)
  for (const key of Object.keys(record)) {
    if (normalizeReconKey(key) === normalizedTarget) {
      return key
    }
  }
  return null
}

function hasReconKey(record: Record<string, unknown>, target: string): boolean {
  return getReconKey(record, target) !== null
}

function getReconValue(record: Record<string, unknown>, target: string): unknown {
  const key = getReconKey(record, target)
  return key ? record[key] : undefined
}

function isStringifiedReconRecord(value: unknown): value is StringifiedReconRecord {
  if (!isRecord(value)) return false
  const record = value as Record<string, unknown>
  const hasPayPeriod = hasReconKey(record, 'pay period')
  const hasSummary = (() => {
    const summary = getReconValue(record, 'recon summary')
    return summary !== null && summary !== undefined
  })()
  const hasTable = (() => {
    const table = getReconValue(record, 'table')
    return table !== null && table !== undefined
  })()
  return hasPayPeriod && hasSummary && hasTable
}

function parseJsonValue<T>(value: unknown): T | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed as T
    } catch (error) {
      console.warn('Failed to parse JSON string from recon payload', { value })
      return null
    }
  }

  if (Array.isArray(value) || isRecord(value)) {
    return value as T
  }

  return null
}

function mapStringifiedStatus(status: string | null): AvacStatus {
  const normalized = (status ?? '').toUpperCase()
  const mapped: Record<string, AvacStatus> = {
    CORRECTLY_PAID: 'paid',
    PAID: 'paid',
    MISSING: 'unpaid',
    UNPAID: 'unpaid',
    PARTIALLY_PAID: 'partially_paid',
    PARTIALLY_PAID_OR_MISMATCHED: 'partially_paid',
    CHECK_PREVIOUS: 'check_previous_payslip',
    CHECK_PREV: 'check_previous_payslip',
    CHECK_FUTURE: 'check_next_payslip',
    CHECK_NEXT: 'check_next_payslip',
    FUTURE: 'check_next_payslip',
    INVALID: 'invalid',
  }

  return mapped[normalized] ?? 'unpaid'
}

function mapStringifiedType(type: string | null): AvacNormalizedType {
  const value = (type ?? '').toLowerCase()
  if (value.includes('overtime')) return 'overtime'
  if (value.includes('fatigue')) return 'fatigue'
  if (value.includes('recall') && value.includes('offsite')) return 'recall_offsite'
  if (value.includes('recall')) return 'recall_onsite'
  return 'other'
}

function normalizeStringifiedReconReport(data: StringifiedReconRecord): AnalysisJson {
  const payPeriodRaw = getReconValue(data, 'pay period')
  const payDateRaw = getReconValue(data, 'pay date')
  const summaryRaw = getReconValue(data, 'recon summary')
  const actionRequiredRaw = getReconValue(data, 'action required')
  const outOfWindowRaw = getReconValue(data, 'out of window')
  const tableRaw = getReconValue(data, 'table')

  const payPeriod = getString(payPeriodRaw) ?? ''
  const payDate = getString(payDateRaw) ?? ''

  const summaryRecord = parseJsonValue<StringifiedReconSummaryRecord>(summaryRaw) ?? {}
  const tableEntries = parseJsonValue<StringifiedReconRowRecord[]>(tableRaw) ?? []
  const outOfWindow = parseJsonValue<StringifiedReconOutOfWindowRecord>(outOfWindowRaw) ?? {}
  const actionRequired = parseJsonValue<StringifiedReconRowRecord[]>(actionRequiredRaw) ?? []

  const totalClaims = getNumber(summaryRecord.total_claims) ?? tableEntries.length
  const correctlyPaid = getNumber(summaryRecord.correctly_paid) ?? 0
  const missing = getNumber(summaryRecord.missing) ?? 0
  const partiallyPaid = getNumber(summaryRecord.partially_paid_or_mismatched) ?? 0
  const checkPrevious = getNumber(summaryRecord.check_previous) ?? 0
  const checkFuture = getNumber(summaryRecord.check_future) ?? 0
  const coverageRaw = getNumber(summaryRecord.coverage)

  const rows: AuditRow[] = tableEntries
    .map((entry) => {
      if (!isRecord(entry)) return null

      const claimDate = getString(entry.claim_date) ?? ''
      const claimType = getString(entry.claim_type) ?? ''
      const reasoning = getString(entry.reasoning) ?? ''
      const claimedHours = getNumber(entry.claimed_hours) ?? 0
      const status = mapStringifiedStatus(getString(entry.status))

      let payslipUnits: number | undefined
      if (status === 'paid') {
        payslipUnits = claimedHours
      } else if (status === 'unpaid') {
        payslipUnits = 0
      }

      const unitDifference =
        typeof payslipUnits === 'number' ? Number((payslipUnits - claimedHours).toFixed(2)) : undefined

      const row: AuditRow = {
        date: claimDate,
        variation: claimType,
        normalized_type: mapStringifiedType(claimType),
        required_units: claimedHours,
        status,
        match_details: reasoning,
      }

      if (typeof payslipUnits === 'number') {
        row.payslip_units = payslipUnits
      }

      if (typeof unitDifference === 'number') {
        row.unit_difference = unitDifference
      }

      return row
    })
    .filter((row): row is AuditRow => row !== null)

  const sums = rows.reduce(
    (acc, row) => {
      const hours = typeof row.required_units === 'number' ? row.required_units : 0
      if (row.status === 'paid') acc.matched += hours
      else if (row.status === 'unpaid') acc.unmatched += hours
      else if (row.status === 'check_next_payslip') acc.future += hours
      return acc
    },
    { matched: 0, unmatched: 0, future: 0 }
  )

  const coveragePercent = (() => {
    if (typeof coverageRaw !== 'number') return null
    const scaled = coverageRaw <= 1 ? coverageRaw * 100 : coverageRaw
    return Math.round(scaled * 10) / 10
  })()

  const coverageLabel =
    typeof coveragePercent === 'number'
      ? `${coveragePercent % 1 === 0 ? coveragePercent.toFixed(0) : coveragePercent.toFixed(1)}%`
      : ''

  const payPeriodEnd = (() => {
    const parts = payPeriod.split(' to ')
    if (parts.length === 2) {
      const end = parts[1]
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(end)) return end
      if (/^\d{2}\/\d{2}$/.test(end) && /^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
        const year = payDate.slice(0, 4)
        const [day, month] = end.split('/')
        return `${year}-${month}-${day}`
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(end)) return end
      return end
    }
    return payDate
  })()

  const quickStats: QuickStats = {
    current_period_message: `${correctlyPaid + partiallyPaid + missing} claims in current period`,
    future_message:
      checkFuture > 0 ? `${checkFuture} claim${checkFuture === 1 ? '' : 's'} pending future payslip` : 'No future claims',
    unmatched_message:
      missing > 0 ? `⚠ ${missing} claim${missing === 1 ? '' : 's'} missing from payslip` : 'All claims reconciled',
    total_unmatched_hours: sums.unmatched.toFixed(2),
    total_matched_hours: sums.matched.toFixed(2),
    total_future_hours: sums.future.toFixed(2),
  }

  const checkPrevBreakdownRaw = parseJsonValue<StringifiedReconRowRecord[]>(
    outOfWindow.check_previous
  )
  const checkNextBreakdownRaw = parseJsonValue<StringifiedReconRowRecord[]>(
    outOfWindow.check_future
  )

  const checkPrevBreakdown = normalizeRoutingBreakdown(
    (checkPrevBreakdownRaw ?? []).map((item) => ({
      date: getString(item?.claim_date) ?? '',
      type: getString(item?.claim_type) ?? '',
      required_hours: getNumber(item?.claimed_hours) ?? 0,
    }))
  )

  const checkNextBreakdown = normalizeRoutingBreakdown(
    (checkNextBreakdownRaw ?? []).map((item) => ({
      date: getString(item?.claim_date) ?? '',
      type: getString(item?.claim_type) ?? '',
      required_hours: getNumber(item?.claimed_hours) ?? 0,
    }))
  )

  return {
    audit_summary: {
      pay_date: payDate,
      pay_period: payPeriod,
      pay_period_end: payPeriodEnd ?? '',
      total_avac_claims: totalClaims,
      current_period_claims: totalClaims,
      matched_claims: correctlyPaid,
      unmatched_claims: missing,
      invalid_claims: 0,
      future_claims: checkFuture,
      coverage_percentage: coverageLabel || '',
      validation_status: 'Processed by n8n recon',
      check_next_payslip_claims: checkFuture,
      check_previous_payslip_claims: checkPrevious,
      paid_claims: correctlyPaid,
      partially_paid_claims: partiallyPaid,
      unpaid_claims: missing,
      ...(typeof coveragePercent === 'number'
        ? {
            paid_percentage_numeric: coveragePercent,
            coverage_percentage_numeric: coverageRaw,
          }
        : {}),
    },
    rows,
    matched_breakdown: [],
    unmatched_breakdown: [],
    future_breakdown: [],
    invalid_breakdown: [],
    quick_stats: quickStats,
    debug: {
      rows_received: rows.length,
      expected_rows: totalClaims,
      period_end_parsed: payPeriodEnd ?? '',
    },
    check_next_payslip_breakdown: checkNextBreakdown,
    check_previous_payslip_breakdown: checkPrevBreakdown,
    current_period_overtime_adjustments: [],
    raw: data,
    report_type: 'recon',
  }
}

function isReconReport(value: unknown): value is ReconReportRecord {
  if (!isRecord(value)) return false
  if (!('claims_table' in value)) return false
  if (!Array.isArray((value as ReconReportRecord).claims_table)) return false
  return true
}

function normalizeReconHeaderEcho(value: unknown): ReconHeaderEcho | undefined {
  if (!isRecord(value)) return undefined
  const header: ReconHeaderEcho = {}

  const rosteredTotal = getNumber(value.rostered_overtime_total)
  if (typeof rosteredTotal === 'number') {
    header.rostered_overtime_total = rosteredTotal
  }

  if (isRecord(value.rostered_overtime_by_rate)) {
    const rates: Record<string, number> = {}
    for (const [rate, amount] of Object.entries(value.rostered_overtime_by_rate as Record<string, unknown>)) {
      const parsed = getNumber(amount)
      if (typeof parsed === 'number') {
        rates[rate] = parsed
      }
    }
    header.rostered_overtime_by_rate = rates
  }

  const toleranceHours = getNumber(value.tolerance_hours)
  if (typeof toleranceHours === 'number') {
    header.tolerance_hours = toleranceHours
  }

  if (isRecord(value.adjustment_bounds)) {
    header.adjustment_bounds = {
      first: getString(value.adjustment_bounds.first) ?? undefined,
      last: getString(value.adjustment_bounds.last) ?? undefined,
    }
  }

  return Object.keys(header).length > 0 ? header : undefined
}

function normalizeReconReport(data: ReconReportRecord): AnalysisJson {
  const totalsRecord = isRecord(data.totals) ? (data.totals as ReconTotalsRecord) : {}
  const claims = Array.isArray(data.claims_table) ? (data.claims_table as ReconClaimRowRecord[]) : []

  const payPeriod = getString(data.pay_period) ?? ''
  const payDate = getString(data.pay_date) ?? ''
  const periodParts = payPeriod.split(' to ')
  const payPeriodEnd = periodParts.length === 2 ? periodParts[1] : ''

  const totalClaimsRaw = getNumber(totalsRecord.claims_processed)
  const paidClaimsRaw = getNumber(totalsRecord.paid)
  const partiallyPaidClaimsRaw = getNumber(totalsRecord.partially_paid)
  const unpaidClaimsRaw = getNumber(totalsRecord.unpaid)
  const pctPaid = getNumber(totalsRecord.pct_paid)

  let checkPrevious = 0
  let checkNext = 0

  const normalizedRows: AuditRow[] = claims
    .map((entry) => {
      if (!isRecord(entry)) return null

      const date = getString(entry.date) ?? ''
      const claimTypeRaw = getString(entry.claim_type) ?? ''
      const normalizedType = (() => {
        const type = claimTypeRaw.toLowerCase()
        if (type === 'overtime') return 'overtime'
        if (type === 'recall') return 'recall_onsite'
        if (type === 'fatigue') return 'fatigue'
        return 'other'
      })()

      const expectedHours = getNumber(entry.expected_hours) ?? 0
      const matchedHours = getNumber(entry.matched_hours) ?? 0
      const outcomeRaw = getString(entry.outcome)?.toLowerCase()

      let status: AvacStatus
      switch (outcomeRaw) {
        case 'paid':
          status = 'paid'
          break
        case 'partially_paid':
          status = 'partially_paid'
          break
        case 'unpaid':
          status = 'unpaid'
          break
        default:
          status = 'unpaid'
      }

      const matchedBuckets = isRecord(entry.matched_buckets)
        ? (entry.matched_buckets as Record<string, unknown>)
        : {}

      const parts = (
        [
          ['1.5', 'Overtime @1.5'],
          ['2.0', 'Overtime @2.0'],
          ['2.5', 'Overtime @2.5'],
        ] as const
      ).flatMap(([rate, label]) => {
        const amount = getNumber(matchedBuckets[rate])
        return typeof amount === 'number' && amount !== 0
          ? [{ type: label, units: amount }]
          : []
      })

      const sourceBreakdown = isRecord(entry.source_breakdown)
        ? (entry.source_breakdown as Record<string, unknown>)
        : {}
      const matchedViaRegularPay = getNumber(sourceBreakdown.regular_pay)
      const notes = getString(entry.notes) ?? ''
      const lowerNotes = notes.toLowerCase()

      if (lowerNotes.includes('check previous payslip')) {
        checkPrevious += 1
      }
      if (lowerNotes.includes('check next payslip')) {
        checkNext += 1
      }

      const unitDifference = expectedHours - matchedHours

      let matchDetails = notes
      if (!matchDetails) {
        if (status === 'partially_paid') {
          const absDiff = Math.abs(unitDifference)
          if (absDiff > 0.01) {
            const direction = unitDifference > 0 ? 'Short by' : 'Over by'
            matchDetails = `${direction} ${absDiff.toFixed(2)}h`
          } else {
            matchDetails = 'Partially paid'
          }
        } else if (status === 'unpaid') {
          matchDetails = 'No ledger entries for this date'
        }
      }

      const normalized: AuditRow = {
        date,
        variation: claimTypeRaw || '—',
        normalized_type: normalizedType,
        required_units: expectedHours,
        payslip_units: matchedHours,
        status,
        match_details: matchDetails,
        matched_parts: parts,
        unit_difference: unitDifference,
      }

      if (typeof matchedViaRegularPay === 'number' && matchedViaRegularPay > 0) {
        normalized.matched_via_regular_pay = true
      }

      if (claimTypeRaw && normalizedType !== claimTypeRaw.toLowerCase()) {
        normalized.type_mapped_from = claimTypeRaw
      }

      return normalized
    })
    .filter((row): row is AuditRow => row !== null)

  const computedTotals = {
    paid: normalizedRows.filter((row) => row.status === 'paid').length,
    partiallyPaid: normalizedRows.filter((row) => row.status === 'partially_paid').length,
    unpaid: normalizedRows.filter((row) => row.status === 'unpaid').length,
  }

  const totalClaims = totalClaimsRaw ?? normalizedRows.length
  const paidClaims = paidClaimsRaw ?? computedTotals.paid
  const partiallyPaidClaims = partiallyPaidClaimsRaw ?? computedTotals.partiallyPaid
  const unpaidClaims = unpaidClaimsRaw ?? computedTotals.unpaid

  const summary: AuditSummary = {
    pay_date: payDate,
    pay_period: payPeriod,
    pay_period_end: payPeriodEnd,
    total_avac_claims: totalClaims,
    current_period_claims: totalClaims,
    matched_claims: paidClaims,
    unmatched_claims: unpaidClaims,
    invalid_claims: 0,
    future_claims: 0,
    coverage_percentage:
      typeof pctPaid === 'number'
        ? `${pctPaid.toFixed(Number.isInteger(pctPaid) ? 0 : 1)}%`
        : `${((paidClaims / Math.max(totalClaims, 1)) * 100).toFixed(0)}%`,
    validation_status: 'Recon report',
    check_next_payslip_claims: checkNext,
    check_previous_payslip_claims: checkPrevious,
    paid_claims: paidClaims,
    partially_paid_claims: partiallyPaidClaims,
    unpaid_claims: unpaidClaims,
  }

  if (typeof pctPaid === 'number') {
    summary.coverage_percentage_numeric = pctPaid
    summary.paid_percentage_numeric = pctPaid
  } else {
    const computedPct = Number(((paidClaims / Math.max(totalClaims, 1)) * 100).toFixed(2))
    summary.coverage_percentage_numeric = computedPct
    summary.paid_percentage_numeric = computedPct
  }

  const quickStats: QuickStats = {
    current_period_message: `${summary.matched_claims} of ${summary.total_avac_claims} claims paid`,
    future_message: 'No future claims',
    unmatched_message:
      summary.unmatched_claims > 0
        ? `⚠ ${summary.unmatched_claims} unpaid claim${summary.unmatched_claims === 1 ? '' : 's'}`
        : 'All claims paid',
    total_unmatched_hours: normalizedRows
      .filter((row) => row.status === 'unpaid')
      .reduce((total, row) => total + (row.required_units ?? 0), 0)
      .toFixed(2),
    total_matched_hours: normalizedRows
      .filter((row) => row.status === 'paid' || row.status === 'partially_paid')
      .reduce((total, row) => total + (row.payslip_units ?? 0), 0)
      .toFixed(2),
    total_future_hours: '0.00',
  }

  const debug: DebugInfo = {
    rows_received: normalizedRows.length,
    expected_rows: totalClaims,
    period_end_parsed: payPeriodEnd,
  }

  return {
    audit_summary: summary,
    rows: normalizedRows,
    matched_breakdown: [],
    unmatched_breakdown: [],
    future_breakdown: [],
    invalid_breakdown: [],
    quick_stats: quickStats,
    debug,
    check_next_payslip_breakdown: [],
    check_previous_payslip_breakdown: [],
    current_period_overtime_adjustments: [],
    raw: data,
    recon_header_echo: normalizeReconHeaderEcho(data.header_echo),
    report_type: 'recon',
  }
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
    report_type: 'analysis',
  }
}

export function normalizeAnalysisJson(data: unknown): AnalysisJson | null {
  if (!data) return null

  if (isReconReport(data)) {
    return normalizeReconReport(data)
  }

  if (Array.isArray(data) && data.length > 0 && isReconReport(data[0])) {
    return normalizeReconReport(data[0])
  }

  if (Array.isArray(data) && data.length > 0 && isStringifiedReconRecord(data[0])) {
    return normalizeStringifiedReconReport(data[0])
  }

  if (isStringifiedReconRecord(data)) {
    return normalizeStringifiedReconReport(data)
  }

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
      report_type: 'analysis',
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
    const metadata = buildJobMetadata(params)

    const parseAnalysisResponse = (result: unknown): AnalysisJson => {
      console.log('n8n webhook response received:', {
        responseType: typeof result,
        isArray: Array.isArray(result),
        keys: result && typeof result === 'object' ? Object.keys(result) : [],
      })

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
    }

    const analyzeViaMultipart = async (): Promise<AnalysisJson> => {
      const formData = new FormData()
      formData.append('payslip', params.payslip)
      params.avacs.forEach((file) => formData.append('avacs[]', file))
      formData.append('meta', JSON.stringify(metadata))

      const result = await postMultipart<any>(apiUrl, formData, {
        timeout: 60000,
        retries: 0,
        headers: {
          Accept: 'application/json',
        },
      })

      return parseAnalysisResponse(result)
    }

    const analyzeViaBlobUploads = async (): Promise<AnalysisJson> => {
      const uploadSessionId = createUploadSessionId()

      console.log('Uploading documents to Vercel Blob storage', {
        uploadSessionId,
        avacCount: params.avacs.length,
        metadataKeys: Object.keys(metadata),
      })

      const [payslipUpload, avacUploads] = await Promise.all([
        uploadFileToBlob(params.payslip, uploadSessionId, 'payslip', 0),
        Promise.all(
          params.avacs.map((file, index) =>
            uploadFileToBlob(file, uploadSessionId, 'avac', index)
          )
        ),
      ])

      const requestBody: AnalyzeJobRequestBody = {
        payslip: payslipUpload,
        avacs: avacUploads,
        metadata,
        uploadSessionId,
      }

      const result = await fetchJSON<any>(apiUrl, {
        method: 'POST',
        timeout: 60000,
        retries: 0,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      return parseAnalysisResponse(result)
    }

    const shouldUseBlobUploads =
      typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_ANALYZE_UPLOAD_STRATEGY === 'blob'

    const shouldFallbackToDirect = (error: unknown): boolean => {
      if (!shouldUseBlobUploads) return false
      if (error && typeof error === 'object') {
        if ('field' in (error as Record<string, unknown>)) {
          return true
        }
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') {
          const lower = message.toLowerCase()
          return lower.includes('blob') || lower.includes('upload')
        }
      }
      return false
    }

    if (shouldUseBlobUploads) {
      try {
        return await analyzeViaBlobUploads()
      } catch (error) {
        if (!shouldFallbackToDirect(error)) {
          throw error
        }

        console.warn('Blob upload path failed, falling back to direct upload strategy', {
          error,
        })
      }
    }

    return await analyzeViaMultipart()
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
