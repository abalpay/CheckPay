import React, { useState } from 'react'
import { ChevronDown, Copy, FileText } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { type DayResult } from '@/lib/jobs'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  formatDayTypeLabel,
  formatLongDate,
  formatPayTypeLabel,
  formatSignedCurrency,
  getEffectiveDayStatus,
  isoDateOf,
  monthGroupsOf,
  isTimingCheckStatus,
  toSafeNumber,
} from '../report-formatters'
import { type AvacDetailSummary, type PayrollContextModel, type TotalsAcrossAvacs } from '../report-view-model'
import { PayrollContextPanel } from './PayrollContextPanel'
import { StatusPill, TONE_STYLES } from './StatusPill'

interface ReportPerAvacDetailsProps {
  summaries: AvacDetailSummary[]
  totals: TotalsAcrossAvacs
  payrollContext: PayrollContextModel
  onCopyTroubleshooting?: () => void
  showTroubleshooting?: boolean
  /** Group AVAC files by the month of their first day. Only when more than one payslip was uploaded — a
   *  single payslip's fortnight can straddle a month boundary and must still render flat. */
  byMonth?: boolean
}

const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--cp-text-secondary)]'
const TD = 'block md:table-cell md:px-3 md:py-3 md:align-middle'
// Mobile: 4-column grid (expand button + 3 value columns); rows 1–3 hold date, status, amounts.
const ROW = 'grid grid-cols-[2rem_repeat(3,minmax(0,1fr))] gap-x-3 gap-y-2 px-3 py-3 md:table-row md:p-0'

function differenceClass(value: number | undefined): string {
  const amount = toSafeNumber(value)
  if (amount < 0) return TONE_STYLES.owed.text
  if (amount > 0) return TONE_STYLES.review.text
  return ''
}

