'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  LockKeyhole,
  ScanSearch,
  UploadCloud,
  X,
} from 'lucide-react'

import {
  MAX_AVAC_FILES,
  MAX_PAYSLIP_FILES,
  MAX_REQUEST_BYTES,
  startAnalyzeJob,
  type AnalyzeProgressEvent,
} from '@/lib/jobs'
import { SAMPLE_REPORT_ROUTE } from '@/lib/sample-report'
import { saveSessionReport } from '@/lib/session-reports'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { AnalysisProgress, type AvacProgressState } from './AnalysisProgress'

// Short "Report ready" beat before navigating; long enough to register, not a fake wait.
const READY_BEAT_MS = 400

type Phase = 'idle' | 'analyzing' | 'done'

type UploadType = 'payslip' | 'avac'

const FILE_LIMITS: Record<UploadType, { max: number; noun: string }> = {
  payslip: { max: MAX_PAYSLIP_FILES, noun: 'payslips' },
  avac: { max: MAX_AVAC_FILES, noun: 'AVAC files' },
}

type State = {
  payslipFiles: File[]
  avacFiles: File[]
  phase: Phase
  error: string | null
  progress: AvacProgressState[]
  payslipsRead: number
}

type Action =
  | { type: 'add_files'; kind: UploadType; files: File[] }
  | { type: 'remove_file'; kind: UploadType; index: number }
  | { type: 'clear_files'; kind: UploadType }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_phase'; value: Phase }
  | { type: 'start_analysis' }
  | { type: 'avac_settled'; event: AnalyzeProgressEvent }
  | { type: 'payslip_read'; read: number }
  | { type: 'reset' }

const initialState: State = {
  payslipFiles: [],
  avacFiles: [],
  phase: 'idle',
  error: null,
  progress: [],
  payslipsRead: 0,
}

function filesOf(state: State, kind: UploadType): File[] {
  return kind === 'payslip' ? state.payslipFiles : state.avacFiles
}

function withFiles(state: State, kind: UploadType, files: File[]): State {
  return kind === 'payslip' ? { ...state, payslipFiles: files, error: null } : { ...state, avacFiles: files, error: null }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add_files': {
      const current = filesOf(state, action.kind)
      const { max, noun } = action.kind === 'payslip' ? FILE_LIMITS.payslip : FILE_LIMITS.avac
      if (current.length + action.files.length > max) {
        return { ...state, error: `Maximum ${max} ${noun} allowed` }
      }
      return withFiles(state, action.kind, [...current, ...action.files])
    }
    case 'remove_file':
      return withFiles(state, action.kind, filesOf(state, action.kind).filter((_, i) => i !== action.index))
    case 'clear_files':
      return withFiles(state, action.kind, [])
    case 'set_error':
      return { ...state, error: action.value }
    case 'set_phase':
      return { ...state, phase: action.value }
    case 'start_analysis':
      return {
        ...state,
        phase: 'analyzing',
        error: null,
        progress: state.avacFiles.map(() => ({ state: 'pending' })),
        payslipsRead: 0,
      }
    case 'avac_settled': {
      const { index, state: settled, message } = action.event
      const next: AvacProgressState = settled === 'error' ? { state: 'error', message } : { state: 'done' }
      return { ...state, progress: state.progress.map((p, i) => (i === index ? next : p)) }
    }
    case 'payslip_read':
      return { ...state, payslipsRead: action.read }
    case 'reset':
      return initialState
    default:
      return state
  }
}

