import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addHistoryEntry,
  loadAnalysisHistory,
  removeHistoryEntry,
  saveAnalysisHistory,
  type AnalysisHistoryEntry,
} from './history'

const makeEntry = (id: string, createdAt: string): AnalysisHistoryEntry => ({
  id,
  createdAt,
  payPeriodLabel: `Period ${id}`,
  matchedCount: Number(id) * 2,
  unmatchedCount: Number(id),
  totalClaims: Number(id) * 3,
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('loadAnalysisHistory', () => {
  it('returns an empty array when executed without a window object', () => {
    const originalWindow = globalThis.window
    // Simulate server-side execution where window is not defined.
    ;(globalThis as any).window = undefined

    expect(loadAnalysisHistory()).toEqual([])

    ;(globalThis as any).window = originalWindow
  })

  it('loads and sorts entries from localStorage newest first', () => {
    const entries = [
      makeEntry('1', '2023-01-01T00:00:00.000Z'),
      makeEntry('2', '2024-01-01T00:00:00.000Z'),
    ]
    localStorage.setItem('fairpay-analysis-history', JSON.stringify(entries))

    const result = loadAnalysisHistory()

    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })

  it('filters out malformed entries before returning', () => {
    const data = [makeEntry('1', new Date().toISOString()), { id: null }]
    localStorage.setItem('fairpay-analysis-history', JSON.stringify(data))

    expect(loadAnalysisHistory()).toHaveLength(1)
  })
})

describe('write helpers', () => {
  it('saveAnalysisHistory persists the provided entries', () => {
    const entries = [makeEntry('1', '2024-01-01T00:00:00.000Z')]

    saveAnalysisHistory(entries)

    expect(localStorage.getItem('fairpay-analysis-history')).toBe(
      JSON.stringify(entries)
    )
  })

  it('addHistoryEntry deduplicates by id and prepends the new entry', () => {
    const existing = makeEntry('1', '2023-01-01T00:00:00.000Z')
    saveAnalysisHistory([existing])

    const added = addHistoryEntry(makeEntry('1', '2024-01-01T00:00:00.000Z'))

    expect(added).toHaveLength(1)
    expect(added[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('removeHistoryEntry drops the matching id and updates storage', () => {
    const entries = [makeEntry('1', '2024-01-01T00:00:00.000Z')]
    saveAnalysisHistory(entries)

    const result = removeHistoryEntry('1')

    expect(result).toHaveLength(0)
    expect(localStorage.getItem('fairpay-analysis-history')).toBe('[]')
  })
})
