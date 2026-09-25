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
  status: 'OK' | 'OVERPAID' | 'UNDERPAID' | 'ANOMALY' | 'CHECK_PREVIOUS' | 'CHECK_FUTURE' | 'ISSUE_WITHIN_WINDOW' | string
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
  within_window_issue_count?: number
  not_yet_paid_count: number
  possibly_missed_count: number
  earliest_adjustment_date: string
  latest_adjustment_date: string
  total_expected: number
  total_actual: number
  total_difference: number
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

// Each request carries the payslip plus one AVAC and must stay under Vercel's 4.5 MB body limit.
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024

interface StartAnalyzeJobParams {
  payslip: File
  avacs: File[]
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

  for (const [i, avac] of avacs.entries()) {
    const avacError = validatePdfFile(avac, `avac-${i + 1}`)
    if (avacError) return avacError

    if (payslip.size + avac.size > MAX_REQUEST_BYTES) {
      return {
        field: `avac-${i + 1}`,
        message: `${avac.name} is too large to send with this payslip (max 4MB together)`,
      }
    }
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

async function reconcileOne(payslip: File, avac: File): Promise<AnalysisJson> {
  const formData = new FormData()
  formData.append('payslip', payslip)
  formData.append('avacs', avac)

  let response: Response
  try {
    response = await fetch('/api/reconcile', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw {
      message: 'Failed to reach the analysis service. Please try again later.',
    } satisfies JobError
  }

  const payload = parseJsonSafely(await response.text())

  if (!response.ok) {
    throw {
      message: getErrorMessage(payload, 'Failed to analyze documents.'),
    } satisfies JobError
  }

  const normalized = normalizeAnalysisJson(payload)
  if (!normalized) {
    throw {
      message: 'Backend returned an invalid response format.',
    } satisfies JobError
  }

  return normalized
}

// One request per AVAC keeps every request under Vercel's body limit (AVAC PDFs are ~900 KB each).
export async function startAnalyzeJob(params: StartAnalyzeJobParams): Promise<AnalysisJson> {
  const validationError = validateFiles(params.payslip, params.avacs)
  if (validationError) {
    throw validationError
  }

  const outcomes = await Promise.all(
    params.avacs.map((avac) =>
      reconcileOne(params.payslip, avac).then(
        (result) => ({ avac, result, error: null }),
        (error: JobError) => ({ avac, result: null, error }),
      ),
    ),
  )

  const base = outcomes.find((o) => o.result)?.result
  if (!base) {
    throw outcomes[0].error
  }
  if (base.status === 'correction_payslip') {
    return base
  }

  return {
    ...base,
    avac_results: outcomes.flatMap((o) =>
      o.result ? o.result.avac_results : [{ avac_name: o.avac.name, error: o.error.message }],
    ),
  }
}
