'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, ArrowRight, Clock3, Eye, FolderOpen, LockKeyhole, ScanSearch, UploadCloud } from 'lucide-react'

import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, fileDigest, parseUpload, startAnalyzeJob, withParseSlot } from '@/lib/jobs'
import { SAMPLE_REPORT_ROUTE } from '@/lib/sample-report'
import { saveSessionReport } from '@/lib/session-reports'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { AnalysisProgress } from './AnalysisProgress'
import { FileList } from './FileList'
import {
  canAnalyze, countItems, initialState, MAX_FILES_PER_DROP, newItem, readyUploads, reducer, SKIP_NOT_RECOGNISED,
  skipDuplicateOf, statusMessage, type UploadItem, type UploadStatus,
} from './upload-state'

// Short "Report ready" beat before navigating; long enough to register, not a fake wait.
const READY_BEAT_MS = 400

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'Something went wrong. Please try again.'
}

export default function NewAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const router = useRouter()
  const errorRef = useRef<HTMLDivElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const prevPhaseRef = useRef(state.phase)
  const runIdRef = useRef(0)
  // digest -> the item that owns it; a byte-identical later file is skipped until that item is removed.
  const digestOwners = useRef(new Map<string, { id: string; name: string }>())
  // Ids of items still in state. A file removed while queued for a parse slot (or mid-hash) must not
  // go on to hash/parse/claim ownership on a ghost id — otherwise a re-drop of the same bytes gets
  // wrongly skipped as "same file as" an item that no longer exists.
  const liveIds = useRef(new Set<string>())

  useEffect(() => {
    if (prevPhaseRef.current === 'analyzing' && state.phase === 'idle' && state.error) errorRef.current?.focus()
    prevPhaseRef.current = state.phase
  }, [state.error, state.phase])

  const releaseOwnershipOf = useCallback((id: string) => {
    for (const [digest, owner] of digestOwners.current) if (owner.id === id) digestOwners.current.delete(digest)
  }, [])

  const readItem = useCallback(async (item: UploadItem) => {
    const settle = (status: UploadStatus) => dispatch({ type: 'settle', id: item.id, status })
    try {
      await withParseSlot(async () => {
        if (!liveIds.current.has(item.id)) return // removed while queued for a parse slot
        const digest = await fileDigest(item.file)
        if (!liveIds.current.has(item.id)) return // removed while hashing, before claiming ownership
        const owner = digestOwners.current.get(digest)
        if (owner && owner.id !== item.id) return settle({ state: 'skipped', reason: skipDuplicateOf(owner.name) })
        digestOwners.current.set(digest, { id: item.id, name: item.file.name })
        const parsed = await parseUpload(item.file)
        settle(parsed.kind === 'unknown'
          ? { state: 'skipped', reason: SKIP_NOT_RECOGNISED }
          : { state: 'ready', kind: parsed.kind, data: parsed.data })
      })
    } catch (error) {
      // Release ownership so a re-drop of the same bytes retries instead of being skipped as a
      // duplicate of a file that failed and won't be in the run.
      releaseOwnershipOf(item.id)
      settle({ state: 'error', message: messageOf(error) })
    }
  }, [releaseOwnershipOf])

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    const combined = files.length + state.items.length
    if (combined > MAX_FILES_PER_DROP) {
      const already = state.items.length > 0 ? ` (you already have ${state.items.length})` : ''
      dispatch({ type: 'set_error', value: `That's ${combined} files${already}. CheckPay reads up to ${MAX_FILES_PER_DROP} at a time — a year is about 80.` })
      return
    }
    const items = files.map(newItem)
    for (const item of items) liveIds.current.add(item.id)
    dispatch({ type: 'add_files', items })
    for (const item of items) if (item.status.state === 'reading') void readItem(item)
  }, [readItem, state.items.length])

  const removeItem = useCallback((id: string) => {
    liveIds.current.delete(id)
    releaseOwnershipOf(id)
    dispatch({ type: 'remove', id })
  }, [releaseOwnershipOf])

  const removeAll = useCallback(() => {
    liveIds.current.clear()
    digestOwners.current.clear()
    dispatch({ type: 'reset' })
  }, [])

  const dropzone = useDropzone({
    // Rejected files (wrong type) still go through addFiles so each gets its own skip note.
    onDrop: (accepted, rejected) => addFiles([...accepted, ...rejected.map((r) => r.file)]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: state.phase !== 'idle',
  })

  const counts = countItems(state.items)
  const ready = canAnalyze(state)

  // The visible status line changes on every settle (fine to see, too noisy to hear — a folder's worth
  // of files would fire ~80 screen reader announcements). Announce only when the category changes
  // (idle/reading/settled), with a constant phrase while reading; the running count stays visible-only.
  const category = counts.total === 0 ? 'idle' : counts.reading > 0 ? 'reading' : 'settled'
  const prevCategoryRef = useRef(category)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (prevCategoryRef.current === category) return
    prevCategoryRef.current = category
    setAnnouncement(category === 'reading' ? 'Reading your files…' : statusMessage(state))
  }, [category, state])

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze(state)) return
    const payslips = readyUploads(state.items, 'payslip')
    const avacs = readyUploads(state.items, 'avac')
    dispatch({ type: 'set_error', value: null })
    dispatch({ type: 'set_phase', value: 'analyzing' })
    const runId = ++runIdRef.current
    try {
      const analysis = await startAnalyzeJob({ payslips, avacs })
      if (runIdRef.current !== runId) return
      const reportId = saveSessionReport(analysis)
      dispatch({ type: 'set_phase', value: 'done' })
      setTimeout(() => router.push(`/check/report/${reportId}`), READY_BEAT_MS)
    } catch (error) {
      if (runIdRef.current !== runId) return
      dispatch({ type: 'set_error', value: messageOf(error) })
      dispatch({ type: 'set_phase', value: 'idle' })
    }
  }, [router, state])

  const trustPills = [
    { icon: LockKeyhole, label: 'No account required' },
    { icon: ScanSearch, label: `PDF only · Up to ${MAX_AVAC_FILES} AVACs` },
    { icon: Clock3, label: 'Temporary session report' },
  ]

  return (
    <div className="pb-12 md:pb-16">
      <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
        <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(105%_65%_at_50%_4%,rgba(0,87,255,0.22),transparent_70%)]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[1120px] px-4 pb-10 pt-24 sm:px-6 md:pb-12 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="cp-reveal inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
              QH Overtime Assistant
            </p>
            <h1 className="cp-display cp-reveal cp-reveal-delay-1 mt-5 text-[clamp(2rem,5.3vw,3.25rem)] leading-[1.06]">
              Start Your Free Analysis
            </h1>
            <p className="cp-reveal cp-reveal-delay-2 mx-auto mt-4 max-w-[68ch] text-[15px] leading-relaxed text-[#C8C8C8] md:text-base">
              Drop a year of payslips and AVAC PDFs — or the folder they live in. CheckPay sorts them, then
              compares expected vs paid overtime in about a minute.
            </p>

            <div className="cp-reveal cp-reveal-delay-3 mx-auto mt-7 max-w-2xl rounded-2xl border border-[var(--cp-accent)]/35 bg-[var(--cp-accent-subtle)] p-4 text-left shadow-[0_14px_30px_rgba(0,87,255,0.18)] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--cp-accent)] shadow-sm">
                    <Eye className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="cp-mono text-[11px] uppercase tracking-[0.08em] text-[var(--cp-accent)]">
                      Try before upload
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0F203A]">
                      Preview a sample reconciliation report
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#2D456A]">
                      Uses fictional data so you can preview report structure and outcomes.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  asChild
                  className="h-10 w-full rounded-md bg-[var(--cp-accent)] px-5 text-white hover:bg-[var(--cp-accent-hover)] sm:w-auto"
                >
                  <Link href={SAMPLE_REPORT_ROUTE}>Open sample report</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="cp-reveal cp-reveal-delay-4 mt-10 border-t border-white/15 pt-8">
            <ul className="mx-auto grid max-w-[760px] gap-3 sm:grid-cols-3">
              {trustPills.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="cp-mono inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-[#D9D9D9]"
                >
                  <Icon className="h-3.5 w-3.5 text-[var(--cp-accent)]" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {state.error && (
            <Alert ref={errorRef} tabIndex={-1} variant="destructive" className="mb-6 outline-none">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {state.phase !== 'idle' ? (
            <AnalysisProgress payslipCount={counts.payslips} avacCount={counts.avacs} ready={state.phase === 'done'} />
          ) : (
            <>
              <div
                {...dropzone.getRootProps()}
                className={cn(
                  'rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                  dropzone.isDragActive ? 'border-[var(--cp-accent)] bg-[var(--cp-accent-subtle)]' : 'border-[var(--cp-border)] bg-[#F7F6F3]',
                  'cursor-pointer hover:border-[var(--cp-accent)]/60 hover:bg-[var(--cp-accent-subtle)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2',
                )}
              >
                <input {...dropzone.getInputProps()} />
                <UploadCloud className="mx-auto h-8 w-8 text-[var(--cp-text-secondary)]/70" aria-hidden />
                <p className="mt-3 text-base font-semibold text-[var(--cp-text-primary)]">
                  {dropzone.isDragActive ? 'Drop them here' : 'Drop payslips and AVAC PDFs here'}
                </p>
                <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
                  A whole folder works too — CheckPay tells payslips from AVACs and skips the rest.
                </p>
                <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="h-10 gap-2" onClick={(e) => { e.stopPropagation(); dropzone.open() }}>
                    Choose files
                  </Button>
                  <Button type="button" variant="outline" className="h-10 gap-2" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}>
                    <FolderOpen className="h-4 w-4" aria-hidden />
                    Choose a folder
                  </Button>
                </div>
                <p className="cp-mono mt-4 text-[11px] uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
                  PDF · up to {MAX_PAYSLIP_FILES} payslips and {MAX_AVAC_FILES} AVACs · 4 MB each
                </p>
              </div>
              {/* The folder chooser is a plain input: react-dropzone has no directory mode. */}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                tabIndex={-1}
                aria-hidden
                className="sr-only"
                data-testid="folder-input"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
                {...({ webkitdirectory: '' } as Record<string, string>)}
              />

              <FileList items={state.items} counts={counts} disabled={false} onRemove={removeItem} onRemoveAll={removeAll} />

              <div className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleAnalyze}
                    disabled={!ready}
                    className="h-11 w-full rounded-md bg-[var(--cp-accent)] px-8 text-white transition duration-150 hover:scale-[1.01] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_10px_24px_rgba(0,87,255,0.28)] sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-2">
                      Analyse Files
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>
                  <Button type="button" variant="ghost" onClick={removeAll} className="text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]">
                    Reset
                  </Button>
                </div>
                <p className="mt-3 text-sm text-[var(--cp-text-secondary)]" data-testid="analysis-status-message">
                  {statusMessage(state)}
                </p>
                <p role="status" aria-live="polite" className="sr-only" data-testid="analysis-status-announcement">
                  {announcement}
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
