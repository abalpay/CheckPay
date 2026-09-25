import { useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  formatCurrency,
  formatLongDate,
  formatSignedCurrency,
  toSafeNumber,
} from '../report-formatters'
import { type ActionableRow } from '../report-view-model'
import { StatusPill, TONE_STYLES } from './StatusPill'

function differenceClass(value: number | undefined): string {
  const amount = toSafeNumber(value)
  if (amount < 0) return TONE_STYLES.owed.text
  if (amount > 0) return TONE_STYLES.review.text
  return 'text-[var(--cp-text-primary)]'
}

function SectionHeader({ id, title, count }: { id: string; title: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--cp-text-primary)] pb-3">
      <h2 id={id} className="cp-display text-2xl text-[var(--cp-text-primary)] md:text-[1.75rem]">
        {title}
      </h2>
      <span className="shrink-0 text-sm tabular-nums text-[var(--cp-text-secondary)]">{count}</span>
    </div>
  )
}

function Amount({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--cp-text-secondary)]">{label}</dt>
      <dd className={cn('mt-1 tabular-nums text-[var(--cp-text-primary)]', className)}>{children}</dd>
    </div>
  )
}

function RaiseWithPayrollSection({ rows }: { rows: ActionableRow[] }) {
  const sharedAction = rows.length > 0 && rows.every((row) => row.recommendedAction === rows[0].recommendedAction)
    ? rows[0].recommendedAction
    : null
  const totalDifference = rows.reduce((sum, row) => sum + toSafeNumber(row.difference), 0)

  return (
    <section aria-labelledby="raise-heading">
      <SectionHeader
        id="raise-heading"
        title="Raise with payroll"
        count={`${rows.length} item${rows.length === 1 ? '' : 's'}`}
      />

      {rows.length === 0 ? (
        <p className="mt-5 flex items-start gap-2 text-[15px] text-[var(--cp-text-primary)]">
          <CircleCheck className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_STYLES.ok.text)} aria-hidden />
          No underpaid or missing claims found on this payslip.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-[var(--cp-text-secondary)]">
            {sharedAction ?? 'Not paid as expected on this payslip.'}
          </p>
          <ul className="mt-2 divide-y divide-[var(--cp-border)]">
            {rows.map((row, index) => (
              <li
                key={`${row.avacName}-${row.date}-${row.pay_type}-${index}`}
                className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="font-semibold text-[var(--cp-text-primary)]">{row.displayPayType}</p>
                    <StatusPill status={row.status} label={row.issueLabel} />
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--cp-text-secondary)]">
                    {formatLongDate(row.date, row.day_of_week)}
                    <span aria-hidden> · </span>
                    <span className="sr-only">, from </span>
                    <span className="break-all">{row.avacName || '—'}</span>
                  </p>
                  {!sharedAction && (
                    <p className="mt-2 text-sm text-[var(--cp-text-primary)]">{row.recommendedAction}</p>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-4 sm:w-[320px] sm:text-right">
                  <Amount label="Expected">{formatCurrency(row.expected_amount)}</Amount>
                  <Amount label="Paid">{formatCurrency(row.actual_amount)}</Amount>
                  <Amount label="Difference" className={cn('font-semibold', differenceClass(row.difference))}>
                    {formatSignedCurrency(row.difference)}
                  </Amount>
                </dl>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-4 border-t border-[var(--cp-text-primary)] pt-3">
            <p className="text-sm font-medium text-[var(--cp-text-primary)]">Total difference</p>
            <p className={cn('text-lg font-semibold tabular-nums', differenceClass(totalDifference))}>
              {formatSignedCurrency(totalDifference)}
            </p>
          </div>
        </>
      )}
    </section>
  )
}

interface TimingDayRow {
  key: string
  date: string
  dayOfWeek: string
  avacName: string
  status: string
  issueLabel: string
}

function groupTimingRows(rows: ActionableRow[]): TimingDayRow[] {
  const grouped = new Map<string, TimingDayRow>()

  for (const row of rows) {
    const key = [row.avacName, row.date, row.day_of_week, row.status].join('|')
    if (grouped.has(key)) continue

    grouped.set(key, {
      key,
      date: row.date,
      dayOfWeek: row.day_of_week,
      avacName: row.avacName,
      status: row.status,
      issueLabel: row.issueLabel,
    })
  }

  return [...grouped.values()]
}

function OtherPayslipsSection({ rows, previewLimit = 5 }: { rows: TimingDayRow[]; previewLimit?: number }) {
  const [expanded, setExpanded] = useState(false)
  const isPreviewing = !expanded && rows.length > previewLimit
  const visibleRows = isPreviewing ? rows.slice(0, previewLimit) : rows

  return (
    <section aria-labelledby="other-payslips-heading">
      <SectionHeader
        id="other-payslips-heading"
        title="Check your other payslips"
        count={`${rows.length} date${rows.length === 1 ? '' : 's'}`}
      />
      <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-[var(--cp-text-secondary)]">
        These claims fall outside this payslip’s adjustment window, so they can’t be confirmed here.
        They should appear on the payslip before or after this one.
      </p>
      <ul className="mt-2 divide-y divide-[var(--cp-border)]">
        {visibleRows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
            <div className="min-w-0">
              <p className="font-medium text-[var(--cp-text-primary)]">{formatLongDate(row.date, row.dayOfWeek)}</p>
              <p className="mt-0.5 break-all text-sm text-[var(--cp-text-secondary)]">{row.avacName || '—'}</p>
            </div>
            <StatusPill status={row.status} label={row.issueLabel} />
          </li>
        ))}
      </ul>
      {isPreviewing && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cp-border)] pt-3">
          <p className="text-sm text-[var(--cp-text-secondary)]">
            Showing {visibleRows.length} of {rows.length} dates.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md text-sm font-medium text-[var(--cp-accent)] underline-offset-4 hover:text-[var(--cp-accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2"
          >
            Show all {rows.length} dates
          </button>
        </div>
      )}
    </section>
  )
}

interface ReportActionQueueProps {
  needsFollowUpNowRows: ActionableRow[]
  timingCheckRows: ActionableRow[]
}

export function ReportActionQueue({ needsFollowUpNowRows, timingCheckRows }: ReportActionQueueProps) {
  const timingDayRows = useMemo(() => groupTimingRows(timingCheckRows), [timingCheckRows])

  return (
    <div className="space-y-14">
      <RaiseWithPayrollSection rows={needsFollowUpNowRows} />
      {timingDayRows.length > 0 && <OtherPayslipsSection rows={timingDayRows} />}
    </div>
  )
}
