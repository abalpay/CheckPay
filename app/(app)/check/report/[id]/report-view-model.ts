import {
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
  describePayslipScope,
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
  subtitle: string
  actionItemCount: number
  followUpCount: number
  pendingCheckCount: number
  issueDays: DayResult[]
  cleanDays: DayResult[]
  actionableStatusesByDate: ReadonlyMap<string, string[]>
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
  /** Lines payroll reversed (pure corrections; nothing owed). */
  reversalCount: number
  /** Info, threshold and reversal amounts: shown in the breakdown, never part of the difference. */
  informationalDifference: number
}

export type UnpaidWeek = NonNullable<AnalysisJson['unpaid_weeks']>[number]

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
  reversalCount: number
  notOnThisPayslipCount: number
  needsFortnightCount: number
  /** Distinct payslips the backend merged (one per pay date; undated ones by content). */
  payslipCount: number
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
  topLevelMeta: { label: string } | null
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
  /** Weeks with claims on no uploaded payslip. Listed neutrally, never escalated. */
  unpaidWeeks: UnpaidWeek[]
  /** "this payslip" for one upload, "your payslips" for several. */
  payslipScope: string
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

function buildActionableStatusesByDate(items: LineItem[]): Map<string, string[]> {
  const byDate = new Map<string, Set<string>>()

  for (const item of items) {
    if (!item.date) continue

    const current = byDate.get(item.date) ?? new Set<string>()
    current.add(item.status)
    byDate.set(item.date, current)
  }

  return new Map([...byDate].map(([date, statuses]) => [date, [...statuses]]))
}

