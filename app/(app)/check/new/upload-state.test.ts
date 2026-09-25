import { describe, expect, it } from 'vitest'

import { MAX_REQUEST_BYTES } from '@/lib/jobs'

import {
  canAnalyze, countItems, initialState, localSkipReason, newItem, readyUploads, reducer, SKIP_NOT_PDF,
  SKIP_TOO_LARGE, statusMessage, type State, type UploadItem,
} from './upload-state'

const file = (name: string, type = 'application/pdf', size = 2048) => new File([new Uint8Array(size)], name, { type })
const ready = (name: string, kind: 'payslip' | 'avac'): UploadItem => ({ ...newItem(file(name)), status: { state: 'ready', kind, data: { name } } })
const withItems = (items: UploadItem[]): State => ({ ...initialState, items })

describe('localSkipReason', () => {
  it('skips anything that is not a PDF, in the browser', () => {
    expect(localSkipReason(file('Screenshot.png', 'image/png'))).toBe(SKIP_NOT_PDF)
    expect(localSkipReason(file('.DS_Store', ''))).toBe(SKIP_NOT_PDF)
    expect(localSkipReason(file('payslip.PDF', ''))).toBeNull() // folder inputs sometimes give no MIME type
    expect(localSkipReason(file('payslip.pdf'))).toBeNull()
  })

  it('skips a PDF that would not fit in one request', () => {
    expect(localSkipReason(file('big.pdf', 'application/pdf', MAX_REQUEST_BYTES + 1))).toBe(SKIP_TOO_LARGE)
  })
})

describe('reducer', () => {
  it('adds files as reading or skipped, settles by id, removes by id', () => {
    const a = newItem(file('a.pdf'))
    const png = newItem(file('p.png', 'image/png'))
    let state = reducer(initialState, { type: 'add_files', items: [a, png] })
    expect(state.items.map((i) => i.status.state)).toEqual(['reading', 'skipped'])
    state = reducer(state, { type: 'settle', id: a.id, status: { state: 'ready', kind: 'avac', data: {} } })
    expect(state.items[0].status).toEqual({ state: 'ready', kind: 'avac', data: {} })
    state = reducer(state, { type: 'settle', id: 'missing', status: { state: 'error', message: 'x' } }) // a removed file's late result is a no-op
    expect(state.items).toHaveLength(2)
    state = reducer(state, { type: 'remove', id: a.id })
    expect(state.items.map((i) => i.file.name)).toEqual(['p.png'])
  })
})

describe('countItems / readyUploads', () => {
  it('counts per kind and state and returns parsed data per kind in drop order', () => {
    const items = [ready('p1.pdf', 'payslip'), ready('w1.pdf', 'avac'), ready('w2.pdf', 'avac'), newItem(file('x.png', 'image/png')), newItem(file('r.pdf')),
      { ...newItem(file('e.pdf')), status: { state: 'error' as const, message: 'nope' } }]
    expect(countItems(items)).toEqual({ payslips: 1, avacs: 2, reading: 1, skipped: 1, errors: 1, total: 6 })
    expect(readyUploads(items, 'avac')).toEqual([{ kind: 'avac', name: 'w1.pdf', data: { name: 'w1.pdf' } }, { kind: 'avac', name: 'w2.pdf', data: { name: 'w2.pdf' } }])
  })
})

describe('canAnalyze / statusMessage', () => {
  it('needs one of each, nothing still reading, and the caps respected', () => {
    expect(statusMessage(initialState)).toBe('Drop payslips and AVAC PDFs — or a whole folder — to begin.')
    expect(canAnalyze(withItems([ready('p.pdf', 'payslip')]))).toBe(false)
    expect(statusMessage(withItems([ready('p.pdf', 'payslip')]))).toBe('Add at least 1 AVAC to continue.')
    expect(statusMessage(withItems([ready('w.pdf', 'avac')]))).toBe('Add at least 1 payslip to continue.')
    expect(statusMessage(withItems([ready('p.pdf', 'payslip'), newItem(file('r.pdf'))]))).toBe('Reading 1 file…')
    const both = withItems([ready('p.pdf', 'payslip'), ready('w.pdf', 'avac'), newItem(file('x.png', 'image/png')),
      { ...newItem(file('e.pdf')), status: { state: 'error', message: 'nope' } }])
    expect(canAnalyze(both)).toBe(true)
    expect(statusMessage(both)).toBe("Ready: 1 payslip and 1 AVAC. 1 skipped. 1 couldn't be read and won't be included.")
    const tooMany = withItems([...Array.from({ length: 27 }, (_, i) => ready(`p${i}.pdf`, 'payslip')), ready('w.pdf', 'avac')])
    expect(canAnalyze(tooMany)).toBe(false)
    expect(statusMessage(tooMany)).toBe('Too many payslips (27 of 26). Remove some to continue.')
    expect(canAnalyze({ ...both, phase: 'analyzing' })).toBe(false)
  })
})
