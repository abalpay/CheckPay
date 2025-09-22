export interface AnalysisHistoryEntry {
  id: string
  createdAt: string
  payPeriodLabel: string
  matchedCount: number
  unmatchedCount: number
  totalClaims: number
}

const HISTORY_KEY = 'fairpay-analysis-history'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch (error) {
    console.warn('LocalStorage is not available:', error)
    return null
  }
}

function normaliseEntry(raw: unknown): AnalysisHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Partial<AnalysisHistoryEntry>
  if (!candidate.id || !candidate.createdAt || !candidate.payPeriodLabel) {
    return null
  }

  return {
    id: String(candidate.id),
    createdAt: String(candidate.createdAt),
    payPeriodLabel: String(candidate.payPeriodLabel),
    matchedCount: Number(candidate.matchedCount ?? 0),
    unmatchedCount: Number(candidate.unmatchedCount ?? 0),
    totalClaims: Number(candidate.totalClaims ?? 0),
  }
}

function writeHistory(entries: AnalysisHistoryEntry[]): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch (error) {
    console.warn('Failed to persist analysis history:', error)
  }
}

export function loadAnalysisHistory(): AnalysisHistoryEntry[] {
  const storage = getStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(HISTORY_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const normalised = parsed
      .map(normaliseEntry)
      .filter((entry): entry is AnalysisHistoryEntry => entry !== null)

    return normalised.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  } catch (error) {
    console.warn('Failed to read analysis history:', error)
    return []
  }
}

export function saveAnalysisHistory(entries: AnalysisHistoryEntry[]): void {
  writeHistory(entries)
}

export function addHistoryEntry(entry: AnalysisHistoryEntry): AnalysisHistoryEntry[] {
  const entries = loadAnalysisHistory()
  const filtered = entries.filter((existing) => existing.id !== entry.id)
  const next = [entry, ...filtered]
  writeHistory(next)
  return next
}

export function removeHistoryEntry(id: string): AnalysisHistoryEntry[] {
  const entries = loadAnalysisHistory()
  const filtered = entries.filter((entry) => entry.id !== id)
  writeHistory(filtered)
  return filtered
}