function getDayDisplayStatus(
  day: DayResult,
  actionableStatusesByDate: ReadonlyMap<string, string[]>
): string {
  return getEffectiveDayStatus({
    dayStatus: day.status,
    dayDifference: day.difference,
    itemStatuses: day.items.map((item) => item.status),
    supplementalStatuses: actionableStatusesByDate.get(day.date) ?? [],
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
      acc.reversalCount += report.reversal_count ?? 0
      acc.informationalDifference += toSafeNumber(report.informational_difference)

      // One number per pending claim: what is still outstanding (expected minus any page-1 payment),
      // the same basis as unpaid_weeks.
      acc.timingExpected += toSafeNumber(report.pending_expected_total)

      for (const day of report.days) {
        const displayStatus = getDayDisplayStatus(day, actionableStatusesByDate)
        const daySignal = getDaySignal({
          day,
          displayStatus,
          supplementalStatuses: actionableStatusesByDate.get(day.date) ?? [],
        })

        if (daySignal === 'issue') {
          acc.daysWithIssues += 1
        } else {
          acc.daysVerified += 1
        }

        if (isTimingCheckStatus(displayStatus)) {
          // Older sessions lack pending_expected_total: fall back to the day total.
          if (typeof report.pending_expected_total !== 'number') acc.timingExpected += toSafeNumber(day.expected_total)
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
      reversalCount: 0,
      informationalDifference: 0,
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
  payslipScope: string
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
    payslipScope,
  } = params

  if (analysis.status === 'correction_payslip') {
    return {
      headline: 'This looks like a correction-only payslip.',
      detail:
        'It holds corrections rather than AVAC claims. Keep it for your records and check your next regular payslip for your claims.',
      confidenceDetail: 'Correction payslips can contain reversals only, so treat this result as a guide.',
    }
  }

  const confidenceDetail =
    confidenceLevel === 'LOW'
      ? `${parseErrorCount} AVAC file${parseErrorCount === 1 ? '' : 's'} could not be read, so some claims may be missing from this result.`
      : confidenceLevel === 'MEDIUM'
        ? 'Some claims can’t be confirmed from the payslips you uploaded yet, so they are listed to check later.'
        : 'Every AVAC file was read and every claim was checked against a payslip that could have paid it.'

  if (decisionState === 'INCOMPLETE_REVIEW') {
    return {
      headline: 'We couldn’t read your AVAC files.',
      detail: 'Nothing was checked. Re-upload the AVAC PDFs before deciding whether to contact payroll.',
      confidenceDetail,
    }
  }

  if (decisionState === 'ACTION_NOW') {
    return {
      headline: `${needsFollowUpNowCount} item${needsFollowUpNowCount === 1 ? '' : 's'} to raise with payroll.`,
      detail: `${needsFollowUpNowCount === 1 ? 'This claim was' : 'These claims were'} not paid as expected on ${payslipScope}. Check the lines below, then raise a payroll query with your AVAC as evidence.`,
      confidenceDetail,
    }
  }

  if (decisionState === 'CHECK_ADJACENT_PAYSLIP') {
    return {
      headline: `No mismatch found on ${payslipScope}.`,
      detail: `${timingCheckCount} claim${timingCheckCount === 1 ? ' isn’t' : 's aren’t'} on the payslips you uploaded yet. Payment usually appears 3–10 weeks after the AVAC week, so check a later payslip before raising a query.`,
      confidenceDetail,
    }
  }

  return {
    headline: 'No follow-up needed from this report.',
    detail: 'Every claim we could check was paid as expected. Keep this report with your payslip and AVAC forms.',
    confidenceDetail,
  }
}

function getDecisionMeta(decisionState: DecisionState): { label: string } {
  if (decisionState === 'ACTION_NOW') return { label: 'Raise with payroll' }
  if (decisionState === 'CHECK_ADJACENT_PAYSLIP') return { label: 'Check other payslips' }
  if (decisionState === 'INCOMPLETE_REVIEW') return { label: 'Incomplete' }
  return { label: 'Nothing to raise' }
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
  needsFortnightCount: number
  notOnThisPayslipCount: number
  unpaidWeeks: UnpaidWeek[]
  reversalCount: number
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
    needsFortnightCount,
    notOnThisPayslipCount,
    unpaidWeeks,
    reversalCount,
  } = params

  const steps: string[] = []
  const reversalStep = reversalCount > 0
    ? `Payroll reversed ${formatCount(reversalCount, 'line', 'lines')} on your payslips. Nothing is owed for ${reversalCount === 1 ? 'it' : 'them'}; open the breakdown to see what was corrected.`
    : null

  if (analysis.status === 'correction_payslip') {
    steps.push('Treat this as a correction-only payslip for this pay period.')
    steps.push('Keep this report with the payslip for your records.')
    steps.push('Check your next regular payslip for your AVAC claims.')
    return steps
  }

  // Neutral pending steps: they follow every action, so an action is never pushed out of the list.
  const pendingSteps: string[] = []
  if (needsFortnightCount > 0) {
    pendingSteps.push(`Upload the fortnight payslip named in the report to verify ${formatCount(needsFortnightCount, 'claim', 'claims')} that payroll may have paid as rostered overtime.`)
  }
  if (unpaidWeeks.length > 0) {
    // Replaces the per-claim step below: the weeks list is the same claims, grouped the way payroll pays them.
    const total = unpaidWeeks.reduce((sum, week) => sum + toSafeNumber(week.expected_total), 0)
    pendingSteps.push(`${formatCount(unpaidWeeks.length, 'AVAC week is', 'AVAC weeks are')} not on any uploaded payslip (about ${printCurrencyFormatter.format(total)} outstanding). If a week is older than 10 weeks, ask payroll whether that AVAC was received.`)
  } else if (notOnThisPayslipCount > 0) {
    pendingSteps.push(`${formatCount(notOnThisPayslipCount, 'claim is', 'claims are')} not on the uploaded payslip(s) yet. Payment usually appears 3–10 weeks after the AVAC week; if it is older than that, ask payroll whether the AVAC was received.`)
  }

  if (financialActionableCount === 0 && followUpCount === 0 && parseErrorCount === 0 && pendingCheckCount === 0) {
    if (reversalStep) steps.push(reversalStep)
    steps.push('Nothing needs raising with payroll for the AVAC files you uploaded.')
    steps.push('Keep this report with your payslip and AVAC forms.')
    steps.push('Run a new check if you add more AVAC forms later.')
    return steps
  }

  if (underpaidMissingCount > 0) {
    steps.push(
      `Raise a payroll query for ${formatCount(underpaidMissingCount, 'underpaid or missing line', 'underpaid or missing lines')}, attaching the matching AVAC.`
    )
  }

  if (potentialOverpaidCount > 0 || unmatchedCount > 0) {
    const reviewCount = potentialOverpaidCount + unmatchedCount
    steps.push(
      `Confirm ${formatCount(reviewCount, 'line', 'lines')} that look overpaid or don’t match an AVAC claim before you lodge anything.`
    )
  }

  const possiblyMissedCount = followUpCount - underpaidMissingCount - potentialOverpaidCount - unmatchedCount
  if (possiblyMissedCount > 0) {
    steps.push(
      `Ask payroll about ${formatCount(possiblyMissedCount, 'claim', 'claims')} on days payroll skipped in a week it otherwise paid.`
    )
  }

  if (parseErrorCount > 0) {
    steps.push(`Re-upload ${formatCount(parseErrorCount, 'AVAC file', 'AVAC files')} that couldn’t be read, so no shift is missed.`)
  }
  steps.push(...pendingSteps)

  // Informational only: it may use a spare slot before "Print", never displace an action.
  if (reversalStep && steps.length <= 2) steps.push(reversalStep)
  steps.push('Print the summary and attach it to your payroll request with your payslip and AVAC PDFs.')

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
  const payslipScope = (analysis.payslips?.length ?? 1) > 1 ? 'your payslips' : 'this payslip'
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
  const needsFortnightCount = successfulResults.reduce(
    (sum, result) => sum + (result.report.needs_fortnight_payslip_count ?? 0),
    0
  )
  const notOnThisPayslipCount = successfulResults.reduce(
    (sum, result) => sum + (result.report.not_on_this_payslip_count ?? result.report.check_future_count ?? 0),
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
    payslipScope,
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
    needsFortnightCount,
    notOnThisPayslipCount,
    unpaidWeeks: analysis.unpaid_weeks ?? [],
    reversalCount: totalsAcrossAvacs.reversalCount,
  })

  const avacSummaries: AvacDetailSummary[] = analysis.avac_results.map((result, index) => {
    const avacName = result.avac_name || `AVAC ${index + 1}`

    if (result.error) {
      return {
        id: `avac-${index}`,
        avacName,
        error: result.error,
        statusKey: 'PARSE_ERROR',
        statusLabel: 'Could not read',
        subtitle: 'This file could not be processed',
        actionItemCount: 0,
        followUpCount: 0,
        pendingCheckCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: new Map(),
      }
    }

    if (!result.report) {
      return {
        id: `avac-${index}`,
        avacName,
        statusKey: 'NO_REPORT',
        statusLabel: 'No report',
        subtitle: 'No report returned',
        actionItemCount: 0,
        followUpCount: 0,
        pendingCheckCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: new Map(),
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
          supplementalStatuses: actionableStatusesByDate.get(day.date) ?? [],
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

    return {
      id: `avac-${index}`,
      avacName,
      report: result.report,
      statusKey: overallStatus,
      statusLabel: formatStatusLabel(overallStatus),
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
    parsedAvacs: `${successfulResults.length} of ${analysis.avac_results.length}`,
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
    reversalCount: totalsAcrossAvacs.reversalCount,
    notOnThisPayslipCount,
    needsFortnightCount,
    payslipCount: analysis.payslips?.length ?? 1,
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
    topParsedAvacsLabel: `${successfulResults.length} of ${analysis.avac_results.length}`,
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
    unpaidWeeks: analysis.unpaid_weeks ?? [],
    payslipScope,
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
          title: 'Raise with payroll',
          subtitle: `${viewModel.needsFollowUpNowRows.length} item${viewModel.needsFollowUpNowRows.length === 1 ? '' : 's'} not paid as expected on ${viewModel.payslipScope}.`,
          rows: viewModel.needsFollowUpNowRows,
          emptyMessage: 'Nothing to raise with payroll.',
        },
      ]

  if (analysis.status !== 'correction_payslip' && viewModel.timingCheckRows.length > 0) {
    sections.push({
      id: 'timing_check',
      title: 'Check your other payslips',
      subtitle: `${viewModel.timingCheckRows.length} claim${viewModel.timingCheckRows.length === 1 ? '' : 's'} not on the uploaded payslips yet. Payment usually appears 3–10 weeks after the AVAC week.`,
      rows: viewModel.timingCheckRows,
      emptyMessage: 'Every claim was checked against an uploaded payslip.',
    })
  }

  const payslipScope = describePayslipScope(analysis)
  const coverageItems: PrintSummaryCoverageItem[] = [
    {
      label: 'AVAC files read',
      value: viewModel.topParsedAvacsLabel,
    },
    {
      label: payslipScope.count > 1 ? 'Pay periods' : 'Pay period',
      value: payslipScope.period,
    },
    {
      label: 'Adjustment dates on payslip',
      value: formatAdjustmentWindow(
        viewModel.payrollContext.earliestAdjustmentDate,
        viewModel.payrollContext.latestAdjustmentDate
      ),
    },
    {
      label: 'Expected on checked days',
      value: formatPrintCurrency(viewModel.inScopeTotals.expected),
    },
    {
      label: 'Difference to raise',
      value: formatPrintCurrency(viewModel.inScopeTotals.difference),
    },
    {
      label: 'Outstanding, still pending (for reference)',
      value: formatPrintCurrency(viewModel.timingTotals.expected),
    },
    {
      label: 'Pending days',
      value: String(viewModel.timingTotals.days),
    },
    {
      label: 'Reversals by payroll',
      value: String(viewModel.totalsAcrossAvacs.reversalCount),
    },
    {
      label: 'Files not read',
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
    caveats.unshift('Claims not on the uploaded payslips yet are listed for checking but excluded from the difference.')
  }

  return {
    header: {
      reportId: reportId || '—',
      employee: analysis.employee || '—',
      payDate: payslipScope.payDate,
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
        label: 'Raise with payroll',
        value: viewModel.needsFollowUpNowCount,
      },
      {
        key: 'timing_checks',
        label: 'Check other payslips',
        value: viewModel.likelyOtherPayslipCount,
      },
      {
        key: 'likely_missed',
        label: 'Possibly missed',
        value: viewModel.likelyMissedThisPayslipCount,
      },
      {
        key: 'parse_errors',
        label: 'Files not read',
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
  const payslipScope = describePayslipScope(analysis)
  const payDateLabel = payslipScope.payDate
  const payslipWord = payslipScope.count > 1 ? 'payslips' : 'payslip'

  const lines: string[] = [
    `Subject: CheckPay follow-up for ${analysis.employee || 'Doctor'} - ${payslipWord} ${payDateLabel}`,
    '',
    'Hi Payroll,',
    '',
    `I am requesting a review of ${immediateRows.length} item${immediateRows.length === 1 ? '' : 's'} from my ${payslipWord} dated ${payDateLabel}.`,
    '',
    'Summary:',
    `- Needs follow-up now: ${viewModel.needsFollowUpNowCount}`,
    `- Days skipped in a paid week: ${viewModel.likelyMissedThisPayslipCount}`,
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
    `Note: ${timingExcludedCount} timing-check item${timingExcludedCount === 1 ? ' is' : 's are'} excluded above because ${timingExcludedCount === 1 ? 'it is' : 'they are'} not on the payslips I uploaded yet.`,
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
      not_on_this_payslip: viewModel.payrollContext.notOnThisPayslipCount,
      needs_fortnight_payslip: viewModel.payrollContext.needsFortnightCount,
      reversals: viewModel.payrollContext.reversalCount,
      unpaid_weeks: viewModel.unpaidWeeks.length,
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
