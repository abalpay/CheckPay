'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  History,
  Loader2,
  NotebookPen,
} from 'lucide-react'

const createdFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const supabase = createClient()

interface ReportHistoryEntry {
  id: string
  created_at: string
  pay_period_label: string | null
  matched_count: number | null
  unmatched_count: number | null
  total_claims: number | null
}

function formatPayPeriodLabel(value: string | null): string {
  if (!value) return 'Pay period not provided'
  if (value.includes('_')) {
    return value.replace('_', ' – ')
  }
  return value.replace(/[-_]/g, '–')
}

export default function DashboardPage() {
  const router = useRouter()
  const [history, setHistory] = useState<ReportHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchHistory = async () => {
      try {
        setIsLoading(true)
        const { data, error } = await supabase
          .from('reports')
          .select(
            'id, created_at, pay_period_label, matched_count, unmatched_count, total_claims'
          )
          .order('created_at', { ascending: false })

        if (!isMounted) return

        if (error) {
          console.error('Failed to load report history', error)
          setHistory([])
          setIsLoading(false)
          return
        }

        setHistory(data ?? [])
        setIsLoading(false)
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading report history', error)
        setHistory([])
        setIsLoading(false)
      }
    }

    void fetchHistory()

    return () => {
      isMounted = false
    }
  }, [])

  const totalClaimsChecked = useMemo(() => {
    return history.reduce((total, entry) => total + Number(entry.total_claims ?? 0), 0)
  }, [history])

  const latestReport = history[0]

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 px-6 py-12 text-white shadow-2xl sm:px-12">
        <div className="absolute inset-x-0 -bottom-10 h-40 bg-gradient-to-t from-slate-900/40 to-transparent" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/70">Dashboard</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Welcome back. Let&apos;s reconcile your overtime claims.
            </h1>
            <p className="text-white/80">
              Upload new documents, review recent analyses, and follow up on claims that need attention all from one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-white text-slate-900 hover:bg-white/90"
                onClick={() => router.push('/check/new')}
              >
                <span className="inline-flex items-center gap-2">
                  Start a new analysis
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                disabled={isLoading || !latestReport}
                onClick={() => {
                  if (!latestReport) return
                  router.push(`/check/report/${latestReport.id}`)
                }}
              >
                View latest report
              </Button>
            </div>
          </div>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm backdrop-blur sm:text-base">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="flex items-center gap-2 text-xs uppercase text-white/70">
                <FileText className="h-3.5 w-3.5" />
                Reports stored
              </div>
              <div className="mt-2 text-2xl font-semibold">{isLoading ? '—' : history.length}</div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="flex items-center gap-2 text-xs uppercase text-white/70">
                <BarChart3 className="h-3.5 w-3.5" />
                Claims checked
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {isLoading ? '—' : totalClaimsChecked.toLocaleString()}
              </div>
            </div>
            <div className="col-span-2 rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="flex items-center gap-2 text-xs uppercase text-white/70">
                <Clock className="h-3.5 w-3.5" />
                Last analysis
              </div>
              <div className="mt-2 text-lg font-medium">
                {isLoading
                  ? 'Loading…'
                  : latestReport
                  ? createdFormatter.format(new Date(latestReport.created_at))
                  : 'No analyses yet'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Report history
            </CardTitle>
            <CardDescription>
              Recently generated analyses are stored securely with your CheckPay account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your saved reports…
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-center">
                <NotebookPen className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                <p className="font-medium text-foreground">No reports yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start by uploading a payslip and AVAC forms. Your reports will appear here once the analysis is complete.
                </p>
                <Button className="mt-4" onClick={() => router.push('/check/new')}>
                  Run your first analysis
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <Card
                    key={entry.id}
                    className="border border-muted-foreground/20 bg-muted/20 hover:border-muted-foreground/40"
                  >
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {formatPayPeriodLabel(entry.pay_period_label)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {createdFormatter.format(new Date(entry.created_at))}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          {(entry.matched_count ?? 0).toLocaleString()} matched
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          {(entry.unmatched_count ?? 0).toLocaleString()} unmatched
                        </span>
                      </div>
                      <Button onClick={() => router.push(`/check/report/${entry.id}`)} size="sm">
                        View report
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tips for best results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-muted-foreground/30 bg-muted/30 p-3">
              Use high quality PDF exports so claim details and line identifiers can be extracted reliably.
            </div>
            <div className="rounded-lg border border-muted-foreground/30 bg-muted/30 p-3">
              Combine all AVAC forms for the pay period. Separate reports will create individual entries in your history.
            </div>
            <div className="rounded-lg border border-muted-foreground/30 bg-muted/30 p-3">
              Missing claims are highlighted on each report. Follow up with payroll using the AVAC row and payslip line IDs provided.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
