import { describe, expect, it } from 'vitest'

import { SAMPLE_ANALYSIS } from './sample-report'

const TIMING_STATUSES = new Set(['CHECK_PREVIOUS', 'CHECK_FUTURE'])
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
})
