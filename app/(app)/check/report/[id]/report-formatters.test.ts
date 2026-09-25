import { describe, expect, it } from 'vitest'

import {
  formatDayTypeLabel,
  formatLongDate,
  formatPayTypeLabel,
  formatStatusLabel,
  getEffectiveDayStatus,
  isNeedsFollowUpNowStatus,
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
