'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, UploadCloud, X } from 'lucide-react'

import { startAnalyzeJob } from '@/lib/jobs'
import { saveSessionReport } from '@/lib/session-reports'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_AVAC_FILES = 10

type State = {
  payslipFile: File | null
  avacFiles: File[]
  isAnalyzing: boolean
  error: string | null
}

type Action =
  | { type: 'set_payslip'; file: File | null }
  | { type: 'set_avacs'; files: File[] }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_analyzing'; value: boolean }
  | { type: 'reset' }

const initialState: State = {
  payslipFile: null,
  avacFiles: [],
  isAnalyzing: false,
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
    case 'set_analyzing':
      return { ...state, isAnalyzing: action.value }
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

function UploadCard({
  title,
  hint,
  isDragActive,
  hasFile,
  fileLabel,
  getRootProps,
  getInputProps,
  disabled,
}: {
  title: string
  hint: string
  isDragActive: boolean
  hasFile: boolean
  fileLabel: string
  getRootProps: () => Record<string, unknown>
  getInputProps: () => Record<string, unknown>
  disabled: boolean
}) {
  return (
    <Card className={cn(
      'transition-shadow',
      hasFile && 'ring-1 ring-emerald-200',
    )}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          hasFile ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground',
        )}>
          {hasFile ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            'rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            isDragActive && 'border-primary bg-primary/5',
            hasFile && !isDragActive && 'border-emerald-300 bg-emerald-50/50',
            !hasFile && !isDragActive && 'border-muted-foreground/25 bg-muted/40',
            disabled ? 'opacity-60' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/60',
          )}
        >
          <input {...getInputProps()} />
          {hasFile ? (
            <>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 text-sm font-medium text-emerald-700">{fileLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Click or drop to replace</p>
            </>
          ) : (
            <>
              <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium text-foreground/80">
                {isDragActive ? 'Drop files here' : fileLabel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">PDF only, max 5 MB</p>
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
    disabled: state.isAnalyzing,
  })

  const avacDropzone = useDropzone({
    onDrop: onAvacDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: MAX_AVAC_FILES,
    disabled: state.isAnalyzing,
  })

  const canAnalyze = useMemo(() => {
    return Boolean(state.payslipFile && state.avacFiles.length > 0 && !state.isAnalyzing)
  }, [state.avacFiles.length, state.isAnalyzing, state.payslipFile])

  const removeAvacFile = useCallback(
    (index: number) => {
      dispatch({
        type: 'set_avacs',
        files: state.avacFiles.filter((_, i) => i !== index),
      })
    },
    [state.avacFiles]
  )

  const handleAnalyze = useCallback(async () => {
    if (!state.payslipFile || state.avacFiles.length === 0 || state.isAnalyzing) return

    dispatch({ type: 'set_error', value: null })
    dispatch({ type: 'set_analyzing', value: true })

    try {
      const analysis = await startAnalyzeJob({
        payslip: state.payslipFile,
        avacs: state.avacFiles,
      })

      const reportId = saveSessionReport(analysis)
      router.push(`/check/report/${reportId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed. Please try again.'
      dispatch({ type: 'set_error', value: message })
      dispatch({ type: 'set_analyzing', value: false })
    }
  }, [router, state.avacFiles, state.isAnalyzing, state.payslipFile])

  const steps = [
    { label: 'Upload', done: Boolean(state.payslipFile && state.avacFiles.length > 0) },
    { label: 'Analyze', done: false },
    { label: 'Report', done: false },
  ]

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">New Analysis</h1>
        <p className="mt-2 text-muted-foreground">
          Upload your payslip and AVAC forms to verify overtime payments.
        </p>

        {/* Step indicator */}
        <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                step.done
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted text-muted-foreground',
              )}>
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn(
                'text-sm font-medium',
                step.done ? 'text-emerald-700' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
          ))}
        </div>
      </div>

      {state.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Upload zones */}
      <div className="grid gap-6 md:grid-cols-2">
        <UploadCard
          title="Payslip"
          hint="One payslip PDF"
          isDragActive={payslipDropzone.isDragActive}
          hasFile={Boolean(state.payslipFile)}
          fileLabel={state.payslipFile ? state.payslipFile.name : 'Drop payslip PDF or click to choose'}
          getRootProps={payslipDropzone.getRootProps}
          getInputProps={payslipDropzone.getInputProps}
          disabled={state.isAnalyzing}
        />

        <UploadCard
          title="AVAC Forms"
          hint={`Up to ${MAX_AVAC_FILES} AVAC PDFs`}
          isDragActive={avacDropzone.isDragActive}
          hasFile={state.avacFiles.length > 0}
          fileLabel={
            state.avacFiles.length > 0
              ? `${state.avacFiles.length} file${state.avacFiles.length > 1 ? 's' : ''} selected`
              : 'Drop AVAC PDFs or click to choose'
          }
          getRootProps={avacDropzone.getRootProps}
          getInputProps={avacDropzone.getInputProps}
          disabled={state.isAnalyzing}
        />
      </div>

      {/* Selected AVAC file list */}
      {state.avacFiles.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected AVAC files ({state.avacFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {state.avacFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
              >
                <span className="inline-flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAvacFile(index)}
                  disabled={state.isAnalyzing}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="px-8"
        >
          {state.isAnalyzing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              Start Analysis
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => dispatch({ type: 'reset' })}
          disabled={state.isAnalyzing}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
