import { useMemo, useState } from 'react'
import { CircleCheck, Clock } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  formatCurrency,
  formatLongDate,
  formatSignedCurrency,
  groupByMonth,
  toSafeNumber,
} from '../report-formatters'
import { type ActionableRow, type UnpaidWeek } from '../report-view-model'
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

function MonthHeading({ level, label, detail, first }: { level: 3 | 4; label: string; detail?: string; first?: boolean }) {
  const Tag = level === 3 ? 'h3' : 'h4'
  return (
    <Tag className={cn(!first && 'mt-8', 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--cp-border)] pb-2 text-sm font-semibold text-[var(--cp-text-primary)]')}>
      <span>{label}</span>
      {detail && <span className="text-[var(--cp-text-secondary)] font-normal tabular-nums">{detail}</span>}
    </Tag>
  )
}

function RowList({ rows, sharedAction }: { rows: ActionableRow[]; sharedAction: string | null }) {
  return (
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
  )
}

function RaiseWithPayrollSection({
  rows,
  payslipScope,
  byMonth,
}: {
  rows: ActionableRow[]
  payslipScope: string
  byMonth: boolean
}) {
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
          No underpaid or missing claims found on {payslipScope}.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-[var(--cp-text-secondary)]">
            {sharedAction ?? `Not paid as expected on ${payslipScope}.`}
          </p>
          {groupByMonth(rows, (row) => row.date).map((group, index, groups) => (
            <div key={group.key}>
              {byMonth && groups.length > 1 && (
                <MonthHeading
                  level={3}
                  label={group.label}
                  first={index === 0}
                  detail={`${group.items.length} item${group.items.length === 1 ? '' : 's'} · ${formatSignedCurrency(group.items.reduce((s, r) => s + toSafeNumber(r.difference), 0))}`}
                />
              )}
              <RowList rows={group.items} sharedAction={sharedAction} />
            </div>
          ))}
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

/** "08.01.2026" -> Monday of that week, "05.01.2026" (the backend's week_start format). */
function weekStartOf(date: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date)
  if (!match) return null
  const day = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])))
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(day.getUTCDate())}.${pad(day.getUTCMonth() + 1)}.${day.getUTCFullYear()}`
}

function formatWeekAge(ageDays: number | null): string | null {
  if (ageDays === null || !Number.isFinite(ageDays)) return null
  if (ageDays < 0) return 'After your latest payslip'
  if (ageDays < 14) return `${ageDays} day${ageDays === 1 ? '' : 's'} before your latest payslip`
  return `${Math.floor(ageDays / 7)} weeks before your latest payslip`
}

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-text-secondary)]">
      {children}
    </h3>
  )
}

function OtherPayslipsSection({
  rows,
  unpaidWeeks,
  byMonth,
  previewLimit = 5,
}: {
  rows: TimingDayRow[]
  unpaidWeeks: UnpaidWeek[]
  byMonth: boolean
  previewLimit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const isPreviewing = !expanded && rows.length > previewLimit
  const visibleRows = isPreviewing ? rows.slice(0, previewLimit) : rows
  const counts = [
    unpaidWeeks.length > 0 ? `${unpaidWeeks.length} week${unpaidWeeks.length === 1 ? '' : 's'}` : null,
    rows.length > 0 ? `${rows.length} date${rows.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="other-payslips-heading">
      <SectionHeader id="other-payslips-heading" title="Check your other payslips" count={counts.join(' · ')} />
      <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-[var(--cp-text-secondary)]">
        These claims can’t be confirmed from the payslips you uploaded, so nothing here is counted as owed.
        Payment usually appears 3–10 weeks after the AVAC week.
      </p>

      {unpaidWeeks.length > 0 && (
        <>
          <SubHeading>Not on any uploaded payslip yet</SubHeading>
          {groupByMonth(unpaidWeeks, (week) => week.week_start).map((group, index, groups) => (
            <div key={group.key}>
              {byMonth && groups.length > 1 && <MonthHeading level={4} label={group.label} first={index === 0} />}
              <ul className="mt-1 divide-y divide-[var(--cp-border)]">
                {group.items.map((week, index) => {
                  const age = formatWeekAge(week.age_days)
                  return (
                    <li
                      key={`${week.week_start}-${week.avac_name}-${index}`}
                      className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--cp-text-primary)]">
                          Week of {formatLongDate(week.week_start, 'Mon')}
                        </p>
                        <p className="mt-0.5 break-all text-sm text-[var(--cp-text-secondary)]">{week.avac_name || '—'}</p>
                      </div>
                      <div className="sm:text-right">
                        <p className="tabular-nums text-[var(--cp-text-primary)]">
                          {formatCurrency(week.expected_total)} <span className="text-[var(--cp-text-secondary)]">outstanding</span>
                        </p>
                        {age && (
                          <p className={cn('mt-0.5 inline-flex items-center gap-1.5 text-sm', TONE_STYLES.timing.text)}>
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {age}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      )}

      {rows.length > 0 && (
        <>
          {unpaidWeeks.length > 0 && <SubHeading>Dates to verify</SubHeading>}
          {groupByMonth(visibleRows, (row) => row.date).map((group, index, groups) => (
            <div key={group.key}>
              {byMonth && groups.length > 1 && <MonthHeading level={4} label={group.label} first={index === 0} />}
              <ul className="mt-2 divide-y divide-[var(--cp-border)]">
                {group.items.map((row) => (
                  <li key={row.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--cp-text-primary)]">{formatLongDate(row.date, row.dayOfWeek)}</p>
                      <p className="mt-0.5 break-all text-sm text-[var(--cp-text-secondary)]">{row.avacName || '—'}</p>
                    </div>
                    <StatusPill status={row.status} label={row.issueLabel} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
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
  unpaidWeeks?: UnpaidWeek[]
  /** "this payslip" or "your payslips". */
  payslipScope?: string
  /** Group rows by calendar month. Only when more than one payslip was uploaded — a single payslip's
   *  fortnight can straddle a month boundary and must still render flat. */
  byMonth?: boolean
}

export function ReportActionQueue({
  needsFollowUpNowRows,
  timingCheckRows,
  unpaidWeeks = [],
  payslipScope = 'this payslip',
  byMonth = false,
}: ReportActionQueueProps) {
  // A NOT_ON_THIS_PAYSLIP date is hidden only when its week row is listed (the backend drops weeks
  // with nothing outstanding), so no date disappears without being shown elsewhere.
  const timingDayRows = useMemo(() => {
    const listedWeeks = new Set(unpaidWeeks.map((week) => `${week.week_start}|${week.avac_name}`))
    return groupTimingRows(
      timingCheckRows.filter(
        (row) => row.status !== 'NOT_ON_THIS_PAYSLIP' || !listedWeeks.has(`${weekStartOf(row.date)}|${row.avacName}`),
      ),
    )
  }, [timingCheckRows, unpaidWeeks])

  return (
    <div className="space-y-14">
      <RaiseWithPayrollSection rows={needsFollowUpNowRows} payslipScope={payslipScope} byMonth={byMonth} />
      {(timingDayRows.length > 0 || unpaidWeeks.length > 0) && (
        <OtherPayslipsSection rows={timingDayRows} unpaidWeeks={unpaidWeeks} byMonth={byMonth} />
      )}
    </div>
  )
}
