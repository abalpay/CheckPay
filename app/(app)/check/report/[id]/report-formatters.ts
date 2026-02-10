import type { LineItem } from '@/lib/jobs'

export const PAYROLL_ACTION_STATUSES = new Set([
  'UNDERPAID',
  'MISSING',
  'OVERPAID',
  'UNMATCHED',
])

export const ISSUE_FOLLOW_UP_STATUSES = new Set([
  'ISSUE_WITHIN_WINDOW',
  'POSSIBLY_MISSED',
])

export const PENDING_CHECK_STATUSES = new Set([
  'CHECK_PREVIOUS',
  'CHECK_FUTURE',
  'NOT_YET_PAID',
  'FUTURE_PAY_PERIOD',
])

export const NEEDS_FOLLOW_UP_NOW_STATUSES = new Set([
  ...PAYROLL_ACTION_STATUSES,
  ...ISSUE_FOLLOW_UP_STATUSES,
])

export const TIMING_CHECK_STATUSES = new Set([
  ...PENDING_CHECK_STATUSES,
])

export const FOLLOW_UP_ROW_STATUSES = new Set([
  ...PAYROLL_ACTION_STATUSES,
  ...ISSUE_FOLLOW_UP_STATUSES,
  'REVERSAL',
])

export const FOLLOW_UP_STATUSES = new Set([
  ...FOLLOW_UP_ROW_STATUSES,
  ...PENDING_CHECK_STATUSES,
])

export const ACTIONABLE_STATUSES = new Set([
  ...FOLLOW_UP_ROW_STATUSES,
  ...PENDING_CHECK_STATUSES,
])

export function isTimingCheckStatus(status: string): boolean {
  return TIMING_CHECK_STATUSES.has(status)
}

export function isNeedsFollowUpNowStatus(status: string): boolean {
  return NEEDS_FOLLOW_UP_NOW_STATUSES.has(status)
}

const STATUS_LABELS = new Map<string, string>([
  ['UNDERPAID', 'Underpaid'],
  ['MISSING', 'Missing from payslip'],
  ['OVERPAID', 'Potential overpayment'],
  ['UNMATCHED', 'Needs review'],
  ['ISSUE_WITHIN_WINDOW', 'Issue'],
  ['POSSIBLY_MISSED', 'Issue'],
  ['CHECK_PREVIOUS', 'Check previous'],
  ['CHECK_FUTURE', 'Check future'],
  ['FUTURE_PAY_PERIOD', 'Check future'],
  ['NOT_YET_PAID', 'Check future'],
  ['OK', 'OK'],
  ['ANOMALY', 'Anomaly'],
  ['MATCH', 'Matched'],
  ['REVERSAL', 'Reversal'],
  ['THRESHOLD_SPLIT', 'Threshold split'],
  ['THRESHOLD_EXCESS', 'Threshold excess'],
  ['INFO', 'Info'],
  ['ALL_MATCH', 'OK'],
  ['DISCREPANCIES_FOUND', 'Issue'],
  ['OK_WITH_ANOMALIES', 'Issue'],
  ['FOLLOW_UP_REQUIRED', 'Follow-up'],
  ['CORRECTION_PAYSLIP', 'Correction payslip'],
])

