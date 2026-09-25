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
export const MAX_PAYSLIP_FILES = 8
export const MAX_AVAC_FILES = 10

export interface AnalyzeProgressEvent {
  avacName: string
  /** Position of this AVAC in the submitted `avacs` array. */
  index: number
  state: 'done' | 'error'
  /** Present when state is 'error'. */
  message?: string
  completed: number
  total: number
}

interface ParsedUpload {
  kind: 'payslip' | 'avac'
  name: string
  data: unknown
}

interface StartAnalyzeJobParams {
  payslips: File[]
  avacs: File[]
  /** Called once per AVAC as its parse settles, in completion order. */
  onProgress?: (event: AnalyzeProgressEvent) => void
  /** Called each time a payslip finishes parsing, with the running count. */
  onPayslipRead?: (read: number, total: number) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReconcileStatus(value: unknown): value is ReconcileResponse['status'] {
  return value === 'ok' || value === 'correction_payslip'
}

function validatePdfFile(file: File, fieldName: string): JobError | null {
  if (file.type !== 'application/pdf') {
    return {
      field: fieldName,
      message: `${file.name} must be a PDF file`,
    }
  }

  if (file.size > MAX_REQUEST_BYTES) {
    return {
      field: fieldName,
      message: `${file.name} is too large (max 4MB)`,
    }
  }

  return null
}

function validateFiles(payslips: File[], avacs: File[]): JobError | null {
  if (payslips.length === 0) return { field: 'payslips', message: 'At least one payslip is required' }
  if (payslips.length > MAX_PAYSLIP_FILES) {
    return { field: 'payslips', message: `Maximum ${MAX_PAYSLIP_FILES} payslips allowed` }
  }
  if (avacs.length === 0) return { field: 'avacs', message: 'At least one AVAC form is required' }
  if (avacs.length > MAX_AVAC_FILES) return { field: 'avacs', message: `Maximum ${MAX_AVAC_FILES} AVAC forms allowed` }

  for (const [i, file] of payslips.entries()) {
    const error = validatePdfFile(file, `payslip-${i + 1}`)
    if (error) return error
  }
  for (const [i, file] of avacs.entries()) {
    const error = validatePdfFile(file, `avac-${i + 1}`)
    if (error) return error
  }
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

async function parseOne(file: File, kind: ParsedUpload['kind']): Promise<ParsedUpload> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', kind)
  const payload = await postAndParse('/api/parse', { method: 'POST', body: formData })
  if (!isRecord(payload) || payload.kind !== kind || !isRecord(payload.data)) {
    throw { message: 'Backend returned an invalid response format.' } satisfies JobError
  }
  return { kind, name: file.name, data: payload.data }
}

// Phase 1 parses each PDF alone (one PDF per request keeps every request under Vercel's body limit).
// Phase 2 reconciles all parsed JSON in one call, so fatigue breaks and page-1 payments are seen
// across every AVAC and payslip.
export async function startAnalyzeJob(params: StartAnalyzeJobParams): Promise<AnalysisJson> {
  const validationError = validateFiles(params.payslips, params.avacs)
  if (validationError) throw validationError

  const total = params.avacs.length
  let completed = 0
  let payslipsRead = 0
  const report = (avac: File, index: number, state: 'done' | 'error', message?: string) => {
    completed += 1
    try {
      params.onProgress?.({ avacName: avac.name, index, state, message, completed, total })
    } catch {
      // A broken progress listener must never fail the analysis.
    }
  }

  const [payslips, avacOutcomes] = await Promise.all([
    Promise.all(
      params.payslips.map((file) =>
        parseOne(file, 'payslip').then((parsed) => {
          payslipsRead += 1
          try {
            params.onPayslipRead?.(payslipsRead, params.payslips.length)
          } catch {
            // A broken progress listener must never fail the analysis.
          }
          return parsed
        }),
      ),
    ),
    Promise.all(
      params.avacs.map((avac, index) =>
        parseOne(avac, 'avac').then(
          (parsed) => {
            report(avac, index, 'done')
            return { avac, parsed, error: null }
          },
          (error: JobError) => {
            report(avac, index, 'error', error.message)
            return { avac, parsed: null, error }
          },
        ),
      ),
    ),
  ])

  const parsedAvacs = avacOutcomes.flatMap((o) => (o.parsed ? [o.parsed] : []))
  if (parsedAvacs.length === 0) throw avacOutcomes[0].error

  const payload = await postAndParse('/api/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payslips: payslips.map((p) => p.data),
      avacs: parsedAvacs.map((p) => ({ name: p.name, data: p.data })),
    }),
  })
  const normalized = normalizeAnalysisJson(payload)
  if (!normalized) throw { message: 'Backend returned an invalid response format.' } satisfies JobError
  if (normalized.status === 'correction_payslip') return normalized

  // The backend answers in the order it was sent; match by position so duplicate names stay distinct.
  if (normalized.avac_results.length !== parsedAvacs.length) {
    throw {
      message: `The analysis service returned ${normalized.avac_results.length} AVAC results for ${parsedAvacs.length} files. Please try again.`,
    } satisfies JobError
  }
  const results = normalized.avac_results[Symbol.iterator]()
  return {
    ...normalized,
    avac_results: avacOutcomes.map((o) =>
      o.parsed
        ? results.next().value!
        : { avac_name: o.avac.name, error: o.error.message },
    ),
  }
}