function AvacDayBreakdown({ summary }: { summary: AvacDetailSummary }) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const report = summary.report
  if (!report) return null

  const days = report.days

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (days.length === 0) {
    return <p className="text-sm text-[var(--cp-text-secondary)]">No days were found on this AVAC.</p>
  }

  return (
    // Below md the table re-flows into stacked grid rows (explicit ARIA roles keep table semantics
    // when display changes); from md up it is a normal table.
    <div className="rounded-lg border border-[var(--cp-border)] bg-white md:overflow-x-auto">
      <table role="table" className="block w-full text-sm md:table md:min-w-[680px]">
        <caption className="sr-only">
          {days.length} day{days.length === 1 ? '' : 's'} on {summary.avacName}
        </caption>
        <thead role="rowgroup" className="hidden border-b border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] md:table-header-group">
          <tr role="row">
            <th role="columnheader" scope="col" className={cn(TH, 'w-10')}>
              <span className="sr-only">Show lines</span>
            </th>
            <th role="columnheader" scope="col" className={TH}>Date</th>
            <th role="columnheader" scope="col" className={TH}>Day type</th>
            <th role="columnheader" scope="col" className={TH}>Status</th>
            <th role="columnheader" scope="col" className={cn(TH, 'text-right')}>Expected</th>
            <th role="columnheader" scope="col" className={cn(TH, 'text-right')}>Paid</th>
            <th role="columnheader" scope="col" className={cn(TH, 'text-right')}>Difference</th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="block md:table-row-group">
          {days.map((day, dayIndex) => {
            const rowKey = `${summary.id}-${day.date}-${dayIndex}`
            const isExpanded = expandedDays.has(rowKey)
            const displayStatus = getEffectiveDayStatus({
              dayStatus: day.status,
              dayDifference: day.difference,
              itemStatuses: day.items.map((item) => item.status),
              supplementalStatuses: summary.actionableStatusesByDate.get(day.date) ?? [],
            })
            const isExpandable = day.items.length > 0
            const isTimingRow = isTimingCheckStatus(displayStatus)
            const dateLabel = formatLongDate(day.date, day.day_of_week)

            return (
              <React.Fragment key={rowKey}>
                <tr
                  role="row"
                  className={cn(
                    ROW,
                    'border-b border-[var(--cp-border)] last:border-b-0',
                    isExpandable && 'cursor-pointer hover:bg-[var(--cp-bg-primary)]'
                  )}
                  // The row is a mouse convenience; the button below is the accessible control
                  // (its click bubbles here, so it needs no handler of its own).
                  onClick={isExpandable ? () => toggleDay(rowKey) : undefined}
                >
                  <td role="cell" className={cn(TD, 'col-start-1 row-start-1 md:w-10 md:pr-0')}>
                    {isExpandable && (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} ${day.items.length} line${day.items.length === 1 ? '' : 's'} for ${dateLabel}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--cp-text-secondary)] hover:bg-[var(--cp-bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)]"
                      >
                        <ChevronDown
                          className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    )}
                  </td>
                  <td
                    role="cell"
                    className={cn(TD, 'col-span-2 col-start-2 row-start-1 self-center whitespace-nowrap font-medium text-[var(--cp-text-primary)]')}
                  >
                    {dateLabel}
                  </td>
                  <td
                    role="cell"
                    className={cn(TD, 'col-start-4 row-start-1 self-center text-right text-[var(--cp-text-secondary)] md:text-left')}
                  >
                    {formatDayTypeLabel(day.day_type)}
                  </td>
                  <td role="cell" className={cn(TD, 'col-span-3 col-start-2 row-start-2')}>
                    <StatusPill status={displayStatus} />
                  </td>
                  <AmountCell label="Expected" className="col-start-2">
                    {isTimingRow ? '—' : formatCurrency(day.expected_total)}
                  </AmountCell>
                  <AmountCell label="Paid" className="col-start-3">
                    {isTimingRow ? '—' : formatCurrency(day.actual_total)}
                  </AmountCell>
                  <AmountCell
                    label="Difference"
                    className={cn('col-start-4 font-medium', !isTimingRow && differenceClass(day.difference))}
                    note={isTimingRow ? undefined : notCountedNote(day)}
                  >
                    {isTimingRow ? '—' : formatSignedCurrency(day.difference)}
                  </AmountCell>
                </tr>

                {isExpandable &&
                  isExpanded &&
                  day.items.map((item, itemIndex) => {
                    const isTimingItem = isTimingCheckStatus(item.status)
                    return (
                      <tr
                        role="row"
                        key={`${rowKey}-item-${itemIndex}`}
                        className={cn(ROW, 'border-b border-[var(--cp-border)] bg-[var(--cp-bg-primary)] text-[13px]')}
                      >
                        <td role="cell" className="hidden md:table-cell" />
                        <td
                          role="cell"
                          colSpan={2}
                          className={cn(TD, 'col-span-3 col-start-2 row-start-1 text-[var(--cp-text-primary)] md:pl-6')}
                        >
                          {formatPayTypeLabel(item.pay_type)}
                        </td>
                        <td role="cell" className={cn(TD, 'col-span-3 col-start-2 row-start-2')}>
                          <StatusPill status={item.status} />
                        </td>
                        <AmountCell label="Expected" className="col-start-2">
                          {isTimingItem ? '—' : formatCurrency(item.expected_amount)}
                        </AmountCell>
                        <AmountCell label="Paid" className="col-start-3">
                          {isTimingItem ? '—' : formatCurrency(item.actual_amount)}
                        </AmountCell>
                        <AmountCell label="Difference" className={cn('col-start-4', !isTimingItem && differenceClass(item.difference))}>
                          {isTimingItem ? '—' : formatSignedCurrency(item.difference)}
                        </AmountCell>
                      </tr>
                    )
                  })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Mirrors the backend's informational_difference: shown, never owed. The NET line restates its splits.
const INFORMATIONAL_STATUSES = new Set(['INFO', 'THRESHOLD_SPLIT', 'THRESHOLD_EXCESS', 'REVERSAL'])

/** Names the informational part of a day so a difference that isn't paid − expected is explained. */
function notCountedNote(day: DayResult): string | undefined {
  const amount = day.items
    .filter((item) => INFORMATIONAL_STATUSES.has(item.status) && item.pay_type !== 'Recall_NET_Total')
    .reduce((sum, item) => sum + toSafeNumber(item.difference), 0)
  return Math.abs(amount) >= 0.01 ? `${formatSignedCurrency(amount)} not counted` : undefined
}

function AmountCell({
  label,
  className,
  note,
  children,
}: {
  label: string
  className?: string
  note?: string
  children: string
}) {
  return (
    <td role="cell" className={cn(TD, 'row-start-3 text-left tabular-nums md:text-right', className)}>
      <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--cp-text-secondary)] md:hidden">
        {label}
      </span>
      {children}
      {note && (
        <span
          className="block text-[11px] font-normal text-[var(--cp-text-secondary)]"
          title="Threshold splits, reversals and info lines are shown but not counted as owed."
        >
          {note}
        </span>
      )}
    </td>
  )
}

/** The AVAC's first day, for month grouping; undefined for a file with no report. */
function firstDayOf(summary: AvacDetailSummary): string | undefined {
  return summary.report?.days
    .map((day) => day.date)
    .filter((date) => isoDateOf(date))
    .sort((a, b) => isoDateOf(a)!.localeCompare(isoDateOf(b)!))[0]
}

/** A file whose report could not be produced at all (parse error, or no report). Distinct from a file
 *  that has a report but no day carries a readable date — that one is "Undated", not "could not be read". */
function isUnreadable(summary: AvacDetailSummary): boolean {
  return Boolean(summary.error) || !summary.report
}

function AvacAccordion({ summaries }: { summaries: AvacDetailSummary[] }) {
  return (
    <Accordion type="multiple" className="space-y-3">
      {summaries.map((summary) => (
        <AccordionItem
          key={summary.id}
          value={summary.id}
          className="rounded-lg border border-[var(--cp-border)] bg-white px-4"
        >
          <AccordionTrigger className="gap-3 rounded-md py-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)]">
            <span className="flex min-w-0 flex-1 flex-col gap-2 text-left sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <span className="inline-flex min-w-0 items-center gap-2 font-medium text-[var(--cp-text-primary)]">
                <FileText className="h-4 w-4 shrink-0 text-[var(--cp-text-secondary)]" aria-hidden />
                <span className="truncate">{summary.avacName}</span>
              </span>
              <StatusPill status={summary.statusKey} label={summary.statusLabel} />
              <span className="text-sm font-normal text-[var(--cp-text-secondary)]">{summary.subtitle}</span>
            </span>
          </AccordionTrigger>
          {summary.report?.warnings?.length ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-800" aria-label="Parsing warnings">
              {summary.report.warnings.map((w) => (
                <li key={w}>Skipped: {w}</li>
              ))}
            </ul>
          ) : null}
          <AccordionContent className="pb-4">
            {summary.error ? (
              <p className={cn('text-sm', TONE_STYLES.owed.text)}>
                This file could not be processed: {summary.error}
              </p>
            ) : summary.report ? (
              <AvacDayBreakdown summary={summary} />
            ) : (
              <p className="text-sm text-[var(--cp-text-secondary)]">No report returned for this AVAC.</p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export function ReportPerAvacDetails({
  summaries,
  totals,
  payrollContext,
  onCopyTroubleshooting,
  showTroubleshooting = true,
  byMonth = false,
}: ReportPerAvacDetailsProps) {
  const totalFigures: Array<{ label: string; value: string; className?: string; hint?: string }> = [
    { label: 'Expected on checked days', value: formatCurrency(totals.inScopeExpected) },
    {
      label: 'Difference to raise',
      value: formatSignedCurrency(totals.inScopeDifference),
      className: differenceClass(totals.inScopeDifference),
    },
    {
      label: 'Outstanding, still pending',
      value: formatCurrency(totals.timingExpected),
      hint: `${totals.timingDays} day${totals.timingDays === 1 ? '' : 's'} · not counted yet`,
    },
  ]
  if (Math.abs(totals.informationalDifference) >= 0.01) {
    totalFigures.push({
      label: 'Not counted (info, thresholds, reversals)',
      value: formatSignedCurrency(totals.informationalDifference),
      hint: 'Shown for reference, not owed',
    })
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="totals-heading">
        <h3 id="totals-heading" className="text-base font-semibold text-[var(--cp-text-primary)]">
          Totals across your AVACs
        </h3>
        <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
          The difference counts only lines that need action. Pending claims, threshold splits, reversals and
          info lines are shown but not counted.
        </p>
        <dl
          className={cn(
            'mt-4 grid gap-px overflow-hidden rounded-lg border border-[var(--cp-border)] bg-[var(--cp-border)]',
            totalFigures.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
          )}
        >
          {totalFigures.map((figure) => (
            <div key={figure.label} className="bg-white px-4 py-4">
              <dt className="text-xs text-[var(--cp-text-secondary)]">{figure.label}</dt>
              <dd
                className={cn(
                  'mt-1 text-xl font-semibold tabular-nums text-[var(--cp-text-primary)]',
                  figure.className
                )}
              >
                {figure.value}
              </dd>
              {figure.hint && <dd className="mt-0.5 text-xs text-[var(--cp-text-secondary)]">{figure.hint}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="by-avac-heading">
        <h3 id="by-avac-heading" className="text-base font-semibold text-[var(--cp-text-primary)]">
          By AVAC file
        </h3>
        <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
          Open a file to see each day. Open a day to see its pay lines.
        </p>
        {monthGroupsOf(byMonth, summaries, firstDayOf).map((group, _, groups) => {
          const allUnreadable = group.key === 'undated' && group.items.every(isUnreadable)
          return (
            <div key={group.key} className="mt-4">
              {byMonth && groups.length > 1 && (
                <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-[var(--cp-border)] pb-2">
                  <h4 className="text-sm font-semibold text-[var(--cp-text-primary)]">
                    {allUnreadable ? 'Files that could not be read' : group.label}
                  </h4>
                  <span className="text-sm font-normal text-[var(--cp-text-secondary)]">
                    {group.items.length} file{group.items.length === 1 ? '' : 's'}
                    {!allUnreadable && ` · ${group.items.filter((s) => s.statusKey !== 'ALL_MATCH').length} to look at`}
                  </span>
                </div>
              )}
              <AvacAccordion summaries={group.items} />
            </div>
          )
        })}
      </section>

      <PayrollContextPanel context={payrollContext} />

      {showTroubleshooting && onCopyTroubleshooting && (
        <section
          aria-labelledby="troubleshooting-heading"
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-[var(--cp-border)] px-4 py-4"
        >
          <div className="max-w-[60ch]">
            <h3 id="troubleshooting-heading" className="text-sm font-semibold text-[var(--cp-text-primary)]">
              Troubleshooting data
            </h3>
            <p className="mt-0.5 text-sm text-[var(--cp-text-secondary)]">
              Something look wrong? Copy the counts, per-AVAC summaries and raw result to share with support.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onCopyTroubleshooting}>
            <Copy className="h-4 w-4" aria-hidden />
            Copy troubleshooting data
          </Button>
        </section>
      )}
    </div>
  )
}
