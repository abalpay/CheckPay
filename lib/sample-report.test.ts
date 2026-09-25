import { describe, expect, it } from 'vitest'

import { SAMPLE_ANALYSIS } from './sample-report'

const TIMING_STATUSES = new Set(['NOT_ON_THIS_PAYSLIP', 'NEEDS_FORTNIGHT_PAYSLIP', 'CHECK_PREVIOUS', 'CHECK_FUTURE'])
const IMMEDIATE_STATUSES = new Set([
  'UNDERPAID',
  'MISSING',
  'OVERPAID',
  'UNMATCHED',
  'ISSUE_WITHIN_WINDOW',
  'POSSIBLY_MISSED',
])

function getActionableStatusesForAvac(result: (typeof SAMPLE_ANALYSIS.avac_results)[number]): Set<string> {
  const statuses = new Set<string>()
  const report = result.report
  if (!report) return statuses

  for (const item of report.actionable_items) {
    statuses.add(item.status)
  }

  for (const day of report.days) {
    for (const item of day.items) {
      statuses.add(item.status)
    }
  }

  return statuses
}

describe('sample-report fixtures', () => {
  it('does not mix timing and immediate actionable statuses within the same AVAC', () => {
    for (const result of SAMPLE_ANALYSIS.avac_results) {
      if (!result.report) continue

      const statuses = getActionableStatusesForAvac(result)
      const hasTiming = [...statuses].some((status) => TIMING_STATUSES.has(status))
      const hasImmediate = [...statuses].some((status) => IMMEDIATE_STATUSES.has(status))

      expect(
        hasTiming && hasImmediate,
        `${result.avac_name} mixes timing and immediate statuses`
      ).toBe(false)
    }
  })

  it('includes at least one AVAC with immediate action and one AVAC with timing-only action', () => {
    const hasImmediateAvac = SAMPLE_ANALYSIS.avac_results.some((result) => {
      if (!result.report) return false
      const statuses = getActionableStatusesForAvac(result)
      return [...statuses].some((status) => IMMEDIATE_STATUSES.has(status))
    })

    const hasTimingOnlyAvac = SAMPLE_ANALYSIS.avac_results.some((result) => {
      if (!result.report) return false
      const statuses = getActionableStatusesForAvac(result)
      const hasTiming = [...statuses].some((status) => TIMING_STATUSES.has(status))
      const hasImmediate = [...statuses].some((status) => IMMEDIATE_STATUSES.has(status))
      return hasTiming && !hasImmediate
    })

    expect(hasImmediateAvac).toBe(true)
    expect(hasTimingOnlyAvac).toBe(true)
  })

  it('follows the actionable-only difference semantics: pending-only reports owe nothing yet', () => {
    for (const result of SAMPLE_ANALYSIS.avac_results) {
      const report = result.report
      if (!report) continue
      const days = report.days.filter((d) => !TIMING_STATUSES.has(d.status))
      expect(report.total_difference, result.avac_name).toBeCloseTo(days.reduce((s, d) => s + d.difference, 0), 2)
      const pending = report.days.filter((d) => TIMING_STATUSES.has(d.status)).reduce((s, d) => s + d.expected_total, 0)
      expect(report.pending_expected_total ?? 0, result.avac_name).toBeCloseTo(pending, 2)
    }
  })

  it('lists the pending week in unpaid_weeks', () => {
    expect(SAMPLE_ANALYSIS.unpaid_weeks).toEqual([
      expect.objectContaining({ week_start: '05.01.2026', avac_name: 'AVAC Week 2.pdf', expected_total: 230 }),
    ])
  })
})
