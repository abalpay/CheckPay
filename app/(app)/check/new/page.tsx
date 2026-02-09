'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud } from 'lucide-react'

import { startAnalyzeJob } from '@/lib/jobs'
import { saveSessionReport } from '@/lib/session-reports'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  description,
  isDragActive,
  fileLabel,
  getRootProps,
  getInputProps,
  disabled,
}: {
  title: string
  description: string
  isDragActive: boolean
  fileLabel: string
  getRootProps: () => Record<string, unknown>
  getInputProps: () => Record<string, unknown>
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
          } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-8 w-8 text-gray-500" />
          <p className="mt-3 text-sm text-gray-700">
            {isDragActive ? 'Drop files here' : fileLabel}
          </p>
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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 space-y-3">
        <Badge variant="secondary">MVP flow</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Start a New Analysis</h1>
        <p className="text-muted-foreground">
          Upload a payslip plus AVAC forms to generate a report.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Documents</CardTitle>
            <CardDescription>Provide one payslip and one or more AVAC files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Accepted format: PDF</p>
            <p>Max size: 5MB per file</p>
            <p>AVAC limit: {MAX_AVAC_FILES}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analyze Documents</CardTitle>
            <CardDescription>
              Files are sent to the FastAPI backend and a report is shown immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>FastAPI endpoint: /api/reconcile</p>
            <p>Reports are temporary and cleared on refresh.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UploadCard
          title="Payslip"
          description="Drop your payslip PDF"
          isDragActive={payslipDropzone.isDragActive}
          fileLabel={state.payslipFile ? state.payslipFile.name : 'Drop payslip PDF or click to choose'}
          getRootProps={payslipDropzone.getRootProps}
          getInputProps={payslipDropzone.getInputProps}
          disabled={state.isAnalyzing}
        />

        <UploadCard
          title="AVAC Forms"
          description="Drop one or more AVAC PDFs"
          isDragActive={avacDropzone.isDragActive}
          fileLabel={
            state.avacFiles.length > 0
              ? `${state.avacFiles.length} AVAC file(s) selected`
              : 'Drop AVAC PDFs or click to choose'
          }
          getRootProps={avacDropzone.getRootProps}
          getInputProps={avacDropzone.getInputProps}
          disabled={state.isAnalyzing}
        />
      </div>

      {state.avacFiles.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Selected AVAC files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.avacFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border p-3">
                <span className="inline-flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-blue-600" />
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAvacFile(index)}
                  disabled={state.isAnalyzing}
                >
                  Remove
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={handleAnalyze} disabled={!canAnalyze}>
          {state.isAnalyzing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Start analysis
            </span>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => dispatch({ type: 'reset' })}
          disabled={state.isAnalyzing}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
