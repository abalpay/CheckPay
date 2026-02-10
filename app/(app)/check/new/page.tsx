'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  LockKeyhole,
  ScanSearch,
  UploadCloud,
  X,
} from 'lucide-react'

import { startAnalyzeJob } from '@/lib/jobs'
import { saveSessionReport } from '@/lib/session-reports'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_AVAC_FILES = 10

type Phase = 'idle' | 'analyzing' | 'done'

type UploadType = 'payslip' | 'avac'
type StepState = 'pending' | 'active' | 'complete'

type State = {
  payslipFile: File | null
  avacFiles: File[]
  phase: Phase
  error: string | null
}

type Action =
  | { type: 'set_payslip'; file: File | null }
  | { type: 'set_avacs'; files: File[] }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_phase'; value: Phase }
  | { type: 'reset' }

const initialState: State = {
  payslipFile: null,
  avacFiles: [],
  phase: 'idle',
  error: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_payslip':
      return { ...state, payslipFile: action.file, error: null }
    case 'set_avacs':
      return { ...state, avacFiles: action.files, error: null }
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

function validatePdfFile(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return `${file.name} must be a PDF`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} is too large (max 5MB)`
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
          <span className="cp-mono rounded-full border border-[var(--cp-border)] bg-white px-2.5 py-1 text-[11px] text-[var(--cp-text-secondary)]">
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
              <p className="mt-1 text-xs text-[var(--cp-text-secondary)]">Click or drop to replace</p>
            </>
          ) : (
            <>
              <UploadCloud className="mx-auto h-8 w-8 text-[var(--cp-text-secondary)]/70" />
              <p className="mt-3 text-sm font-medium text-[var(--cp-text-primary)]">
                {isDragActive ? 'Drop files here' : fileLabel}
              </p>
              <p className="mt-1 text-xs text-[var(--cp-text-secondary)]">PDF only, max 5 MB</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function NewAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const router = useRouter()

  const onPayslipDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    const error = validatePdfFile(file)
    if (error) {
      dispatch({ type: 'set_error', value: error })
      return
    }
    dispatch({ type: 'set_payslip', file })
  }, [])

  const onAvacDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length + state.avacFiles.length > MAX_AVAC_FILES) {
        dispatch({ type: 'set_error', value: `Maximum ${MAX_AVAC_FILES} AVAC files allowed` })
        return
      }

      const validFiles: File[] = []
      for (const file of acceptedFiles) {
        const error = validatePdfFile(file)
        if (error) {
          dispatch({ type: 'set_error', value: error })
          return
        }
        validFiles.push(file)
      }

      dispatch({ type: 'set_avacs', files: [...state.avacFiles, ...validFiles] })
    },
    [state.avacFiles]
  )

  const payslipDropzone = useDropzone({
    onDrop: onPayslipDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: state.phase !== 'idle',
  })

  const avacDropzone = useDropzone({
    onDrop: onAvacDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: MAX_AVAC_FILES,
    disabled: state.phase !== 'idle',
  })

  const canAnalyze = useMemo(() => {
    return Boolean(state.payslipFile && state.avacFiles.length > 0 && state.phase === 'idle')
  }, [state.avacFiles.length, state.phase, state.payslipFile])

  const removeAvacFile = useCallback(
    (index: number) => {
      dispatch({
        type: 'set_avacs',
        files: state.avacFiles.filter((_, i) => i !== index),
      })
    },
    [state.avacFiles]
  )

  const removeAllAvacFiles = useCallback(() => {
    dispatch({ type: 'set_avacs', files: [] })
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!state.payslipFile || state.avacFiles.length === 0 || state.phase !== 'idle') return

    dispatch({ type: 'set_error', value: null })
    dispatch({ type: 'set_phase', value: 'analyzing' })

    try {
      const analysis = await startAnalyzeJob({
        payslip: state.payslipFile,
        avacs: state.avacFiles,
      })

      const reportId = saveSessionReport(analysis)
      dispatch({ type: 'set_phase', value: 'done' })
      setTimeout(() => router.push(`/check/report/${reportId}`), 1200)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed. Please try again.'
      dispatch({ type: 'set_error', value: message })
      dispatch({ type: 'set_phase', value: 'idle' })
    }
  }, [router, state.avacFiles, state.phase, state.payslipFile])

  const uploadDone = Boolean(state.payslipFile && state.avacFiles.length > 0)
  const steps = useMemo(
    () =>
      [
        {
          key: 'upload',
          label: 'Upload',
          state: (uploadDone ? 'complete' : 'active') as StepState,
        },
        {
          key: 'analyze',
          label: 'Analyze',
          state: (
            state.phase === 'done'
              ? 'complete'
              : state.phase === 'analyzing' || uploadDone
                ? 'active'
                : 'pending'
          ) as StepState,
        },
        {
          key: 'report',
          label: 'Report',
          state: (state.phase === 'done' ? 'active' : 'pending') as StepState,
        },
      ] as const,
    [state.phase, uploadDone],
  )

  const progressPercent = useMemo(() => {
    if (state.phase === 'done') return 100
    if (state.phase === 'analyzing') return 70
    if (uploadDone) return 45
    return 20
  }, [state.phase, uploadDone])

  const currentStepLabel = useMemo(() => {
    if (state.phase === 'done') return 'Step 3 of 3 · Report'
    if (state.phase === 'analyzing') return 'Step 2 of 3 · Analyze'
    if (uploadDone) return 'Step 2 of 3 · Analyze'
    return 'Step 1 of 3 · Upload'
  }, [state.phase, uploadDone])

  const phaseMessage = useMemo(() => {
    if (state.phase === 'analyzing') {
      return 'Please keep this tab open while analysis runs.'
    }

    if (state.phase === 'done') {
      return 'Analysis complete. Redirecting to your report.'
    }

    if (!canAnalyze) {
      return 'Upload 1 payslip and at least 1 AVAC to continue.'
    }

    return 'Ready to analyze your files.'
  }, [canAnalyze, state.phase])

  const trustPills = [
    { icon: LockKeyhole, label: 'No account required' },
    { icon: ScanSearch, label: 'PDF only · Max 5 MB each' },
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
              Upload 1 payslip and up to 10 AVAC PDFs. CheckPay compares expected vs paid overtime in
              about a minute.
            </p>
          </div>

          <div className="cp-reveal cp-reveal-delay-3 mx-auto mt-9 max-w-3xl">
            <div className="h-1 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full bg-[var(--cp-accent)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <ol className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Analysis progress">
              {steps.map((step, index) => (
                <li key={step.key} className="flex items-center gap-2 text-left">
                  <span
                    className={cn(
                      'cp-mono inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
                      step.state === 'complete'
                        ? 'border-[var(--cp-accent)] bg-white text-[var(--cp-accent)]'
                        : step.state === 'active'
                          ? 'border-white/70 bg-white/10 text-white'
                          : 'border-white/30 bg-black/10 text-[#D4D4D4]',
                    )}
                  >
                    {step.state === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : step.key === 'analyze' && state.phase === 'analyzing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium transition-colors',
                      step.state === 'complete'
                        ? 'text-[var(--cp-accent)]'
                        : step.state === 'active'
                          ? 'text-[#FAFAF9]'
                          : 'text-[#C8C8C8]',
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 pt-6 sm:px-6">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {trustPills.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="cp-mono flex items-center justify-center gap-2 rounded-full border border-[var(--cp-border)] bg-[var(--cp-accent-subtle)] px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--cp-accent)]" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 max-w-5xl">
          {state.error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <UploadCard
              title="Payslip"
              hint="One payslip PDF"
              helper="One file required"
              kind="payslip"
              isDragActive={payslipDropzone.isDragActive}
              hasFile={Boolean(state.payslipFile)}
              fileLabel={
                state.payslipFile ? state.payslipFile.name : 'Drop payslip PDF or click to choose'
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

          {state.avacFiles.length > 0 && (
            <Card className="mt-6 rounded-2xl border-[var(--cp-border)] bg-[var(--cp-bg-primary)]">
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="text-sm font-semibold text-[var(--cp-text-primary)]">
                  Selected AVAC files ({state.avacFiles.length}/{MAX_AVAC_FILES})
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={removeAllAvacFiles}
                  disabled={state.phase !== 'idle'}
                  className="h-8 px-2 text-xs text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]"
                >
                  Remove all
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {state.avacFiles.map((file, index) => (
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
                      onClick={() => removeAvacFile(index)}
                      disabled={state.phase !== 'idle'}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--cp-text-secondary)] transition hover:border-[var(--cp-border)] hover:bg-[var(--cp-accent-subtle)] hover:text-[var(--cp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="h-11 w-full rounded-md bg-[var(--cp-accent)] px-8 text-white transition duration-150 hover:scale-[1.01] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_10px_24px_rgba(0,87,255,0.28)] sm:w-auto"
              >
                {state.phase === 'analyzing' ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing Files...
                  </span>
                ) : state.phase === 'done' ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening Report...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Analyze Files
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
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

            <p className="cp-mono mt-3 text-[11px] uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
              {currentStepLabel}
            </p>

            <p
              className="mt-1 text-sm text-[var(--cp-text-secondary)]"
              aria-live="polite"
              data-testid="analysis-status-message"
            >
              {phaseMessage}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
