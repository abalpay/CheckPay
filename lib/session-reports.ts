import type { AnalysisJson } from './jobs'

const MAX_STORED_REPORTS = 25
const reportStore = new Map<string, SessionReportRecord>()
const reportOrder: string[] = []

export interface SessionReportRecord {
  id: string
  createdAt: string
  analysis: AnalysisJson
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function saveSessionReport(analysis: AnalysisJson): string {
  const id = createId()
  const nextRecord: SessionReportRecord = {
    id,
    createdAt: new Date().toISOString(),
    analysis,
  }

  reportStore.set(id, nextRecord)
  reportOrder.unshift(id)

  while (reportOrder.length > MAX_STORED_REPORTS) {
    const oldest = reportOrder.pop()
    if (oldest) {
      reportStore.delete(oldest)
    }
  }

  return id
}

export function getSessionReportById(id: string): SessionReportRecord | null {
  if (!id) return null
  return reportStore.get(id) ?? null
}

export function listSessionReports(): SessionReportRecord[] {
  return reportOrder
    .map((id) => reportStore.get(id))
    .filter((record): record is SessionReportRecord => Boolean(record))
}

export function clearSessionReports() {
  reportStore.clear()
  reportOrder.length = 0
}
