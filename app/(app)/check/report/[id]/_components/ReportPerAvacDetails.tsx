import React, { useState } from 'react'
import { ChevronDown, Copy, FileText } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  formatDayTypeLabel,
  formatLongDate,
  formatPayTypeLabel,
  formatSignedCurrency,
  getEffectiveDayStatus,
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
}

const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--cp-text-secondary)]'
const TD = 'px-3 py-3 align-middle'

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
    <div className="overflow-x-auto rounded-lg border border-[var(--cp-border)] bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">
          {days.length} day{days.length === 1 ? '' : 's'} on {summary.avacName}
        </caption>
        <thead className="border-b border-[var(--cp-border)] bg-[var(--cp-bg-secondary)]">
          <tr>
            <th scope="col" className={cn(TH, 'w-10')}>
              <span className="sr-only">Show lines</span>
            </th>
            <th scope="col" className={TH}>Date</th>
            <th scope="col" className={TH}>Day type</th>
            <th scope="col" className={TH}>Status</th>
            <th scope="col" className={cn(TH, 'text-right')}>Expected</th>
            <th scope="col" className={cn(TH, 'text-right')}>Paid</th>
            <th scope="col" className={cn(TH, 'text-right')}>Difference</th>
          </tr>
        </thead>
        <tbody>
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
                  className={cn(
                    'border-b border-[var(--cp-border)] last:border-b-0',
                    isExpandable && 'cursor-pointer hover:bg-[var(--cp-bg-primary)]'
                  )}
                  // The row is a mouse convenience; the button below is the accessible control
                  // (its click bubbles here, so it needs no handler of its own).
                  onClick={isExpandable ? () => toggleDay(rowKey) : undefined}
                >
                  <td className={cn(TD, 'w-10 pr-0')}>
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
                  <td className={cn(TD, 'whitespace-nowrap font-medium text-[var(--cp-text-primary)]')}>{dateLabel}</td>
                  <td className={cn(TD, 'text-[var(--cp-text-secondary)]')}>{formatDayTypeLabel(day.day_type)}</td>
                  <td className={TD}>
                    <StatusPill status={displayStatus} />
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {isTimingRow ? '—' : formatCurrency(day.expected_total)}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {isTimingRow ? '—' : formatCurrency(day.actual_total)}
                  </td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums', !isTimingRow && differenceClass(day.difference))}>
                    {isTimingRow ? '—' : formatSignedCurrency(day.difference)}
                  </td>
                </tr>

                {isExpandable &&
                  isExpanded &&
                  day.items.map((item, itemIndex) => {
                    const isTimingItem = isTimingCheckStatus(item.status)
                    return (
                      <tr
                        key={`${rowKey}-item-${itemIndex}`}
                        className="border-b border-[var(--cp-border)] bg-[var(--cp-bg-primary)] text-[13px]"
                      >
                        <td />
                        <td colSpan={2} className={cn(TD, 'pl-6 text-[var(--cp-text-primary)]')}>
                          {formatPayTypeLabel(item.pay_type)}
                        </td>
                        <td className={TD}>
                          <StatusPill status={item.status} />
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {isTimingItem ? '—' : formatCurrency(item.expected_amount)}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {isTimingItem ? '—' : formatCurrency(item.actual_amount)}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums', !isTimingItem && differenceClass(item.difference))}>
                          {isTimingItem ? '—' : formatSignedCurrency(item.difference)}
                        </td>
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

export function ReportPerAvacDetails({
  summaries,
  totals,
  payrollContext,
  onCopyTroubleshooting,
  showTroubleshooting = true,
}: ReportPerAvacDetailsProps) {
  const totalFigures = [
    { label: 'Expected inside window', value: formatCurrency(totals.inScopeExpected) },
    {
      label: 'Difference inside window',
      value: formatSignedCurrency(totals.inScopeDifference),
      className: differenceClass(totals.inScopeDifference),
    },
    { label: 'Expected outside window', value: formatCurrency(totals.timingExpected), hint: 'For reference only' },
    { label: 'Days outside window', value: String(totals.timingDays) },
  ]

  return (
    <div className="space-y-12">
      <section aria-labelledby="totals-heading">
        <h3 id="totals-heading" className="text-base font-semibold text-[var(--cp-text-primary)]">
          Totals for this payslip
        </h3>
        <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
          Only claims inside the adjustment window count towards the difference.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--cp-border)] bg-[var(--cp-border)] lg:grid-cols-4">
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
        <Accordion type="multiple" className="mt-4 space-y-3">
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
