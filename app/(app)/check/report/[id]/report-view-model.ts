import {
  getOverallStatusMeta,
  type AnalysisJson,
  type AvacReport,
  type DayResult,
  type LineItem,
} from '@/lib/jobs'
import {
  ACTIONABLE_STATUSES,
  FOLLOW_UP_ROW_STATUSES,
  ISSUE_FOLLOW_UP_STATUSES,
  PAYROLL_ACTION_STATUSES,
  PENDING_CHECK_STATUSES,
  formatPayTypeLabel,
  formatReportDate,
  formatStatusLabel,
  getActionPriority,
  getEffectiveDayStatus,
  getRecommendedAction,
  isNeedsFollowUpNowStatus,
  isTimingCheckStatus,
  toSafeNumber,
} from './report-formatters'

export interface ActionableRow extends LineItem {
  avacName: string
  issueLabel: string
  recommendedAction: string
  displayPayType: string
  category: 'needs_follow_up_now' | 'timing_check' | 'review'
}

export interface AvacDetailSummary {
  id: string
  avacName: string
  report?: AvacReport
  error?: string
  statusKey: 'ALL_MATCH' | 'DISCREPANCIES_FOUND' | 'FOLLOW_UP_REQUIRED' | 'PARSE_ERROR' | 'NO_REPORT'
  statusLabel: string
  statusClassName: string
  subtitle: string
  actionItemCount: number
  followUpCount: number
  pendingCheckCount: number
  issueDays: DayResult[]
  cleanDays: DayResult[]
  actionableStatusesByDate: Record<string, string[]>
}

export interface TotalsAcrossAvacs {
  totalExpected: number
  totalActual: number
  totalDifference: number
  inScopeExpected: number
  inScopeActual: number
  inScopeDifference: number
  inScopeDays: number
  timingExpected: number
  timingActual: number
  timingDifference: number
  timingDays: number
  matchCount: number
  discrepancyCount: number
  missingCount: number
  unmatchedCount: number
  notYetPaidCount: number
  daysVerified: number
  daysWithIssues: number
  totalLineItems: number
  earliestAdjustmentDate: string
  latestAdjustmentDate: string
}

export interface PayrollContextModel {
  parsedAvacs: string
  notYetPaidCount: number
  checkPreviousCount: number
  checkFutureCount: number
  withinWindowIssueCount: number
  earliestAdjustmentDate: string
  latestAdjustmentDate: string
  payPeriodStart?: string
  payPeriodEnd?: string
  adjustmentTotal: number
  baseRate?: number
  olderAdjustmentsTotal: number
}

export interface ReportViewModel {
  decisionState: 'ACTION_NOW' | 'CHECK_ADJACENT_PAYSLIP' | 'NO_ACTION' | 'INCOMPLETE_REVIEW'
  decisionHeadline: string
  decisionDetail: string
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  confidenceDetail: string
  hasTimingChecks: boolean
  needsFollowUpNowCount: number
  likelyOtherPayslipCount: number
  likelyMissedThisPayslipCount: number
  topParsedAvacsLabel: string
  topParseErrorCount: number
  needsFollowUpNowRows: ActionableRow[]
  timingCheckRows: ActionableRow[]
  topLevelMeta: { label: string; className: string } | null
  snapshotHeadline: string
  snapshotDetail: string
  actionableRows: ActionableRow[]
  followUpRows: ActionableRow[]
  parseErrorResults: Array<{ avac_name: string; error: string }>
  parseErrorCount: number
  actionableCount: number
  payrollActionCount: number
  pendingCheckCount: number
  underpaidMissingCount: number
  potentialOverpaidCount: number
  nextSteps: string[]
  totalsAcrossAvacs: TotalsAcrossAvacs
  inScopeTotals: {
    expected: number
    actual: number
    difference: number
    days: number
  }
  timingTotals: {
    expected: number
    actual: number
    difference: number
    days: number
  }
  actionableNetDifference: number
  actionableGrossDifference: number
  payrollContext: PayrollContextModel
  avacSummaries: AvacDetailSummary[]
}

export interface PrintSummarySection {
  id: 'needs_follow_up_now' | 'timing_check'
  title: string
  subtitle: string
  rows: ActionableRow[]
  emptyMessage: string
}

export interface PrintSummaryMetric {
  key: 'needs_now' | 'timing_checks' | 'likely_missed' | 'parse_errors'
  label: string
  value: number
}

export interface PrintSummaryCoverageItem {
  label: string
  value: string
}

export interface PrintSummaryModel {
  header: {
    reportId: string
    employee: string
    payDate: string
    generatedAt: string
  }
  snapshot: {
    headline: string
    detail: string
    statusLabel: string
    confidenceLabel: string
    confidenceDetail: string
  }
  metrics: PrintSummaryMetric[]
  sections: PrintSummarySection[]
  nextSteps: string[]
  coverage: PrintSummaryCoverageItem[]
  caveats: string[]
  correctionSummary?: {
    message: string
    overpaymentAmount?: number
  }
}