const DAY_TYPE_LABELS = new Map<string, string>([
  ['weekday', 'Weekday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
  ['public_holiday', 'Public holiday'],
])

const PAY_TYPE_LABELS = new Map<string, string>([
  ['Overtime_-_1.5', 'Overtime (1.5x)'],
  ['Overtime_-_2.0', 'Overtime (2.0x)'],
  ['Overtime_-_2.5', 'Overtime (2.5x)'],
  ['Recall_-', 'Recall (1.5x)'],
  ['Recall_-_T2.0', 'Recall (2.0x)'],
  ['Recall_-_T2.5', 'Recall (2.5x)'],
  ['Recall_Offsite_1.5', 'Recall offsite (1.5x)'],
  ['Recall_Offsite_2.0', 'Recall offsite (2.0x)'],
  ['Recall_Offsite_2.5', 'Recall offsite (2.5x)'],
  ['Recall_Guaranteed_Hrs_2.0', 'Recall guaranteed hours (2.0x)'],
  ['Recall_NET_Total', 'Recall net total'],
  ['Fatigue_Penalty_@1.0', 'Fatigue penalty (1.0x)'],
  ['Fatigue_Penalty_@1.5', 'Fatigue penalty (1.5x)'],
  ['Fatigue_Penalty_@2.0', 'Fatigue penalty (2.0x)'],
  ['Fatigue_Leave', 'Fatigue leave'],
  ['Public_Holiday_-_50%', 'Public holiday loading (50%)'],
  ['Public_Holiday_-_150%', 'Public holiday loading (150%)'],
  ['Shift_-_Sat_Loading_-_50%', 'Saturday shift loading (50%)'],
  ['Shift-Sunday_Loading-100%', 'Sunday shift loading (100%)'],
  ['OCA_-_RMO_-_Level_4_to_13', 'On-call allowance (RMO Level 4-13)'],
  ['Stand_Down_Leave', 'Stand down leave'],
  ['Fortnightly_Salary', 'Fortnightly salary'],
])

const UPPERCASE_TOKENS = new Set(['OT', 'AVAC', 'QH', 'RMO', 'OCA'])

export function toSafeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function formatCurrency(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatSignedCurrency(value: number | undefined): string {
  const numberValue = toSafeNumber(value)
  const sign = numberValue > 0 ? '+' : numberValue < 0 ? '-' : ''
  return `${sign}${formatCurrency(Math.abs(numberValue))}`
}

export function formatReportDate(value: string): string {
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

function toTitleCaseToken(token: string): string {
  if (!token) return token

  const upper = token.toUpperCase()
  if (UPPERCASE_TOKENS.has(upper)) return upper

  // Keep tokens like "2.0x" and percentages as-is.
  const numericX = token.toLowerCase().endsWith('x')
    && Number.isFinite(Number(token.slice(0, -1)))
  const percentage = token.endsWith('%')
    && Number.isFinite(Number(token.slice(0, -1)))
  if (numericX || percentage) {
    return token.toLowerCase()
  }

  // Preserve existing all-caps acronyms.
  const allUpper = token.length >= 2 && [...token].every((char) => char >= 'A' && char <= 'Z')
  if (allUpper) {
    return token
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

function humanizeWithFallback(value: string): string {
  const normalized = value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()

  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return '—'

  return tokens
    .map((token) => {
      let next = token
      if (next.startsWith('@')) {
        const numericPart = next.slice(1)
        if (Number.isFinite(Number(numericPart))) {
          next = `${numericPart}x`
        }
      }

      if (next.length > 1 && (next.startsWith('T') || next.startsWith('t'))) {
        const numericPart = next.slice(1)
        if (Number.isFinite(Number(numericPart))) {
          next = `${numericPart}x`
        }
      }

      return toTitleCaseToken(next)
    })
    .join(' ')
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS.get(status) ?? humanizeWithFallback(status)
}

export function formatDayTypeLabel(dayType: string): string {
  return DAY_TYPE_LABELS.get(dayType) ?? humanizeWithFallback(dayType)
}

export function formatPayTypeLabel(payType: string): string {
  if (!payType) return '—'
  return PAY_TYPE_LABELS.get(payType) ?? humanizeWithFallback(payType)
}

export function getLineStatusClass(status: string): string {
  switch (status) {
    case 'UNDERPAID':
    case 'MISSING':
    case 'ISSUE_WITHIN_WINDOW':
    case 'POSSIBLY_MISSED':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'OVERPAID':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'UNMATCHED':
      return 'border-slate-200 bg-slate-100 text-slate-700'
    case 'CHECK_PREVIOUS':
    case 'CHECK_FUTURE':
    case 'NOT_YET_PAID':
    case 'FUTURE_PAY_PERIOD':
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

export function getDayStatusClass(status: string): string {
  switch (status) {
    case 'UNDERPAID':
    case 'MISSING':
    case 'ISSUE_WITHIN_WINDOW':
    case 'POSSIBLY_MISSED':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'OVERPAID':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'ANOMALY':
    case 'UNMATCHED':
    case 'REVERSAL':
      return 'border-slate-200 bg-slate-100 text-slate-700'
    case 'CHECK_PREVIOUS':
    case 'CHECK_FUTURE':
    case 'NOT_YET_PAID':
    case 'FUTURE_PAY_PERIOD':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'OK':
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
}

export function getDayStatusHint(status: string): { icon: string; label: string } | null {
  switch (status) {
    case 'CHECK_FUTURE':
    case 'NOT_YET_PAID':
    case 'FUTURE_PAY_PERIOD':
      return { icon: '⏭️', label: 'Check future payslip' }
    case 'ISSUE_WITHIN_WINDOW':
    case 'POSSIBLY_MISSED':
      return { icon: '⚠️', label: 'Issue - follow up with payroll' }
    case 'CHECK_PREVIOUS':
      return { icon: '🔍', label: 'Check previous payslip' }
    default:
      return null
  }
}

const BENIGN_DAY_ITEM_STATUSES = new Set(['OK', 'MATCH', 'INFO'])
const DAY_STATUS_PRIORITY = [
  'UNDERPAID',
  'MISSING',
  'OVERPAID',
  'UNMATCHED',
  'ISSUE_WITHIN_WINDOW',
  'POSSIBLY_MISSED',
  'CHECK_PREVIOUS',
  'CHECK_FUTURE',
  'FUTURE_PAY_PERIOD',
  'NOT_YET_PAID',
  'REVERSAL',
  'ANOMALY',
]

const DAY_STATUS_PRIORITY_INDEX = new Map(
  DAY_STATUS_PRIORITY.map((status, index) => [status, index])
)

export function getEffectiveDayStatus(params: {
  dayStatus: string
  dayDifference?: number
  itemStatuses?: string[]
  supplementalStatuses?: string[]
}): string {
  const {
    dayStatus,
    dayDifference,
    itemStatuses = [],
    supplementalStatuses = [],
  } = params

  if (dayStatus && dayStatus !== 'OK') {
    return dayStatus
  }

  const combinedStatuses = [...itemStatuses, ...supplementalStatuses]
    .map((status) => status?.trim())
    .filter((status): status is string => Boolean(status))

  let prioritizedStatus: string | null = null
  let bestPriority = Number.POSITIVE_INFINITY
  for (const status of combinedStatuses) {
    const priority = DAY_STATUS_PRIORITY_INDEX.get(status)
    if (priority !== undefined && priority < bestPriority) {
      bestPriority = priority
      prioritizedStatus = status
    }
  }

  if (prioritizedStatus) {
    return prioritizedStatus
  }

  const hasUnexpectedItemStatus = combinedStatuses.some(
    (status) => !BENIGN_DAY_ITEM_STATUSES.has(status)
  )
  if (hasUnexpectedItemStatus) {
    return 'ANOMALY'
  }

  if (Math.abs(toSafeNumber(dayDifference)) > 0.01) {
    return 'ANOMALY'
  }

  return 'OK'
}

export function getActionPriority(status: string): number {
  switch (status) {
    case 'UNDERPAID':
    case 'MISSING':
      return 0
    case 'OVERPAID':
      return 1
    case 'UNMATCHED':
      return 2
    case 'ISSUE_WITHIN_WINDOW':
    case 'POSSIBLY_MISSED':
      return 4
    case 'CHECK_PREVIOUS':
      return 5
    case 'CHECK_FUTURE':
    case 'NOT_YET_PAID':
    case 'FUTURE_PAY_PERIOD':
      return 6
    default:
      return 3
  }
}

export function getRecommendedAction(item: LineItem): string {
  switch (item.status) {
    case 'UNDERPAID':
    case 'MISSING':
      return 'Raise a payroll query with matching AVAC evidence.'
    case 'OVERPAID':
      return 'Confirm reversal or clawback handling with payroll.'
    case 'UNMATCHED':
      return 'Verify date and pay type against AVAC and payslip.'
    case 'ISSUE_WITHIN_WINDOW':
    case 'POSSIBLY_MISSED':
      return 'Follow up with payroll for this date.'
    case 'CHECK_PREVIOUS':
      return 'Check the previous payslip for this date.'
    case 'CHECK_FUTURE':
    case 'NOT_YET_PAID':
    case 'FUTURE_PAY_PERIOD':
      return 'Check a future payslip for this date.'
    default:
      return item.notes || 'Review against payroll records before submitting.'
  }
}
