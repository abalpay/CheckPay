import { describe, expect, it } from 'vitest'

import {
  formatDayTypeLabel,
  formatPayTypeLabel,
  formatStatusLabel,
} from './report-formatters'

describe('report-formatters', () => {
  it('maps status codes to human-readable labels', () => {
    expect(formatStatusLabel('UNDERPAID')).toBe('Underpaid')
    expect(formatStatusLabel('POSSIBLY_MISSED')).toBe('Possibly missed')
    expect(formatStatusLabel('CHECK_PREVIOUS')).toBe('Check previous payslip')
  })

  it('maps day types to title case labels', () => {
    expect(formatDayTypeLabel('weekday')).toBe('Weekday')
    expect(formatDayTypeLabel('public_holiday')).toBe('Public holiday')
  })

  it('formats known and unknown pay types safely', () => {
    expect(formatPayTypeLabel('Recall_-_T2.0')).toBe('Recall (2.0x)')
    expect(formatPayTypeLabel('custom_shift_item')).toBe('Custom Shift Item')
  })
})