type DaySignal = 'ok' | 'issue' | 'follow_up'

type SummaryStatusKey = 'ALL_MATCH' | 'DISCREPANCIES_FOUND' | 'FOLLOW_UP_REQUIRED'
type DecisionState = ReportViewModel['decisionState']
type ConfidenceLevel = ReportViewModel['confidenceLevel']

const ISSUE_STATUSES = new Set([
  ...PAYROLL_ACTION_STATUSES,
  ...ISSUE_FOLLOW_UP_STATUSES,
  'ANOMALY',
])
const NON_FINANCIAL_FOLLOW_UP_STATUSES = new Set([
  'REVERSAL',
  ...PENDING_CHECK_STATUSES,
])

function deriveOverallStatus(params: {
  actionableStatuses: string[]
  daySignals: DaySignal[]
}): SummaryStatusKey {
  const { actionableStatuses, daySignals } = params

  const hasIssueAction = actionableStatuses.some((status) => ISSUE_STATUSES.has(status))
  const hasIssueDay = daySignals.some((signal) => signal === 'issue')

  if (hasIssueAction || hasIssueDay) {
    return 'DISCREPANCIES_FOUND'
  }

  const hasFollowUpAction = actionableStatuses.some((status) => NON_FINANCIAL_FOLLOW_UP_STATUSES.has(status))
  const hasFollowUpDay = daySignals.some((signal) => signal === 'follow_up')

  if (hasFollowUpAction || hasFollowUpDay) {
    return 'FOLLOW_UP_REQUIRED'
  }

  return 'ALL_MATCH'
}

function getDisplayStatusMeta(status: string): { label: string; className: string } {
  if (status === 'FOLLOW_UP_REQUIRED') {
    return {
      label: 'Follow-up',
      className: 'bg-amber-50 text-amber-700',
    }
  }

  const base = getOverallStatusMeta(status)

  if (status === 'ALL_MATCH') {
    return {
      ...base,
      label: 'OK',
    }
  }

  if (status === 'DISCREPANCIES_FOUND' || status === 'OK_WITH_ANOMALIES') {
    return {
      ...base,
      label: 'Issue',
    }
  }

  return base
}

const printDateTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const printCurrencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
})

function formatPrintDateTime(value: string | null): string {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return printDateTimeFormatter.format(parsed)
}

function formatPrintCurrency(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }
  return printCurrencyFormatter.format(value)
}

function formatAdjustmentWindow(earliest: string, latest: string): string {
  if (!earliest || !latest) return '—'
  return `${formatReportDate(earliest)} – ${formatReportDate(latest)}`
}

