import {
  getOverallStatusMeta,
  type AnalysisJson,
  type AvacReport,
  type DayResult,
  type LineItem,
} from '@/lib/jobs'
import {
  ACTIONABLE_STATUSES,
  FOLLOW_UP_STATUSES,
  PAYROLL_ACTION_STATUSES,
  formatPayTypeLabel,
  formatStatusLabel,
  getActionPriority,
  getEffectiveDayStatus,
  getRecommendedAction,
  toSafeNumber,
} from './report-formatters'

export type ActionCategory = 'payroll_action' | 'follow_up'

export interface ActionableRow extends LineItem {
  avacName: string
  category: ActionCategory
  issueLabel: string
  recommendedAction: string
  displayPayType: string
}

export interface AvacDetailSummary {
  id: string
  avacName: string
  report?: AvacReport
  error?: string
  statusLabel: string
  statusClassName: string
  subtitle: string
  actionItemCount: number
  followUpCount: number
  issueDays: DayResult[]
  cleanDays: DayResult[]
  actionableStatusesByDate: Record<string, string[]>
}

export interface TotalsAcrossAvacs {
  totalExpected: number
  totalActual: number
  totalDifference: number
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
  earliestAdjustmentDate: string
  latestAdjustmentDate: string
  adjustmentTotal: number
  baseRate?: number
  olderAdjustmentsTotal: number
}

export interface ReportViewModel {
  topLevelMeta: { label: string; className: string } | null
  snapshotHeadline: string
  snapshotDetail: string
  actionableRows: ActionableRow[]
  payrollActionRows: ActionableRow[]
  followUpRows: ActionableRow[]
  parseErrorResults: Array<{ avac_name: string; error: string }>
  parseErrorCount: number
  actionableCount: number
  underpaidMissingCount: number
  potentialOverpaidCount: number
  nextSteps: string[]
  totalsAcrossAvacs: TotalsAcrossAvacs
  actionableNetDifference: number
  actionableGrossDifference: number
  payrollContext: PayrollContextModel
  avacSummaries: AvacDetailSummary[]
}

const DISCREPANCY_STATUSES = new Set(['UNDERPAID', 'MISSING', 'OVERPAID'])

function deriveOverallStatus(params: {
  actionableStatuses: string[]
  effectiveDayStatuses: string[]
}): 'ALL_MATCH' | 'DISCREPANCIES_FOUND' | 'OK_WITH_ANOMALIES' {
  const { actionableStatuses, effectiveDayStatuses } = params

  const hasDiscrepancyAction = actionableStatuses.some((status) =>
    DISCREPANCY_STATUSES.has(status)
  )
  const hasDiscrepancyDay = effectiveDayStatuses.some((status) =>
    DISCREPANCY_STATUSES.has(status)
  )

  if (hasDiscrepancyAction || hasDiscrepancyDay) {
    return 'DISCREPANCIES_FOUND'
  }

  const hasActionAnomaly = actionableStatuses.some(
    (status) => status === 'UNMATCHED' || FOLLOW_UP_STATUSES.has(status)
  )
  const hasDayAnomaly = effectiveDayStatuses.some((status) => status !== 'OK')

  if (hasActionAnomaly || hasDayAnomaly) {
    return 'OK_WITH_ANOMALIES'
  }

  return 'ALL_MATCH'
}

function getDisplayStatusMeta(status: string): { label: string; className: string } {
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
      label: 'Issue identified',
    }
  }

  return base
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

