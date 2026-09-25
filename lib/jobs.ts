export interface LineItem {
  date: string
  day_of_week: string
  pay_type: string
  status: string
  expected_units: number
  actual_units: number
  expected_amount: number
  actual_amount: number
  difference: number
  notes: string
}

export interface DayResult {
  date: string
  day_of_week: string
  day_type: 'weekday' | 'saturday' | 'sunday' | 'public_holiday' | string
  status: 'OK' | 'OVERPAID' | 'UNDERPAID' | 'ANOMALY' | 'NOT_ON_THIS_PAYSLIP' | 'NEEDS_FORTNIGHT_PAYSLIP' | 'CHECK_PREVIOUS' | 'CHECK_FUTURE' | 'ISSUE_WITHIN_WINDOW' | string
  expected_total: number
  actual_total: number
  difference: number
  items: LineItem[]
}

export interface OlderAdj {
  pay_type: string
  amount: number
  notes: string
}

export interface UnmatchedEntry {
  date: string
  pay_type: string
  amount: number
}

export interface AvacReport {
  overall_status: 'ALL_MATCH' | 'DISCREPANCIES_FOUND' | 'OK_WITH_ANOMALIES'
  match_count: number
  discrepancy_count: number
  missing_count: number
  unmatched_count: number
  check_previous_count?: number
  check_future_count?: number
  not_on_this_payslip_count?: number
  needs_fortnight_payslip_count?: number
  within_window_issue_count?: number
  not_yet_paid_count: number
  possibly_missed_count: number
  earliest_adjustment_date: string
  latest_adjustment_date: string
  total_expected: number
  total_actual: number
  /** Actionable lines only (UNDERPAID/OVERPAID/MISSING/UNMATCHED/ISSUE_WITHIN_WINDOW). INFO, threshold and reversal lines are in informational_difference. */
  total_difference: number
  reversal_count?: number
  informational_difference?: number
  pending_expected_total?: number
  warnings?: string[]
  days: DayResult[]
  actionable_items: LineItem[]
  older_adjustments: OlderAdj[]
  older_adjustments_total: number
  unmatched_payslip_entries: UnmatchedEntry[]
}

export interface AvacResult {
  avac_name: string
  error?: string
  report?: AvacReport
}

export interface ReconcileResponseBase {
  status: 'ok' | 'correction_payslip'
  employee: string
  pay_date: string
  pay_period_start?: string
  pay_period_end?: string
  adjustment_total: number
  avac_results: AvacResult[]
  payslips?: { pay_date: string; period_start?: string; period_end?: string }[]
  /** Weeks with lines on no uploaded payslip. Listed only, never escalated. age_days = latest pay date − week_start. */
  unpaid_weeks?: { week_start: string; avac_name: string; expected_total: number; age_days: number | null }[]
}

export interface ReconcileResponseOk extends ReconcileResponseBase {
  status: 'ok'
  base_rate: number
  is_overpayment_payslip: boolean
  older_adjustments_total: number
}

export interface ReconcileResponseCorrection extends ReconcileResponseBase {
  status: 'correction_payslip'
  message?: string
  overpayment_amount?: number
  base_rate?: number
  is_overpayment_payslip?: boolean
  older_adjustments_total?: number
}

export type ReconcileResponse = ReconcileResponseOk | ReconcileResponseCorrection

export type AnalysisJson = ReconcileResponse