function formatPayPeriod(start?: string, end?: string): string {
  if (!start || !end) return '—'
  return `${formatReportDate(start)} – ${formatReportDate(end)}`
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function getLineItemKey(item: LineItem): string {
  return [
    item.date,
    item.pay_type,
    item.status,
    item.expected_units,
    item.actual_units,
    item.expected_amount,
    item.actual_amount,
    item.difference,
  ].join('|')
}

export function getMergedActionableItems(report: AvacReport): LineItem[] {
  const merged = new Map<string, LineItem>()

  for (const item of report.actionable_items) {
    merged.set(getLineItemKey(item), item)
  }

  for (const day of report.days) {
    for (const item of day.items) {
      if (!ACTIONABLE_STATUSES.has(item.status)) continue
      merged.set(getLineItemKey(item), item)
    }
  }

  return [...merged.values()]
}

function buildActionableStatusesByDate(items: LineItem[]): Record<string, string[]> {
  const byDate = new Map<string, Set<string>>()

  for (const item of items) {
    if (!item.date) continue

    const current = byDate.get(item.date) ?? new Set<string>()
    current.add(item.status)
    byDate.set(item.date, current)
  }

  const output: Record<string, string[]> = {}
  for (const [date, statuses] of byDate) {
    output[date] = [...statuses]
  }

  return output
}

function getDayDisplayStatus(
  day: DayResult,
  actionableStatusesByDate: Record<string, string[]>
): string {
  return getEffectiveDayStatus({
    dayStatus: day.status,
    dayDifference: day.difference,
    itemStatuses: day.items.map((item) => item.status),
    supplementalStatuses: actionableStatusesByDate[day.date] ?? [],
  })
}

function getDaySignal(params: {
  day: DayResult
  displayStatus: string
  supplementalStatuses: string[]
}): DaySignal {
  const { day, displayStatus, supplementalStatuses } = params
  const combinedStatuses = [displayStatus, ...day.items.map((item) => item.status), ...supplementalStatuses]
    .map((status) => status?.trim())
    .filter((status): status is string => Boolean(status))

  const hasExplicitIssueStatus = combinedStatuses.some(
    (status) => ISSUE_STATUSES.has(status) && status !== 'ANOMALY'
  )
  if (hasExplicitIssueStatus) {
    return 'issue'
  }

  const hasNonFinancialFollowUp = combinedStatuses.some((status) =>
    NON_FINANCIAL_FOLLOW_UP_STATUSES.has(status)
  )
  if (hasNonFinancialFollowUp) {
    return 'follow_up'
  }

  if (displayStatus === 'ANOMALY' || combinedStatuses.includes('ANOMALY')) {
    return 'issue'
  }

  if (displayStatus && displayStatus !== 'OK') {
    return 'issue'
  }

  return 'ok'
}

function categorizeStatus(status: string): ActionableRow['category'] {
  if (isNeedsFollowUpNowStatus(status)) return 'needs_follow_up_now'
  if (isTimingCheckStatus(status)) return 'timing_check'
  return 'review'
}

function mapActionableRow(item: LineItem, avacName: string): ActionableRow {
  return {
    ...item,
    avacName,
    issueLabel: formatStatusLabel(item.status),
    recommendedAction: getRecommendedAction(item),
    displayPayType: formatPayTypeLabel(item.pay_type),
    category: categorizeStatus(item.status),
  }
}

function sortActionableRows(rows: ActionableRow[]): ActionableRow[] {
  return [...rows].sort((a, b) => {
    const priorityDiff = getActionPriority(a.status) - getActionPriority(b.status)
    if (priorityDiff !== 0) return priorityDiff

    const magnitudeDiff = Math.abs(toSafeNumber(b.difference)) - Math.abs(toSafeNumber(a.difference))
    if (magnitudeDiff !== 0) return magnitudeDiff

    return `${a.date}-${a.pay_type}`.localeCompare(`${b.date}-${b.pay_type}`)
  })
}

function buildTotalsAcrossAvacs(reports: AvacReport[]): TotalsAcrossAvacs {
  return reports.reduce<TotalsAcrossAvacs>(
    (acc, report) => {
      const actionableStatusesByDate = buildActionableStatusesByDate(
        getMergedActionableItems(report)
      )

      acc.totalExpected += toSafeNumber(report.total_expected)
      acc.totalActual += toSafeNumber(report.total_actual)
      acc.totalDifference += toSafeNumber(report.total_difference)
      acc.matchCount += report.match_count
      acc.discrepancyCount += report.discrepancy_count
      acc.missingCount += report.missing_count
      acc.unmatchedCount += report.unmatched_count
      acc.notYetPaidCount += report.not_yet_paid_count ?? 0

      for (const day of report.days) {
        const displayStatus = getDayDisplayStatus(day, actionableStatusesByDate)
        const daySignal = getDaySignal({
          day,
          displayStatus,
          supplementalStatuses: actionableStatusesByDate[day.date] ?? [],
        })

        if (daySignal === 'issue') {
          acc.daysWithIssues += 1
        } else {
          acc.daysVerified += 1
        }

        if (isTimingCheckStatus(displayStatus)) {
          acc.timingExpected += toSafeNumber(day.expected_total)
          acc.timingActual += toSafeNumber(day.actual_total)
          acc.timingDifference += toSafeNumber(day.difference)
          acc.timingDays += 1
        } else {
          acc.inScopeExpected += toSafeNumber(day.expected_total)
          acc.inScopeActual += toSafeNumber(day.actual_total)
          acc.inScopeDifference += toSafeNumber(day.difference)
          acc.inScopeDays += 1
        }

        acc.totalLineItems += day.items.length
      }

      const earliest = report.earliest_adjustment_date
      const latest = report.latest_adjustment_date
      if (earliest && (!acc.earliestAdjustmentDate || earliest < acc.earliestAdjustmentDate)) {
        acc.earliestAdjustmentDate = earliest
      }
      if (latest && (!acc.latestAdjustmentDate || latest > acc.latestAdjustmentDate)) {
        acc.latestAdjustmentDate = latest
      }

      return acc
    },
    {
      totalExpected: 0,
      totalActual: 0,
      totalDifference: 0,
      inScopeExpected: 0,
      inScopeActual: 0,
      inScopeDifference: 0,
      inScopeDays: 0,
      timingExpected: 0,
      timingActual: 0,
      timingDifference: 0,
      timingDays: 0,
      matchCount: 0,
      discrepancyCount: 0,
      missingCount: 0,
      unmatchedCount: 0,
      notYetPaidCount: 0,
      daysVerified: 0,
      daysWithIssues: 0,
      totalLineItems: 0,
      earliestAdjustmentDate: '',
      latestAdjustmentDate: '',
    }
  )
}

function deriveDecisionState(params: {
  needsFollowUpNowCount: number
  timingCheckCount: number
  parseErrorCount: number
  successfulAvacCount: number
}): DecisionState {
  const { needsFollowUpNowCount, timingCheckCount, parseErrorCount, successfulAvacCount } = params

  if (parseErrorCount > 0 && successfulAvacCount === 0) {
    return 'INCOMPLETE_REVIEW'
  }
  if (needsFollowUpNowCount > 0) {
    return 'ACTION_NOW'
  }
  if (timingCheckCount > 0) {
    return 'CHECK_ADJACENT_PAYSLIP'
  }
  return 'NO_ACTION'
}

function deriveConfidence(params: {
  parseErrorCount: number
  timingCheckCount: number
}): ConfidenceLevel {
  const { parseErrorCount, timingCheckCount } = params
  if (parseErrorCount > 0) return 'LOW'
  if (timingCheckCount > 0) return 'MEDIUM'
  return 'HIGH'
}

function buildDecisionCopy(params: {
  analysis: AnalysisJson
  decisionState: DecisionState
  confidenceLevel: ConfidenceLevel
  needsFollowUpNowCount: number
  timingCheckCount: number
  parseErrorCount: number
}): {
  headline: string
  detail: string
  confidenceDetail: string
} {
  const {
    analysis,
    decisionState,
    confidenceLevel,
    needsFollowUpNowCount,
    timingCheckCount,
    parseErrorCount,
  } = params

  if (analysis.status === 'correction_payslip') {
    return {
      headline: 'This appears to be a correction-only payslip.',
      detail:
        'Use this report for record-keeping and check the next standard payslip for AVAC-linked entries.',
      confidenceDetail: 'Confidence: medium. Correction payslips can include reversal-only entries.',
    }
  }

  const confidenceDetail =
    confidenceLevel === 'LOW'
      ? `Confidence: low. ${parseErrorCount} AVAC file${parseErrorCount === 1 ? '' : 's'} could not be parsed.`
      : confidenceLevel === 'MEDIUM'
        ? 'Confidence: medium. Some claims are timing checks and may appear on adjacent payslips.'
        : 'Confidence: high. Parsed AVAC coverage and timing checks indicate this is likely complete.'

  if (decisionState === 'INCOMPLETE_REVIEW') {
    return {
      headline: 'Review incomplete. No AVAC files parsed successfully.',
      detail: 'Re-upload AVAC files before deciding whether to contact payroll.',
      confidenceDetail,
    }
  }

  if (decisionState === 'ACTION_NOW') {
    return {
      headline: `Action needed now for ${needsFollowUpNowCount} item${needsFollowUpNowCount === 1 ? '' : 's'}.`,
      detail: 'Review the follow-up items below and use the query draft when contacting payroll.',
      confidenceDetail,
    }
  }

  if (decisionState === 'CHECK_ADJACENT_PAYSLIP') {
    return {
      headline: `No immediate mismatch found. ${timingCheckCount} item${timingCheckCount === 1 ? '' : 's'} likely sit on previous or future payslips.`,
      detail: 'Check adjacent payslips before raising a payroll query.',
      confidenceDetail,
    }
  }

  return {
    headline: 'No follow-up needed from this report.',
    detail: 'Store this report with your payslip and AVAC records.',
    confidenceDetail,
  }
}

function getDecisionMeta(decisionState: DecisionState): { label: string; className: string } {
  if (decisionState === 'ACTION_NOW') {
    return { label: 'Action now', className: 'bg-red-50 text-red-700' }
  }
  if (decisionState === 'CHECK_ADJACENT_PAYSLIP') {
    return { label: 'Recheck payslip', className: 'bg-amber-50 text-amber-700' }
  }
  if (decisionState === 'INCOMPLETE_REVIEW') {
    return { label: 'Incomplete', className: 'bg-red-50 text-red-700' }
  }
  return { label: 'No action', className: 'bg-emerald-50 text-emerald-700' }
}

function buildNextSteps(params: {
  analysis: AnalysisJson
  financialActionableCount: number
  followUpCount: number
  parseErrorCount: number
  underpaidMissingCount: number
  potentialOverpaidCount: number
  unmatchedCount: number
  pendingCheckCount: number
  checkPreviousCount: number
  futureCheckCount: number
}): string[] {
  const {
    analysis,
    financialActionableCount,
    followUpCount,
    parseErrorCount,
    underpaidMissingCount,
    potentialOverpaidCount,
    unmatchedCount,
    pendingCheckCount,
    checkPreviousCount,
    futureCheckCount,
  } = params

  const steps: string[] = []

  if (analysis.status === 'correction_payslip') {
    steps.push('Treat this as a correction-only payslip for this pay period.')
    steps.push('Keep this report with the payslip for your records.')
    steps.push('Check the next standard payslip for AVAC-linked entries.')
    return steps
  }

  if (pendingCheckCount > 0) {
    if (checkPreviousCount > 0 && futureCheckCount > 0) {
      steps.push('Some AVAC dates may sit on previous or future payslips. Check both adjacent payslips.')
    } else if (checkPreviousCount > 0) {
      steps.push('Some AVAC dates likely belong to a previous payslip. Check the prior payslip first.')
    } else {
      steps.push('Some AVAC dates likely belong to a future payslip. Check the next payslip first.')
    }
  }

  if (financialActionableCount === 0 && followUpCount === 0 && parseErrorCount === 0 && pendingCheckCount === 0) {
    steps.push('No discrepancy needs payroll follow-up for the parsed AVAC files.')
    steps.push('Store this report with your payslip and AVAC forms.')
    steps.push('Re-run reconciliation if you add more AVAC files later.')
    return steps
  }

  if (underpaidMissingCount > 0) {
    steps.push(
      `Review ${underpaidMissingCount} underpaid or missing line item(s), then prepare a payroll query with AVAC evidence.`
    )
  }

  if (potentialOverpaidCount > 0 || unmatchedCount > 0) {
    const reviewCount = potentialOverpaidCount + unmatchedCount
    steps.push(
      `Confirm ${reviewCount} potential overpaid or needs-review line item(s) before lodging, to reduce avoidable back-and-forth.`
    )
  }

  if (followUpCount > 0) {
    steps.push(`Review ${followUpCount} follow-up item(s), including any reversal entries.`)
  }

  if (parseErrorCount > 0) {
    steps.push(`Re-upload ${parseErrorCount} AVAC file(s) that failed parsing so no shift is missed.`)
  }

  steps.push('Use Print summary and attach this report, payslip, and AVAC PDFs to your payroll request.')

  return steps.slice(0, 4)
}

function buildAvacSubtitle(summary: {
  followUpCount: number
  pendingCheckCount: number
  issueDays: number
}): string {
  const parts: string[] = []

  if (summary.followUpCount > 0) {
    parts.push(formatCount(summary.followUpCount, 'follow-up item', 'follow-up items'))
  }

  if (summary.pendingCheckCount > 0) {
    parts.push(formatCount(summary.pendingCheckCount, 'pending check', 'pending checks'))
  }

  if (parts.length > 0) {
    return parts.join(' · ')
  }

  if (summary.issueDays > 0) {
    return `${formatCount(summary.issueDays, 'issue day', 'issue days')} to review`
  }

  return 'No issues found'
}

export function createReportViewModel(analysis: AnalysisJson): ReportViewModel {
  const successfulResults = analysis.avac_results.filter(
    (result): result is { avac_name: string; report: AvacReport } => Boolean(result.report)
  )

  const parseErrorResults = analysis.avac_results.filter(
    (result): result is { avac_name: string; error: string } => Boolean(result.error)
  )

  const allRows = sortActionableRows(
    successfulResults.flatMap((result) => {
      const avacName = result.avac_name || 'Unnamed AVAC'
      return getMergedActionableItems(result.report).map((item) => mapActionableRow(item, avacName))
    })
  )

  const needsFollowUpNowRows = allRows.filter((row) => row.category === 'needs_follow_up_now')
  const timingCheckRows = allRows.filter((row) => row.category === 'timing_check')
  const followUpRows = needsFollowUpNowRows

  const payrollActionCount = allRows.filter((row) => PAYROLL_ACTION_STATUSES.has(row.status)).length

  const underpaidMissingCount = needsFollowUpNowRows.filter(
    (row) => row.status === 'UNDERPAID' || row.status === 'MISSING'
  ).length

  const potentialOverpaidCount = needsFollowUpNowRows.filter((row) => row.status === 'OVERPAID').length
  const unmatchedCount = needsFollowUpNowRows.filter((row) => row.status === 'UNMATCHED').length

  const totalsAcrossAvacs = buildTotalsAcrossAvacs(successfulResults.map((result) => result.report))

  const checkPreviousCount = successfulResults.reduce(
    (sum, result) => sum + (result.report.check_previous_count ?? 0),
    0
  )
  const checkFutureCount = successfulResults.reduce(
    (sum, result) => sum + (result.report.check_future_count ?? 0),
    0
  )
  const withinWindowIssueCount = successfulResults.reduce(
    (sum, result) => sum + (result.report.within_window_issue_count ?? 0),
    0
  )

  const needsFollowUpNowCount = needsFollowUpNowRows.length
  const likelyOtherPayslipCount = timingCheckRows.length
  const likelyMissedThisPayslipCount = needsFollowUpNowRows.filter(
    (row) => ISSUE_FOLLOW_UP_STATUSES.has(row.status)
  ).length

  const futurePendingCount = Math.max(checkFutureCount, totalsAcrossAvacs.notYetPaidCount)
  const pendingCheckCount = likelyOtherPayslipCount

  const actionableNetDifference = needsFollowUpNowRows.reduce(
    (sum, row) => sum + toSafeNumber(row.difference),
    0
  )
  const actionableGrossDifference = needsFollowUpNowRows.reduce(
    (sum, row) => sum + Math.abs(toSafeNumber(row.difference)),
    0
  )

  const decisionState = deriveDecisionState({
    needsFollowUpNowCount,
    timingCheckCount: likelyOtherPayslipCount,
    parseErrorCount: parseErrorResults.length,
    successfulAvacCount: successfulResults.length,
  })
  const confidenceLevel = deriveConfidence({
    parseErrorCount: parseErrorResults.length,
    timingCheckCount: likelyOtherPayslipCount,
  })
  const snapshot = buildDecisionCopy({
    analysis,
    decisionState,
    confidenceLevel,
    needsFollowUpNowCount,
    timingCheckCount: likelyOtherPayslipCount,
    parseErrorCount: parseErrorResults.length,
  })

  const nextSteps = buildNextSteps({
    analysis,
    financialActionableCount: needsFollowUpNowRows.length,
    followUpCount: needsFollowUpNowRows.length,
    parseErrorCount: parseErrorResults.length,
    underpaidMissingCount,
    potentialOverpaidCount,
    unmatchedCount,
    pendingCheckCount,
    checkPreviousCount,
    futureCheckCount: futurePendingCount,
  })

  const avacSummaries: AvacDetailSummary[] = analysis.avac_results.map((result, index) => {
    const avacName = result.avac_name || `AVAC ${index + 1}`

    if (result.error) {
      return {
        id: `avac-${index}`,
        avacName,
        error: result.error,
        statusKey: 'PARSE_ERROR',
        statusLabel: 'Parse error',
        statusClassName: 'bg-red-50 text-red-700',
        subtitle: 'File could not be processed',
        actionItemCount: 0,
        followUpCount: 0,
        pendingCheckCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: {},
      }
    }

    if (!result.report) {
      return {
        id: `avac-${index}`,
        avacName,
        statusKey: 'NO_REPORT',
        statusLabel: 'No report',
        statusClassName: 'bg-slate-100 text-slate-700',
        subtitle: 'No report returned',
        actionItemCount: 0,
        followUpCount: 0,
        pendingCheckCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: {},
      }
    }

    const mergedItems = getMergedActionableItems(result.report)
    const actionableStatusesByDate = buildActionableStatusesByDate(mergedItems)
    const actionItemCount = mergedItems.filter((item) => PAYROLL_ACTION_STATUSES.has(item.status)).length
    const followUpCount = mergedItems.filter((item) => FOLLOW_UP_ROW_STATUSES.has(item.status)).length
    const pendingCheckCountForAvac = mergedItems.filter((item) => PENDING_CHECK_STATUSES.has(item.status)).length

    const daySignalsByDate = new Map<string, DaySignal>()
    for (const day of result.report.days) {
      const displayStatus = getDayDisplayStatus(day, actionableStatusesByDate)
      daySignalsByDate.set(
        day.date,
        getDaySignal({
          day,
          displayStatus,
          supplementalStatuses: actionableStatusesByDate[day.date] ?? [],
        })
      )
    }

    const daySignals = [...daySignalsByDate.values()]
    const issueDays = result.report.days.filter((day) => daySignalsByDate.get(day.date) === 'issue')
    const cleanDays = result.report.days.filter((day) => daySignalsByDate.get(day.date) !== 'issue')

    const overallStatus = deriveOverallStatus({
      actionableStatuses: mergedItems.map((item) => item.status),
      daySignals,
    })
    const meta = getDisplayStatusMeta(overallStatus)

    return {
      id: `avac-${index}`,
      avacName,
      report: result.report,
      statusKey: overallStatus,
      statusLabel: meta.label,
      statusClassName: meta.className,
      subtitle: buildAvacSubtitle({
        followUpCount,
        pendingCheckCount: pendingCheckCountForAvac,
        issueDays: issueDays.length,
      }),
      actionItemCount,
      followUpCount,
      pendingCheckCount: pendingCheckCountForAvac,
      issueDays,
      cleanDays,
      actionableStatusesByDate,
    }
  })

  const topLevelMeta = getDecisionMeta(decisionState)

  const payrollContext: PayrollContextModel = {
    parsedAvacs: `${successfulResults.length}/${analysis.avac_results.length}`,
    notYetPaidCount: totalsAcrossAvacs.notYetPaidCount,
    checkPreviousCount,
    checkFutureCount,
    withinWindowIssueCount,
    earliestAdjustmentDate: totalsAcrossAvacs.earliestAdjustmentDate,
    latestAdjustmentDate: totalsAcrossAvacs.latestAdjustmentDate,
    payPeriodStart: analysis.pay_period_start,
    payPeriodEnd: analysis.pay_period_end,
    adjustmentTotal: analysis.adjustment_total,
    baseRate: analysis.status === 'ok' ? analysis.base_rate : undefined,
    olderAdjustmentsTotal: analysis.older_adjustments_total ?? 0,
  }

  return {
    decisionState,
    decisionHeadline: snapshot.headline,
    decisionDetail: snapshot.detail,
    confidenceLevel,
    confidenceDetail: snapshot.confidenceDetail,
    hasTimingChecks: likelyOtherPayslipCount > 0,
    needsFollowUpNowCount,
    likelyOtherPayslipCount,
    likelyMissedThisPayslipCount,
    topParsedAvacsLabel: `${successfulResults.length}/${analysis.avac_results.length}`,
    topParseErrorCount: parseErrorResults.length,
    needsFollowUpNowRows,
    timingCheckRows,
    topLevelMeta,
    snapshotHeadline: snapshot.headline,
    snapshotDetail: snapshot.detail,
    actionableRows: allRows,
    followUpRows,
    parseErrorResults,
    parseErrorCount: parseErrorResults.length,
    actionableCount: needsFollowUpNowRows.length,
    payrollActionCount,
    pendingCheckCount,
    underpaidMissingCount,
    potentialOverpaidCount,
    nextSteps,
    totalsAcrossAvacs,
    inScopeTotals: {
      expected: totalsAcrossAvacs.inScopeExpected,
      actual: totalsAcrossAvacs.inScopeActual,
      difference: totalsAcrossAvacs.inScopeDifference,
      days: totalsAcrossAvacs.inScopeDays,
    },
    timingTotals: {
      expected: totalsAcrossAvacs.timingExpected,
      actual: totalsAcrossAvacs.timingActual,
      difference: totalsAcrossAvacs.timingDifference,
      days: totalsAcrossAvacs.timingDays,
    },
    actionableNetDifference,
    actionableGrossDifference,
    payrollContext,
    avacSummaries,
  }
}

export function buildPrintSummaryModel(params: {
  analysis: AnalysisJson
  viewModel: ReportViewModel
  reportId: string
  reportCreatedAt: string | null
}): PrintSummaryModel {
  const { analysis, viewModel, reportId, reportCreatedAt } = params

  const sections: PrintSummarySection[] = analysis.status === 'correction_payslip'
    ? []
    : [
        {
          id: 'needs_follow_up_now',
          title: 'Needs follow-up now',
          subtitle: `${viewModel.needsFollowUpNowRows.length} item${viewModel.needsFollowUpNowRows.length === 1 ? '' : 's'} to review now.`,
          rows: viewModel.needsFollowUpNowRows,
          emptyMessage: 'No immediate follow-up items were detected.',
        },
      ]

  if (analysis.status !== 'correction_payslip' && viewModel.timingCheckRows.length > 0) {
    sections.push({
      id: 'timing_check',
      title: 'Recheck on previous/next payslip',
      subtitle: `${viewModel.timingCheckRows.length} timing-check item${viewModel.timingCheckRows.length === 1 ? '' : 's'}.`,
      rows: viewModel.timingCheckRows,
      emptyMessage: 'No timing-check items were detected.',
    })
  }

  const coverageItems: PrintSummaryCoverageItem[] = [
    {
      label: 'Parsed AVACs',
      value: viewModel.topParsedAvacsLabel,
    },
    {
      label: 'Pay period',
      value: formatPayPeriod(viewModel.payrollContext.payPeriodStart, viewModel.payrollContext.payPeriodEnd),
    },
    {
      label: 'Adjustment window',
      value: formatAdjustmentWindow(
        viewModel.payrollContext.earliestAdjustmentDate,
        viewModel.payrollContext.latestAdjustmentDate
      ),
    },
    {
      label: 'In-scope expected',
      value: formatPrintCurrency(viewModel.inScopeTotals.expected),
    },
    {
      label: 'In-scope difference',
      value: formatPrintCurrency(viewModel.inScopeTotals.difference),
    },
    {
      label: 'Timing-check expected (info)',
      value: formatPrintCurrency(viewModel.timingTotals.expected),
    },
    {
      label: 'Timing-check days',
      value: String(viewModel.timingTotals.days),
    },
    {
      label: 'Parse errors',
      value: String(viewModel.topParseErrorCount),
    },
  ]

  const caveats = [
    'This summary is generated automatically from uploaded files and parsed AVAC data.',
    'Use this report as decision support and verify against your official payroll records before lodging a query.',
  ]

  if (viewModel.parseErrorCount > 0) {
    caveats.unshift(
      `${viewModel.parseErrorCount} AVAC file${viewModel.parseErrorCount === 1 ? '' : 's'} could not be parsed and may be missing from this summary.`
    )
  }
  if (viewModel.hasTimingChecks) {
    caveats.unshift('Timing-check items are outside this payslip window and excluded from in-scope discrepancy totals.')
  }

  return {
    header: {
      reportId: reportId || '—',
      employee: analysis.employee || '—',
      payDate: formatReportDate(analysis.pay_date),
      generatedAt: formatPrintDateTime(reportCreatedAt),
    },
    snapshot: {
      headline: viewModel.decisionHeadline,
      detail: viewModel.decisionDetail,
      statusLabel: viewModel.topLevelMeta?.label ?? (analysis.status === 'correction_payslip' ? 'Correction payslip' : 'Summary'),
      confidenceLabel: viewModel.confidenceLevel,
      confidenceDetail: viewModel.confidenceDetail,
    },
    metrics: [
      {
        key: 'needs_now',
        label: 'Needs follow-up now',
        value: viewModel.needsFollowUpNowCount,
      },
      {
        key: 'timing_checks',
        label: 'Likely on another payslip',
        value: viewModel.likelyOtherPayslipCount,
      },
      {
        key: 'likely_missed',
        label: 'Likely missed this payslip',
        value: viewModel.likelyMissedThisPayslipCount,
      },
      {
        key: 'parse_errors',
        label: 'Parse errors',
        value: viewModel.topParseErrorCount,
      },
    ],
    sections,
    nextSteps:
      viewModel.nextSteps.length > 0
        ? viewModel.nextSteps
        : ['Store this summary with your payslip and AVAC records.'],
    coverage: coverageItems,
    caveats,
    correctionSummary:
      analysis.status === 'correction_payslip'
        ? {
            message:
              analysis.message || 'This payslip appears to contain correction or reversal entries only.',
            overpaymentAmount: analysis.overpayment_amount,
          }
        : undefined,
  }
}

const draftCurrencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
})