function validatePdfFile(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return `${file.name} must be a PDF`
  }
  if (file.size > MAX_REQUEST_BYTES) {
    return `${file.name} is too large (max 4MB)`
  }
  return null
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function UploadCard({
  title,
  hint,
  helper,
  kind,
  isDragActive,
  hasFile,
  fileLabel,
  statusLabel,
  getRootProps,
  getInputProps,
  disabled,
}: {
  title: string
  hint: string
  helper: string
  kind: UploadType
  isDragActive: boolean
  hasFile: boolean
  fileLabel: string
  statusLabel?: string
  getRootProps: () => Record<string, unknown>
  getInputProps: () => Record<string, unknown>
  disabled: boolean
}) {
  const isPrimary = kind === 'payslip'

  return (
    <Card
      className={cn(
        'rounded-2xl border-[var(--cp-border)] bg-[var(--cp-bg-primary)] shadow-[0_10px_25px_rgba(26,26,26,0.05)] transition-all duration-200',
        hasFile && 'ring-1 ring-[var(--cp-accent)]/30',
        isPrimary && 'md:shadow-[0_14px_34px_rgba(0,87,255,0.08)]',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
              hasFile
                ? 'border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]'
                : 'border-[var(--cp-border)] bg-[#F3F3F1] text-[var(--cp-text-secondary)]',
            )}
          >
            {hasFile ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div>
            <CardTitle className="text-lg text-[var(--cp-text-primary)]">{title}</CardTitle>
            <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">{hint}</p>
            <p className="cp-mono mt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
              {helper}
            </p>
          </div>
        </div>

        {statusLabel && (
          <span className="cp-mono shrink-0 whitespace-nowrap rounded-full border border-[var(--cp-border)] bg-white px-2.5 py-1 text-[11px] text-[var(--cp-text-secondary)]">
            {statusLabel}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            'rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            isDragActive && 'border-[var(--cp-accent)] bg-[var(--cp-accent-subtle)]',
            hasFile && !isDragActive && 'border-[var(--cp-accent)]/35 bg-[var(--cp-accent-subtle)]/45',
            !hasFile && !isDragActive && 'border-[var(--cp-border)] bg-[#F7F6F3]',
            disabled
              ? 'opacity-60'
              : 'cursor-pointer hover:border-[var(--cp-accent)]/60 hover:bg-[var(--cp-accent-subtle)]/25',
          )}
        >
          <input {...getInputProps()} />
          {hasFile ? (
            <>
                <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--cp-accent)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--cp-text-primary)]">{fileLabel}</p>
                <p className="mt-1 text-xs text-[var(--cp-text-secondary)]">Click or drop to add more</p>
            </>
          ) : (
            <>
              <UploadCloud className="mx-auto h-8 w-8 text-[var(--cp-text-secondary)]/70" />
              <p className="mt-3 text-sm font-medium text-[var(--cp-text-primary)]">
                {isDragActive ? 'Drop files here' : fileLabel}
              </p>
              <p className="mt-1 text-xs text-[var(--cp-text-secondary)]">PDF only, max 4 MB</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SelectedFiles({
  title,
  files,
  max,
  onRemove,
  onRemoveAll,
}: {
  title: string
  files: File[]
  max: number
  onRemove: (index: number) => void
  onRemoveAll: () => void
}) {
  if (files.length === 0) return null
  return (
    <Card className="mt-6 rounded-2xl border-[var(--cp-border)] bg-[var(--cp-bg-primary)]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-sm font-semibold text-[var(--cp-text-primary)]">
          {title} ({files.length}/{max})
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemoveAll}
          className="h-8 px-2 text-xs text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]"
        >
          Remove all
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--cp-border)] bg-white px-3 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-[var(--cp-accent)]" />
              <span className="truncate font-medium text-[var(--cp-text-primary)]">{file.name}</span>
              <span className="cp-mono shrink-0 text-[11px] text-[var(--cp-text-secondary)]">
                {formatFileSize(file.size)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--cp-text-secondary)] transition hover:border-[var(--cp-border)] hover:bg-[var(--cp-accent-subtle)] hover:text-[var(--cp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function NewAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const router = useRouter()
  const errorRef = useRef<HTMLDivElement>(null)
  const prevPhaseRef = useRef<Phase>(state.phase)
  // Parses of a failed run keep settling; only the latest run may tick the progress panel.
  const runIdRef = useRef(0)

  // When a run fails the progress panel unmounts; move focus to the error that replaced it.
  useEffect(() => {
    if (prevPhaseRef.current === 'analyzing' && state.phase === 'idle' && state.error) {
      errorRef.current?.focus()
    }
    prevPhaseRef.current = state.phase
  }, [state.error, state.phase])

  const addFiles = useCallback((kind: UploadType, acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    for (const file of acceptedFiles) {
      const error = validatePdfFile(file)
      if (error) {
        dispatch({ type: 'set_error', value: error })
        return
      }
    }
    dispatch({ type: 'add_files', kind, files: acceptedFiles })
  }, [])

  const onPayslipDrop = useCallback((files: File[]) => addFiles('payslip', files), [addFiles])
  const onAvacDrop = useCallback((files: File[]) => addFiles('avac', files), [addFiles])

  // No dropzone maxFiles: the reducer enforces the limit so an oversized drop shows an error instead of vanishing.
  const payslipDropzone = useDropzone({
    onDrop: onPayslipDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: state.phase !== 'idle',
  })

  const avacDropzone = useDropzone({
    onDrop: onAvacDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: state.phase !== 'idle',
  })

  const canAnalyze = state.payslipFiles.length > 0 && state.avacFiles.length > 0 && state.phase === 'idle'

  const handleAnalyze = useCallback(async () => {
    if (state.payslipFiles.length === 0 || state.avacFiles.length === 0 || state.phase !== 'idle') return

    dispatch({ type: 'start_analysis' })
    const runId = ++runIdRef.current
    const isCurrent = () => runIdRef.current === runId

    try {
      const analysis = await startAnalyzeJob({
        payslips: state.payslipFiles,
        avacs: state.avacFiles,
        onProgress: (event) => {
          if (isCurrent()) dispatch({ type: 'avac_settled', event })
        },
        onPayslipRead: (read) => {
          if (isCurrent()) dispatch({ type: 'payslip_read', read })
        },
      })

      const reportId = saveSessionReport(analysis)
      dispatch({ type: 'set_phase', value: 'done' })
      setTimeout(() => router.push(`/check/report/${reportId}`), READY_BEAT_MS)
    } catch (error) {
      // startAnalyzeJob throws plain { message } objects as well as Errors.
      const message = (error as { message?: unknown } | null)?.message
      dispatch({
        type: 'set_error',
        value: typeof message === 'string' && message ? message : 'Analysis failed. Please try again.',
      })
      dispatch({ type: 'set_phase', value: 'idle' })
    }
  }, [router, state.avacFiles, state.phase, state.payslipFiles])

  const payslipLabel =
    state.payslipFiles.length === 1 ? state.payslipFiles[0].name : `${state.payslipFiles.length} payslips`

  const phaseMessage = canAnalyze
    ? 'Ready to analyse your files.'
    : 'Upload at least 1 payslip and 1 AVAC to continue.'

  const trustPills = [
    { icon: LockKeyhole, label: 'No account required' },
    { icon: ScanSearch, label: 'PDF only · Up to 10 AVACs' },
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
              Upload your payslips and up to 10 AVAC PDFs. CheckPay compares expected vs paid overtime in
              about a minute.
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
            <AnalysisProgress
              payslipName={payslipLabel}
              payslipCount={state.payslipFiles.length}
              payslipsRead={state.payslipsRead}
              avacNames={state.avacFiles.map((f) => f.name)}
              progress={state.progress}
              ready={state.phase === 'done'}
            />
          ) : (
            <>
            <div className="grid gap-6 md:grid-cols-2">
              <UploadCard
                title="Payslips"
                hint="Upload the payslip that paid your adjustments and the payslip for the fortnight the AVAC covers — page 1 of that one shows rostered overtime."
                helper={`PDF · 1–${MAX_PAYSLIP_FILES} files`}
                kind="payslip"
                statusLabel={`${state.payslipFiles.length}/${MAX_PAYSLIP_FILES} selected`}
                isDragActive={payslipDropzone.isDragActive}
                hasFile={state.payslipFiles.length > 0}
                fileLabel={
                  state.payslipFiles.length > 0
                    ? `${state.payslipFiles.length} payslip${state.payslipFiles.length > 1 ? 's' : ''} selected`
                    : 'Drop payslip PDFs or click to choose'
                }
                getRootProps={payslipDropzone.getRootProps}
                getInputProps={payslipDropzone.getInputProps}
                disabled={state.phase !== 'idle'}
              />

              <UploadCard
                title="AVAC Forms"
                hint={`Up to ${MAX_AVAC_FILES} AVAC PDFs`}
                helper="At least one file required"
                kind="avac"
                statusLabel={`${state.avacFiles.length}/${MAX_AVAC_FILES} selected`}
                isDragActive={avacDropzone.isDragActive}
                hasFile={state.avacFiles.length > 0}
                fileLabel={
                  state.avacFiles.length > 0
                    ? `${state.avacFiles.length} file${state.avacFiles.length > 1 ? 's' : ''} selected`
                    : 'Drop AVAC PDFs or click to choose'
                }
                getRootProps={avacDropzone.getRootProps}
                getInputProps={avacDropzone.getInputProps}
                disabled={state.phase !== 'idle'}
              />
            </div>

            <SelectedFiles
              title="Selected payslips"
              files={state.payslipFiles}
              max={MAX_PAYSLIP_FILES}
              onRemove={(index) => dispatch({ type: 'remove_file', kind: 'payslip', index })}
              onRemoveAll={() => dispatch({ type: 'clear_files', kind: 'payslip' })}
            />
            <SelectedFiles
              title="Selected AVAC files"
              files={state.avacFiles}
              max={MAX_AVAC_FILES}
              onRemove={(index) => dispatch({ type: 'remove_file', kind: 'avac', index })}
              onRemoveAll={() => dispatch({ type: 'clear_files', kind: 'avac' })}
            />

            <div className="mt-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  size="lg"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                  className="h-11 w-full rounded-md bg-[var(--cp-accent)] px-8 text-white transition duration-150 hover:scale-[1.01] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_10px_24px_rgba(0,87,255,0.28)] sm:w-auto"
                >
                  <span className="inline-flex items-center gap-2">
                    Analyse Files
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => dispatch({ type: 'reset' })}
                  disabled={state.phase !== 'idle'}
                  className="text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]"
                >
                  Reset
                </Button>
              </div>

              <p
                className="mt-3 text-sm text-[var(--cp-text-secondary)]"
                aria-live="polite"
                data-testid="analysis-status-message"
              >
                {phaseMessage}
              </p>
            </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