interface OverallStatusMeta {
  label: string
  className: string
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

export interface JobError {
  field?: string
  message: string
}

// Each request carries at most one PDF and must stay under Vercel's 4.5 MB body limit.
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024
export const MAX_PAYSLIP_FILES = 26 // a year of fortnightly payslips
export const MAX_AVAC_FILES = 60 // a year of weekly AVACs, with slack
/** Parallel /api/parse requests per browser: a browser's per-host connection budget, and at most ~6 × 0.2 s
 *  of backend work in flight per user. 86 files (a year) finish in ~15 s on a home connection. */
export const PARSE_CONCURRENCY = 6

export type UploadKind = 'payslip' | 'avac'

export interface ParsedUpload {
  kind: UploadKind
  name: string
  data: unknown
}

export type ClassifiedUpload = ParsedUpload | { kind: 'unknown'; name: string }

interface StartAnalyzeJobParams {
  payslips: ParsedUpload[]
  avacs: ParsedUpload[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReconcileStatus(value: unknown): value is ReconcileResponse['status'] {
  return value === 'ok' || value === 'correction_payslip'
}

export function validateCounts(payslips: number, avacs: number): JobError | null {
  if (payslips === 0) return { field: 'payslips', message: 'At least one payslip is required' }
  if (payslips > MAX_PAYSLIP_FILES) return { field: 'payslips', message: `Maximum ${MAX_PAYSLIP_FILES} payslips allowed` }
  if (avacs === 0) return { field: 'avacs', message: 'At least one AVAC form is required' }
  if (avacs > MAX_AVAC_FILES) return { field: 'avacs', message: `Maximum ${MAX_AVAC_FILES} AVAC forms allowed` }
  return null
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error
  }
  if (isRecord(payload) && typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }
  return fallback
}

function parseJsonSafely(text: string): unknown {
  if (!text || text.trim().length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

export function normalizeAnalysisJson(data: unknown): AnalysisJson | null {
  if (!isRecord(data)) return null
  if (!isReconcileStatus(data.status)) return null
  if (typeof data.employee !== 'string') return null
  if (typeof data.pay_date !== 'string') return null
  if (typeof data.adjustment_total !== 'number') return null
  if (!Array.isArray(data.avac_results)) return null
  return data as unknown as AnalysisJson
}

export function getOverallStatusMeta(status: string): OverallStatusMeta {
  switch (status) {
    case 'ALL_MATCH':
      return {
        label: 'All match',
        className: 'bg-emerald-50 text-emerald-700',
      }
    case 'DISCREPANCIES_FOUND':
      return {
        label: 'Discrepancies found',
        className: 'bg-red-50 text-red-700',
      }
    case 'OK_WITH_ANOMALIES':
      return {
        label: 'OK with anomalies',
        className: 'bg-amber-50 text-amber-700',
      }
    case 'CORRECTION_PAYSLIP':
      return {
        label: 'Correction payslip',
        className: 'bg-slate-100 text-slate-700',
      }
    default:
      return {
        label: status || 'Unknown',
        className: 'bg-slate-100 text-slate-700',
      }
  }
}

async function postAndParse(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw { message: 'Failed to reach the analysis service. Please try again later.' } satisfies JobError
  }
  const payload = parseJsonSafely(await response.text())
  if (!response.ok) {
    throw { message: getErrorMessage(payload, 'Failed to analyze documents.') } satisfies JobError
  }
  return payload
}

const invalidResponse = (): JobError => ({ message: 'Backend returned an invalid response format.' })

/** Phase 1 for one file: the backend classifies it (kind=auto) and, for a payslip or AVAC, parses it. */
export async function parseUpload(file: File): Promise<ClassifiedUpload> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', 'auto')
  const payload = await postAndParse('/api/parse', { method: 'POST', body: formData })
  if (!isRecord(payload)) throw invalidResponse()
  if (payload.kind === 'unknown') return { kind: 'unknown', name: file.name }
  if ((payload.kind !== 'payslip' && payload.kind !== 'avac') || !isRecord(payload.data)) throw invalidResponse()
  return { kind: payload.kind, name: file.name, data: payload.data }
}

let activeParses = 0
const parseWaiters: Array<() => void> = []

/** Runs fn once fewer than PARSE_CONCURRENCY parses are in flight; waiters run first come, first served. */
export async function withParseSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeParses >= PARSE_CONCURRENCY) await new Promise<void>((resolve) => parseWaiters.push(resolve))
  activeParses += 1
  try {
    return await fn()
  } finally {
    activeParses -= 1
    parseWaiters.shift()?.()
  }
}

/** SHA-256 hex of the bytes, so a re-upload of the same PDF under another name can be skipped. */
export async function fileDigest(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Phase 2: every parsed payslip and AVAC in one JSON call, so fatigue breaks and page-1 payments are seen
// across the whole year. Phase 1 (parseUpload) already ran per file as it was dropped.
export async function startAnalyzeJob(params: StartAnalyzeJobParams): Promise<AnalysisJson> {
  const validationError = validateCounts(params.payslips.length, params.avacs.length)
  if (validationError) throw validationError

  const payload = await postAndParse('/api/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payslips: params.payslips.map((p) => p.data),
      avacs: params.avacs.map((a) => ({ name: a.name, data: a.data })),
    }),
  })
  const normalized = normalizeAnalysisJson(payload)
  if (!normalized) throw invalidResponse()
  if (normalized.status === 'correction_payslip') return normalized

  // The backend answers in the order it was sent; positions, not names, keep duplicate file names distinct.
  if (normalized.avac_results.length !== params.avacs.length) {
    throw {
      message: `The analysis service returned ${normalized.avac_results.length} AVAC results for ${params.avacs.length} files. Please try again.`,
    } satisfies JobError
  }
  return normalized
}