function formatDraftCurrency(value: number): string {
  return draftCurrencyFormatter.format(value)
}

function formatDraftDifference(value: number): string {
  if (value > 0) return `+${formatDraftCurrency(value)}`
  if (value < 0) return `-${formatDraftCurrency(Math.abs(value))}`
  return formatDraftCurrency(0)
}

export function buildPayrollQueryDraft(params: {
  analysis: AnalysisJson
  viewModel: ReportViewModel
}): string {
  const { analysis, viewModel } = params

  const immediateRows = viewModel.needsFollowUpNowRows
  const timingExcludedCount = viewModel.timingCheckRows.length
  const payDateLabel = formatReportDate(analysis.pay_date)

  const lines: string[] = [
    `Subject: CheckPay follow-up for ${analysis.employee || 'Doctor'} - payslip ${payDateLabel}`,
    '',
    'Hi Payroll,',
    '',
    `I am requesting a review of ${immediateRows.length} item${immediateRows.length === 1 ? '' : 's'} from my payslip dated ${payDateLabel}.`,
    '',
    'Summary:',
    `- Needs follow-up now: ${viewModel.needsFollowUpNowCount}`,
    `- Likely missed this payslip window: ${viewModel.likelyMissedThisPayslipCount}`,
    `- Timing-check items excluded from this list: ${timingExcludedCount}`,
    '',
    'Items to review now:',
    'Date | Claim type | Expected | Paid | Difference | Reason',
    '--- | --- | ---: | ---: | ---: | ---',
  ]

  if (immediateRows.length === 0) {
    lines.push('- | - | - | - | - | No immediate items identified.')
  } else {
    for (const row of immediateRows) {
      lines.push(
        `${row.date || '—'} | ${row.displayPayType} | ${formatDraftCurrency(toSafeNumber(row.expected_amount))} | ${formatDraftCurrency(toSafeNumber(row.actual_amount))} | ${formatDraftDifference(toSafeNumber(row.difference))} | ${row.issueLabel}`
      )
    }
  }

  lines.push(
    '',
    `Note: ${timingExcludedCount} timing-check item${timingExcludedCount === 1 ? '' : 's'} are excluded above because they likely belong to previous/future payslips.`,
    '',
    'Attachments to include:',
    '- Relevant AVAC PDF(s)',
    '- Payslip PDF (including adjustment page)',
    '- CheckPay report or print summary',
    '',
    'Kind regards,',
    analysis.employee || 'Doctor'
  )

  return lines.join('\n')
}

