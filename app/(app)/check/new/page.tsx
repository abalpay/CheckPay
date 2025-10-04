'use client'

import { useReducer, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { startAnalyzeJob } from '@/lib/jobs'
import { createClient } from '@/lib/supabase-client'
import type { TablesInsert } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  History,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB (n8n workflow limit)
const MAX_AVAC_FILES = 10

const STATUS_STEPS = [
  {
    label: 'Uploading documents',
    description: 'Securely sending your payslip and AVAC forms',
  },
  {
    label: 'Reconciling claims',
    description: 'Matching AVAC claims to payslip line items',
  },
  {
    label: 'Preparing report',
    description: 'Summarising reconciled and missing claims',
  },
]

const supabase = createClient()

interface UploadState {
  payslipFile: File | null
  avacFiles: File[]
  isAnalyzing: boolean
  error: string | null
  statusIndex: number
  rosteredOvertime: string
  showSuccess: boolean
}

type UploadAction =
  | { type: 'SET_PAYSLIP'; file: File | null }
  | { type: 'SET_AVAC_FILES'; files: File[] }
  | { type: 'SET_ANALYZING'; value: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_STATUS_INDEX'; value: number }
  | { type: 'SET_ROSTERED_OVERTIME'; value: string }
  | { type: 'SET_SHOW_SUCCESS'; value: boolean }
  | { type: 'RESET' }

const initialState: UploadState = {
  payslipFile: null,
  avacFiles: [],
  isAnalyzing: false,
  error: null,
  statusIndex: 0,
  rosteredOvertime: '0',
  showSuccess: false,
}

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'SET_PAYSLIP':
      return { ...state, payslipFile: action.file, error: null }
    case 'SET_AVAC_FILES':
      return { ...state, avacFiles: action.files, error: null }
    case 'SET_ANALYZING':
      return {
        ...state,
        isAnalyzing: action.value,
        error: null,
        statusIndex: action.value ? 0 : 0,
      }
    case 'SET_ERROR':
      return { ...state, error: action.error, isAnalyzing: false, statusIndex: 0 }
    case 'SET_STATUS_INDEX':
      return { ...state, statusIndex: action.value }
    case 'SET_ROSTERED_OVERTIME':
      return { ...state, rosteredOvertime: action.value, error: null }
    case 'SET_SHOW_SUCCESS':
      return { ...state, showSuccess: action.value }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

function validateFile(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return `${file.name} must be a PDF`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} is too large (max 5MB)`
  }
  return null
}

export default function NewAnalysisPage() {
  const [state, dispatch] = useReducer(uploadReducer, initialState)
  const router = useRouter()
  const statusRef = useRef(state.statusIndex)

  useEffect(() => {
    statusRef.current = state.statusIndex
  }, [state.statusIndex])

  const onPayslipDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    const error = validateFile(file)
    if (error) {
      dispatch({ type: 'SET_ERROR', error })
      return
    }

    dispatch({ type: 'SET_PAYSLIP', file })
  }, [])

  const onAvacDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length + state.avacFiles.length > MAX_AVAC_FILES) {
        dispatch({
          type: 'SET_ERROR',
          error: `Maximum ${MAX_AVAC_FILES} AVAC files allowed`,
        })
        return
      }

      const newFiles: File[] = []
      for (const file of acceptedFiles) {
        const error = validateFile(file)
        if (error) {
          dispatch({ type: 'SET_ERROR', error })
          return
        }
        newFiles.push(file)
      }

      dispatch({ type: 'SET_AVAC_FILES', files: [...state.avacFiles, ...newFiles] })
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

  const removeAvacFile = useCallback(
    (index: number) => {
      dispatch({
        type: 'SET_AVAC_FILES',
        files: state.avacFiles.filter((_, i) => i !== index),
      })
    },
    [state.avacFiles]
  )

  const canAnalyze = useMemo(() => {
    return Boolean(state.payslipFile && state.avacFiles.length > 0 && !state.isAnalyzing)
  }, [state.payslipFile, state.avacFiles.length, state.isAnalyzing])

  useEffect(() => {
    if (!state.isAnalyzing) return

    const timers: number[] = []
    STATUS_STEPS.slice(1).forEach((_, index) => {
      const timeoutId = window.setTimeout(() => {
        if (statusRef.current < index + 1) {
          dispatch({ type: 'SET_STATUS_INDEX', value: index + 1 })
        }
      }, (index + 1) * 1600)
      timers.push(timeoutId)
    })

    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [state.isAnalyzing])

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze || !state.payslipFile) return

    dispatch({ type: 'SET_ANALYZING', value: true })

    try {
      const analysis = await startAnalyzeJob({
        payslip: state.payslipFile,
        avacs: state.avacFiles,
        baseOvertimePerDay: 0,
        workingDays: 0,
        rosteredOvertime: parseFloat(state.rosteredOvertime) || 0,
      })

      const summary = analysis.audit_summary
      const insertValues: TablesInsert<'reports'> = {
        report_data: analysis as unknown as import('@/lib/database.types').Json,
        pay_period_label: summary?.pay_period ?? null,
        matched_count: summary?.matched_claims ?? 0,
        unmatched_count: summary?.unmatched_claims ?? 0,
        total_claims: summary?.total_avac_claims ?? 0,
      }

      const { data, error: insertError } = await supabase
        .from('reports')
        .insert(insertValues)
        .select('id')
        .single()

      if (insertError) {
        console.error('Failed to save report to Supabase', insertError)
        throw new Error('We could not save your report. Please try again.')
      }

      const newReportId = data?.id

      if (!newReportId) {
        console.error('Supabase did not return a new report id', data)
        throw new Error('We could not save your report. Please try again.')
      }

      dispatch({ type: 'SET_STATUS_INDEX', value: STATUS_STEPS.length - 1 })
      dispatch({ type: 'SET_SHOW_SUCCESS', value: true })

      setTimeout(() => {
        router.push(`/check/report/${newReportId}`)
      }, 800)
    } catch (error) {
      console.error('Analysis failed', error)
      const message = error instanceof Error ? error.message : 'Analysis failed. Please try again.'
      dispatch({
        type: 'SET_ERROR',
        error: message,
      })
    }
  }, [canAnalyze, router, state.avacFiles, state.payslipFile, state.rosteredOvertime])

  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      {state.isAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/85 p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            </div>
            <div className="mt-6 text-lg font-semibold text-white">
              {STATUS_STEPS[state.statusIndex]?.label ?? STATUS_STEPS[0].label}
            </div>
            <div className="mt-2 text-sm text-white/70">
              {STATUS_STEPS[state.statusIndex]?.description ?? STATUS_STEPS[0].description}
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-white/40">
              Analysis In Progress
            </div>
            <div className="mt-6 flex justify-center gap-3">
              {STATUS_STEPS.map((step, index) => {
                const isActive = index === state.statusIndex
                const isComplete = index < state.statusIndex
                return (
                  <div key={step.label} className="flex flex-col items-center">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full transition-colors duration-300',
                        isActive ? 'bg-white' : isComplete ? 'bg-white/60' : 'bg-white/30'
                      )}
                    />
                    <span className="mt-2 text-xs text-white/50">
                      {step.label.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mb-10 space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          <Sparkles className="h-3.5 w-3.5" />
          CheckPay MVP Analysis
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Start a New Analysis</h1>
        <p className="text-muted-foreground">
          Upload your payslip and AVAC forms. We reconcile every claim against the payslip and highlight anything that is missing.
        </p>
      </div>

      {state.showSuccess && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Documents uploaded successfully. Redirecting to your report…
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Documents
            </CardTitle>
            <CardDescription>
              A payslip PDF and at least one AVAC form are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-2 block text-sm font-medium">Payslip</Label>
              <div
                {...payslipDropzone.getRootProps()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                  payslipDropzone.isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/30 hover:border-muted-foreground/60',
                  state.payslipFile && 'bg-muted/40',
                  state.isAnalyzing && 'cursor-not-allowed opacity-60'
                )}
              >
                <input {...payslipDropzone.getInputProps()} />
                {state.payslipFile ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="h-4 w-4 text-green-600" />
                    {state.payslipFile.name}
                    <span className="text-xs text-muted-foreground">
                      ({(state.payslipFile.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <p>Drag a payslip PDF here, or click to browse.</p>
                    <p className="mt-1 text-xs">Maximum file size: 5MB.</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">AVAC forms</Label>
              <div
                {...avacDropzone.getRootProps()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                  avacDropzone.isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/30 hover:border-muted-foreground/60',
                  state.avacFiles.length > 0 && 'bg-muted/40',
                  state.isAnalyzing && 'cursor-not-allowed opacity-60'
                )}
              >
                <input {...avacDropzone.getInputProps()} />
                <div className="text-sm text-muted-foreground">
                  <p>Drop your AVAC PDFs here, or click to add files.</p>
                  <p className="mt-1 text-xs">
                    Maximum {MAX_AVAC_FILES} files, 5MB each.
                  </p>
                </div>
              </div>

              {state.avacFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {state.avacFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded border border-muted-foreground/20 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-foreground">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      {!state.isAnalyzing && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => removeAvacFile(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="rostered-overtime" className="mb-2 block text-sm font-medium">
                Rostered Overtime
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rostered-overtime"
                  type="number"
                  step="0.1"
                  min="0"
                  value={state.rosteredOvertime}
                  onChange={(e) => dispatch({ type: 'SET_ROSTERED_OVERTIME', value: e.target.value })}
                  disabled={state.isAnalyzing}
                  className="max-w-[150px]"
                  placeholder="0"
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Pre-scheduled overtime that doesn&apos;t require an AVAC claim (per pay period)
              </p>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="flex-1 min-w-[200px]"
                size="lg"
              >
                {state.isAnalyzing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Analyzing…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Analyze Documents
                  </span>
                )}
              </Button>

              {(state.payslipFile || state.avacFiles.length > 0) && !state.isAnalyzing && (
                <Button type="button" onClick={resetForm} variant="outline" size="lg">
                  Clear files
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-blue-200/60 bg-blue-50/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <ShieldCheck className="h-4 w-4" />
                What happens after upload?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-blue-900/90">
              <div className="rounded-md border border-blue-200/60 bg-white/40 px-3 py-2">
                <span className="font-medium">1.</span> We extract every claim in your AVAC forms.
              </div>
              <div className="rounded-md border border-blue-200/60 bg-white/40 px-3 py-2">
                <span className="font-medium">2.</span> Each claim is reconciled against your payslip line items.
              </div>
              <div className="rounded-md border border-blue-200/60 bg-white/40 px-3 py-2">
                <span className="font-medium">3.</span> You receive a report showing reconciled and missing claims.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" />
                Recent reports
              </CardTitle>
              <CardDescription>
                Completed analyses appear in your dashboard history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                Re-run an analysis any time from the dashboard. Each report stays saved in your browser until you clear your history or switch devices.
              </div>
              <Separator />
              <div className="text-xs">
                MVP note: Meal and fatigue lines are not reconciled in this version. Only overtime claims from the AVAC form are matched.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