function mapActionableRow(item: LineItem, avacName: string): ActionableRow {
  const category: ActionCategory = FOLLOW_UP_STATUSES.has(item.status)
    ? 'follow_up'
    : 'payroll_action'

  return {
    ...item,
    avacName,
    category,
    issueLabel: formatStatusLabel(item.status),
    recommendedAction: getRecommendedAction(item),
    displayPayType: formatPayTypeLabel(item.pay_type),
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
        if (displayStatus === 'OK') {
          acc.daysVerified += 1
        } else {
          acc.daysWithIssues += 1
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

function buildSnapshot(
  analysis: AnalysisJson,
  actionableCount: number,
  parseErrorCount: number,
  successfulAvacCount: number,
  actionableNetDifference: number,
  actionableGrossDifference: number
): { headline: string; detail: string } {
  if (analysis.status === 'correction_payslip') {
    return {
      headline: 'Correction payslip detected for this pay period.',
      detail:
        'This period appears to include correction or reversal entries rather than new overtime or recall payments.',
    }
  }

  const headline =
    actionableCount === 0 && parseErrorCount === 0 && successfulAvacCount > 0
      ? 'No actionable discrepancy found in parsed AVAC files.'
      : actionableCount === 0 && parseErrorCount > 0
        ? 'Some AVAC files failed parsing, so the report is incomplete.'
        : actionableNetDifference > 0.01
          ? `Potential overpayment ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(actionableNetDifference)} across ${actionableCount} item(s).`
          : actionableNetDifference < -0.01
            ? `Potential underpayment ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(actionableNetDifference))} across ${actionableCount} item(s).`
            : `Mixed discrepancies across ${actionableCount} item(s).`

  const detail =
    actionableCount > 0
      ? `Largest-impact items are listed first below. Gross discrepancy across actionable items: ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(actionableGrossDifference)}.`
      : 'This summary is based only on AVAC files that parsed successfully.'

  return { headline, detail }
}

function buildNextSteps(params: {
  analysis: AnalysisJson
  actionableCount: number
  parseErrorCount: number
  underpaidMissingCount: number
  potentialOverpaidCount: number
  unmatchedCount: number
  followUpCount: number
  notYetPaidCount: number
}): string[] {
  const {
    analysis,
    actionableCount,
    parseErrorCount,
    underpaidMissingCount,
    potentialOverpaidCount,
    unmatchedCount,
    followUpCount,
    notYetPaidCount,
  } = params

  const steps: string[] = []

  if (analysis.status === 'correction_payslip') {
    steps.push('Treat this as a correction-only payslip for this pay period.')
    steps.push('Keep this report with the payslip for your records.')
    steps.push('Check the next standard payslip for AVAC-linked entries.')
    return steps
  }

  if (actionableCount === 0 && parseErrorCount === 0) {
    if (notYetPaidCount > 0) {
      steps.push('Some AVAC dates fall after this payslip\'s adjustment window. Check your next payslip.')
    } else {
      steps.push('No discrepancy needs payroll follow-up for the parsed AVAC files.')
    }
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
    steps.push(
      `Follow up on ${followUpCount} item(s) flagged as possibly missed or requiring previous-payslip checks.`
    )
  }

  if (parseErrorCount > 0) {
    steps.push(`Re-upload ${parseErrorCount} AVAC file(s) that failed parsing so no shift is missed.`)
  }

  steps.push('Use Print summary and attach this report, payslip, and AVAC PDFs to your payroll request.')

  return steps.slice(0, 4)
}

function buildAvacSubtitle(summary: { actionItemCount: number; followUpCount: number; issueDays: number }): string {
  const parts: string[] = []

  if (summary.actionItemCount > 0) {
    parts.push(formatCount(summary.actionItemCount, 'action item', 'action items'))
  }

  if (summary.followUpCount > 0) {
    parts.push(formatCount(summary.followUpCount, 'follow-up', 'follow-ups'))
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

  const actionableRows = sortActionableRows(
    successfulResults.flatMap((result) => {
      const avacName = result.avac_name || 'Unnamed AVAC'
      return getMergedActionableItems(result.report).map((item) => mapActionableRow(item, avacName))
    })
  )

  const payrollActionRows = actionableRows.filter((row) => row.category === 'payroll_action')
  const followUpRows = actionableRows.filter((row) => row.category === 'follow_up')

  const underpaidMissingCount = actionableRows.filter(
    (row) => row.status === 'UNDERPAID' || row.status === 'MISSING'
  ).length

  const potentialOverpaidCount = actionableRows.filter((row) => row.status === 'OVERPAID').length
  const unmatchedCount = actionableRows.filter((row) => row.status === 'UNMATCHED').length

  const totalsAcrossAvacs = buildTotalsAcrossAvacs(successfulResults.map((result) => result.report))

  const actionableNetDifference = actionableRows.reduce(
    (sum, row) => sum + toSafeNumber(row.difference),
    0
  )
  const actionableGrossDifference = actionableRows.reduce(
    (sum, row) => sum + Math.abs(toSafeNumber(row.difference)),
    0
  )

  const snapshot = buildSnapshot(
    analysis,
    actionableRows.length,
    parseErrorResults.length,
    successfulResults.length,
    actionableNetDifference,
    actionableGrossDifference
  )

  const nextSteps = buildNextSteps({
    analysis,
    actionableCount: actionableRows.length,
    parseErrorCount: parseErrorResults.length,
    underpaidMissingCount,
    potentialOverpaidCount,
    unmatchedCount,
    followUpCount: followUpRows.length,
    notYetPaidCount: totalsAcrossAvacs.notYetPaidCount,
  })

  const avacSummaries: AvacDetailSummary[] = analysis.avac_results.map((result, index) => {
    const avacName = result.avac_name || `AVAC ${index + 1}`

    if (result.error) {
      return {
        id: `avac-${index}`,
        avacName,
        error: result.error,
        statusLabel: 'Parse error',
        statusClassName: 'bg-red-50 text-red-700',
        subtitle: 'File could not be processed',
        actionItemCount: 0,
        followUpCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: {},
      }
    }

    if (!result.report) {
      return {
        id: `avac-${index}`,
        avacName,
        statusLabel: 'No report',
        statusClassName: 'bg-slate-100 text-slate-700',
        subtitle: 'No report returned',
        actionItemCount: 0,
        followUpCount: 0,
        issueDays: [],
        cleanDays: [],
        actionableStatusesByDate: {},
      }
    }

    const mergedItems = getMergedActionableItems(result.report)
    const actionableStatusesByDate = buildActionableStatusesByDate(mergedItems)
    const actionItemCount = mergedItems.filter((item) => PAYROLL_ACTION_STATUSES.has(item.status)).length
    const followUpCount = mergedItems.filter((item) => FOLLOW_UP_STATUSES.has(item.status)).length
    const effectiveDayStatuses = result.report.days.map((day) =>
      getDayDisplayStatus(day, actionableStatusesByDate)
    )
    const issueDays = result.report.days.filter(
      (day) => getDayDisplayStatus(day, actionableStatusesByDate) !== 'OK'
    )
    const cleanDays = result.report.days.filter(
      (day) => getDayDisplayStatus(day, actionableStatusesByDate) === 'OK'
    )
    const overallStatus = deriveOverallStatus({
      actionableStatuses: mergedItems.map((item) => item.status),
      effectiveDayStatuses,
    })
    const meta = getDisplayStatusMeta(overallStatus)

    return {
      id: `avac-${index}`,
      avacName,
      report: result.report,
      statusLabel: meta.label,
      statusClassName: meta.className,
      subtitle: buildAvacSubtitle({
        actionItemCount,
        followUpCount,
        issueDays: issueDays.length,
      }),
      actionItemCount,
      followUpCount,
      issueDays,
      cleanDays,
      actionableStatusesByDate,
    }
  })

  const topLevelStatus =
    analysis.status === 'correction_payslip'
      ? 'CORRECTION_PAYSLIP'
      : underpaidMissingCount > 0 || potentialOverpaidCount > 0
        ? 'DISCREPANCIES_FOUND'
        : unmatchedCount > 0
          || parseErrorResults.length > 0
          || followUpRows.length > 0
          || totalsAcrossAvacs.daysWithIssues > 0
          ? 'OK_WITH_ANOMALIES'
          : successfulResults.length > 0
            ? 'ALL_MATCH'
            : undefined

  const topLevelMeta = topLevelStatus ? getDisplayStatusMeta(topLevelStatus) : null

  const payrollContext: PayrollContextModel = {
    parsedAvacs: `${successfulResults.length}/${analysis.avac_results.length}`,
    notYetPaidCount: totalsAcrossAvacs.notYetPaidCount,
    earliestAdjustmentDate: totalsAcrossAvacs.earliestAdjustmentDate,
    latestAdjustmentDate: totalsAcrossAvacs.latestAdjustmentDate,
    adjustmentTotal: analysis.adjustment_total,
    baseRate: analysis.status === 'ok' ? analysis.base_rate : undefined,
    olderAdjustmentsTotal: analysis.older_adjustments_total ?? 0,
  }

  return {
    topLevelMeta,
    snapshotHeadline: snapshot.headline,
    snapshotDetail: snapshot.detail,
    actionableRows,
    payrollActionRows,
    followUpRows,
    parseErrorResults,
    parseErrorCount: parseErrorResults.length,
    actionableCount: actionableRows.length,
    underpaidMissingCount,
    potentialOverpaidCount,
    nextSteps,
    totalsAcrossAvacs,
    actionableNetDifference,
    actionableGrossDifference,
    payrollContext,
    avacSummaries,
  }
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
      payroll_action_items: viewModel.payrollActionRows.length,
      follow_up_items: viewModel.followUpRows.length,
      parse_errors: viewModel.parseErrorCount,
      underpaid_missing: viewModel.underpaidMissingCount,
      potential_overpaid: viewModel.potentialOverpaidCount,
      not_yet_paid: viewModel.payrollContext.notYetPaidCount,
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
