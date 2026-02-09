import type { AnalysisJson } from './jobs'

const MAX_STORED_REPORTS = 25
const REPORT_TTL_MS = 30 * 60 * 1000
const reportStore = new Map<string, SessionReportRecord>()
const reportOrder: string[] = []

export interface SessionReportRecord {
  id: string
  createdAt: string
  analysis: AnalysisJson
  sessionId?: string
}

function createId(): string {
  return crypto.randomUUID()
}

function purgeExpired(): void {
  const now = Date.now()
  for (let i = reportOrder.length - 1; i >= 0; i--) {
    const id = reportOrder[i]
    const record = reportStore.get(id)
    if (!record) {
      reportOrder.splice(i, 1)
      continue
    }
    const age = now - new Date(record.createdAt).getTime()
    if (age > REPORT_TTL_MS) {
      reportStore.delete(id)
      reportOrder.splice(i, 1)
    }
  }
}

export function saveSessionReport(analysis: AnalysisJson, sessionId?: string): string {
  purgeExpired()

  const id = createId()
  const nextRecord: SessionReportRecord = {
    id,
    createdAt: new Date().toISOString(),
    analysis,
    ...(sessionId ? { sessionId } : {}),
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

export function getSessionReportById(id: string, sessionId?: string): SessionReportRecord | null {
  if (!id) return null
  const record = reportStore.get(id) ?? null
  if (!record) return null

  const age = Date.now() - new Date(record.createdAt).getTime()
  if (age > REPORT_TTL_MS) {
    reportStore.delete(id)
    const idx = reportOrder.indexOf(id)
    if (idx !== -1) reportOrder.splice(idx, 1)
    return null
  }

  if (record.sessionId && sessionId && record.sessionId !== sessionId) {
    return null
  }

  return record
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
