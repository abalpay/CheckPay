import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, MAX_REQUEST_BYTES, type ParsedUpload, type UploadKind } from '@/lib/jobs'

/** A year is ~80 valid files; more than this in one drop is a home folder by mistake. */
export const MAX_FILES_PER_DROP = 150

export type UploadStatus =
  | { state: 'reading' }
  | { state: 'ready'; kind: UploadKind; data: unknown }
  | { state: 'skipped'; reason: string }
  | { state: 'error'; message: string }

export interface UploadItem {
  id: string
  file: File
  status: UploadStatus
}

export type Phase = 'idle' | 'analyzing' | 'done'

export interface State {
  items: UploadItem[]
  phase: Phase
  error: string | null
}

export type Action =
  | { type: 'add_files'; items: UploadItem[] }
  | { type: 'settle'; id: string; status: UploadStatus }
  | { type: 'remove'; id: string }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_phase'; value: Phase }
  | { type: 'reset' }

export const initialState: State = { items: [], phase: 'idle', error: null }

export const SKIP_NOT_PDF = 'Skipped — not a PDF'
export const SKIP_TOO_LARGE = 'Skipped — larger than 4 MB'
export const SKIP_NOT_RECOGNISED = 'Skipped — not a payslip or AVAC'
export const skipDuplicateOf = (name: string) => `Skipped — same file as ${name}`

/** Decided in the browser, before any request: not a PDF, or too big for one request. */
export function localSkipReason(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return SKIP_NOT_PDF
  if (file.size > MAX_REQUEST_BYTES) return SKIP_TOO_LARGE
  return null
}

let nextId = 0

export function newItem(file: File): UploadItem {
  const reason = localSkipReason(file)
  nextId += 1
  return { id: `u${nextId}`, file, status: reason ? { state: 'skipped', reason } : { state: 'reading' } }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add_files':
      return { ...state, items: [...state.items, ...action.items], error: null }
    case 'settle':
      return { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, status: action.status } : i)) }
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.id !== action.id), error: null }
    case 'set_error':
      return { ...state, error: action.value }
    case 'set_phase':
      return { ...state, phase: action.value }
    case 'reset':
      return initialState
    default:
      return state
  }
}

export interface Counts {
  payslips: number
  avacs: number
  reading: number
  skipped: number
  errors: number
  total: number
}

export function countItems(items: UploadItem[]): Counts {
  const counts: Counts = { payslips: 0, avacs: 0, reading: 0, skipped: 0, errors: 0, total: items.length }
  for (const { status } of items) {
    if (status.state === 'ready') counts[status.kind === 'payslip' ? 'payslips' : 'avacs'] += 1
    else if (status.state === 'reading') counts.reading += 1
    else if (status.state === 'skipped') counts.skipped += 1
    else counts.errors += 1
  }
  return counts
}

export function readyUploads(items: UploadItem[], kind: UploadKind): ParsedUpload[] {
  return items.flatMap((i) => (i.status.state === 'ready' && i.status.kind === kind ? [{ kind, name: i.file.name, data: i.status.data }] : []))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function canAnalyze(state: State): boolean {
  const c = countItems(state.items)
  return state.phase === 'idle' && c.reading === 0
    && c.payslips >= 1 && c.payslips <= MAX_PAYSLIP_FILES
    && c.avacs >= 1 && c.avacs <= MAX_AVAC_FILES
}

/** One sentence for the live status line under the Analyse button. */
export function statusMessage(state: State): string {
  const c = countItems(state.items)
  if (c.total === 0) return 'Drop payslips and AVAC PDFs — or a whole folder — to begin.'
  if (c.reading > 0) return `Reading ${plural(c.reading, 'file')}…`
  if (c.payslips > MAX_PAYSLIP_FILES) return `Too many payslips (${c.payslips} of ${MAX_PAYSLIP_FILES}). Remove some to continue.`
  if (c.avacs > MAX_AVAC_FILES) return `Too many AVACs (${c.avacs} of ${MAX_AVAC_FILES}). Remove some to continue.`
  if (c.payslips === 0) return 'Add at least 1 payslip to continue.'
  if (c.avacs === 0) return 'Add at least 1 AVAC to continue.'
  return `Ready: ${plural(c.payslips, 'payslip')} and ${plural(c.avacs, 'AVAC')}.`
    + (c.skipped ? ` ${c.skipped} skipped.` : '')
    + (c.errors ? ` ${c.errors} couldn't be read and won't be included.` : '')
}
