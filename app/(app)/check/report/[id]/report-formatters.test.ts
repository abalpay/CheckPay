import { describe, expect, it } from 'vitest'

import {
  formatDayTypeLabel,
  formatLongDate,
  formatMonthLabel,
  formatReportDate,
  describePayslipScope,
  formatPayTypeLabel,
  formatStatusLabel,
  getEffectiveDayStatus,
  groupByMonth,
  isNeedsFollowUpNowStatus,
  isoDateOf,
  isTimingCheckStatus,
} from './report-formatters'

describe('report-formatters', () => {
  it('maps status codes to human-readable labels', () => {
    expect(formatStatusLabel('UNDERPAID')).toBe('Underpaid')
    expect(formatStatusLabel('POSSIBLY_MISSED')).toBe('Possibly missed')
    expect(formatStatusLabel('CHECK_PREVIOUS')).toBe('Check previous payslip')
    expect(formatStatusLabel('CHECK_FUTURE')).toBe('Check next payslip')
    expect(formatStatusLabel('FOLLOW_UP_REQUIRED')).toBe('To check')
  })

  it('formats dotted AVAC dates as readable long dates', () => {
    expect(formatLongDate('09.01.2026', 'Fri')).toBe('Fri 9 Jan 2026')
    expect(formatLongDate('30.12.2025')).toBe('30 Dec 2025')
    expect(formatLongDate('')).toBe('—')
  })

  it('maps day types to title case labels', () => {
    expect(formatDayTypeLabel('weekday')).toBe('Weekday')
    expect(formatDayTypeLabel('public_holiday')).toBe('Public holiday')
  })

  it('formats known and unknown pay types safely', () => {
    expect(formatPayTypeLabel('Recall_-_T2.0')).toBe('Recall (2.0x)')
    expect(formatPayTypeLabel('custom_shift_item')).toBe('Custom Shift Item')
  })

  it('derives effective day status from supplemental actionable statuses', () => {
    expect(
      getEffectiveDayStatus({
        dayStatus: 'OK',
        dayDifference: 0,
        itemStatuses: ['MATCH'],
        supplementalStatuses: ['POSSIBLY_MISSED'],
      })
    ).toBe('POSSIBLY_MISSED')
  })

  it('keeps threshold-only days as OK', () => {
    expect(
      getEffectiveDayStatus({
        dayStatus: 'OK',
        dayDifference: 0,
        itemStatuses: ['THRESHOLD_SPLIT', 'THRESHOLD_EXCESS'],
      })
    ).toBe('OK')
  })

  it('classifies timing-check statuses separately from immediate follow-up statuses', () => {
    expect(isTimingCheckStatus('CHECK_PREVIOUS')).toBe(true)
    expect(isTimingCheckStatus('CHECK_FUTURE')).toBe(true)
    expect(isTimingCheckStatus('NOT_YET_PAID')).toBe(true)
    expect(isTimingCheckStatus('FUTURE_PAY_PERIOD')).toBe(true)
    expect(isTimingCheckStatus('ISSUE_WITHIN_WINDOW')).toBe(false)

    expect(isNeedsFollowUpNowStatus('UNDERPAID')).toBe(true)
    expect(isNeedsFollowUpNowStatus('MISSING')).toBe(true)
    expect(isNeedsFollowUpNowStatus('OVERPAID')).toBe(true)
    expect(isNeedsFollowUpNowStatus('UNMATCHED')).toBe(true)
    expect(isNeedsFollowUpNowStatus('ISSUE_WITHIN_WINDOW')).toBe(true)
    expect(isNeedsFollowUpNowStatus('POSSIBLY_MISSED')).toBe(true)
    expect(isNeedsFollowUpNowStatus('CHECK_PREVIOUS')).toBe(false)
  })
})

describe('year-less payslip dates (DD/MM)', () => {
  it('formats DD/MM as day and month, never guessing a US date', () => {
    expect(formatReportDate('11/05')).toBe('11 May')
    expect(formatLongDate('28/04')).toBe('28 Apr')
  })
})

describe('describePayslipScope', () => {
  it('describes a single payslip by its own pay date and period', () => {
    expect(
      describePayslipScope({ pay_date: '04.06.2025', pay_period_start: '12/05', pay_period_end: '25/05' }),
    ).toEqual({ count: 1, payDate: '4 Jun 2025', period: '12 May – 25 May' })
  })

  it('describes several payslips by their range, not the latest one', () => {
    expect(
      describePayslipScope({
        pay_date: '04.06.2025',
        pay_period_start: '12/05',
        pay_period_end: '25/05',
        payslips: [
          { pay_date: '26.02.2025', period_start: '03/02', period_end: '16/02' },
          { pay_date: '21.05.2025', period_start: '28/04', period_end: '11/05' },
          { pay_date: '04.06.2025', period_start: '12/05', period_end: '25/05' },
        ],
      }),
    ).toEqual({ count: 3, payDate: '26 Feb 2025 – 4 Jun 2025', period: '3 Feb – 25 May' })
  })
})

describe('groupByMonth', () => {
  it('turns dotted dates into ISO and month labels', () => {
    expect(isoDateOf('05.06.2025')).toBe('2025-06-05')
    expect(isoDateOf('12/05')).toBeNull()
    expect(formatMonthLabel('2025-06')).toBe('June 2025')
  })

  it('groups by calendar month, oldest first, same month in different years apart, undated last', () => {
    const rows = [
      { d: '15.12.2025', n: 'dec25' }, { d: '03.06.2025', n: 'jun-a' }, { d: '', n: 'none' },
      { d: '20.12.2024', n: 'dec24' }, { d: '28.06.2025', n: 'jun-b' },
    ]
    const groups = groupByMonth(rows, (r) => r.d)
    expect(groups.map((g) => [g.key, g.label, g.items.map((r) => r.n)])).toEqual([
      ['2024-12', 'December 2024', ['dec24']],
      ['2025-06', 'June 2025', ['jun-a', 'jun-b']],
      ['2025-12', 'December 2025', ['dec25']],
      ['undated', 'Undated', ['none']],
    ])
    expect(groupByMonth([], (r: { d: string }) => r.d)).toEqual([])
  })
})