export function buildTroubleshootingPayload(params: {
  reportId: string
  reportCreatedAt: string | null
  analysis: AnalysisJson
  viewModel: ReportViewModel
}) {
  const { reportId, reportCreatedAt, analysis, viewModel } = params

  return {
    report_id: reportId,
    generated_at: reportCreatedAt,
    employee: analysis.employee,
    pay_date: analysis.pay_date,
    high_level_counts: {
      actionable_items: viewModel.actionableCount,
      payroll_action_items: viewModel.payrollActionCount,
      follow_up_items: viewModel.followUpRows.length,
      needs_follow_up_now: viewModel.needsFollowUpNowCount,
      timing_check_items: viewModel.timingCheckRows.length,
      parse_errors: viewModel.parseErrorCount,
      underpaid_missing: viewModel.underpaidMissingCount,
      potential_overpaid: viewModel.potentialOverpaidCount,
      not_yet_paid: viewModel.payrollContext.notYetPaidCount,
      check_previous: viewModel.payrollContext.checkPreviousCount,
      check_future: viewModel.payrollContext.checkFutureCount,
      issue_within_window: viewModel.payrollContext.withinWindowIssueCount,
    },
    avac_status_summaries: viewModel.avacSummaries.map((summary) => ({
      avac_name: summary.avacName,
      status: summary.statusLabel,
      subtitle: summary.subtitle,
      action_items: summary.actionItemCount,
      follow_up_items: summary.followUpCount,
      issue_days: summary.issueDays.length,
      clean_days: summary.cleanDays.length,
      error: summary.error,
    })),
    raw_analysis: analysis,
  }
}
