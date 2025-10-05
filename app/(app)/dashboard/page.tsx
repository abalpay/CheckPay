'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GlassPanel } from '@/components/ui/glass-panel'
import { SummaryStatCard } from '@/components/ui/summary-stat-card'
import { createClient } from '@/lib/supabase-client'
import { normalizeAnalysisJson } from '@/lib/jobs'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  History,
  Loader2,
  NotebookPen,
  Sparkles,
  UserRound,
} from 'lucide-react'

const createdFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const payPeriodSegmentFormatter = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
})

const supabase = createClient()

interface ReportHistoryEntry {
  id: string
  created_at: string
  pay_period_label: string | null
  matched_count: number | null
  unmatched_count: number | null
  total_claims: number | null
  report_data: unknown
}

type SubscriptionStatus = string | null

interface ProfileStatus {
  full_name: string | null
  stripe_subscription_status: SubscriptionStatus
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])

function formatPayPeriodLabel(value: string | null): string {
  if (!value) return 'Pay period not provided'
  const trimmed = value.trim()

  const formatSegment = (segment: string) => {
    const clean = segment.trim()
    if (!clean) return clean
    if (/^\d{1,2}[\/.]\d{1,2}$/.test(clean)) {
      return clean.replace('.', '/')
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const parsed = new Date(clean)
      if (!Number.isNaN(parsed.getTime())) {
        return payPeriodSegmentFormatter.format(parsed)
      }
    }
    if (clean.includes('_')) {
      return clean.replace(/_/g, '/')
    }
    return clean
  }

  const tryRange = (text: string): [string, string] | null => {
    const separators = [/\s+to\s+/i, /\s+\u2013\s+/, /\s+-\s+/]
    for (const separator of separators) {
      const parts = text.split(separator).map((part) => part.trim()).filter(Boolean)
      if (parts.length === 2) {
        return [parts[0], parts[1]]
      }
    }
    if (text.includes('_')) {
      const parts = text.split('_').map((part) => part.trim()).filter(Boolean)
      if (parts.length === 2) {
        return [parts[0], parts[1]]
      }
    }
    return null
  }

  const range = tryRange(trimmed)
  if (range) {
    const [start, end] = range
    return `Pay Period ${formatSegment(start)}-${formatSegment(end)}`
  }

  return `Pay Period ${trimmed.replace(/_/g, '-')}`
}

export default function DashboardPage() {
  const router = useRouter()
  const [history, setHistory] = useState<ReportHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileStatus | null>(null)
  const [onboardingReady, setOnboardingReady] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchDashboardData = async () => {
      setIsLoading(true)

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (userError) {
          console.error('Failed to load user session', userError)
          setProfile(null)
          setHistory([])
          return
        }

        if (!user) {
          setProfile(null)
          setHistory([])
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, stripe_subscription_status')
          .eq('id', user.id)
          .maybeSingle()

        if (!isMounted) return

        if (profileError) {
          console.error('Failed to load profile data', profileError)
          setProfile(null)
        } else {
          setProfile(profileData ?? null)
        }

        const { data: historyData, error: historyError } = await supabase
          .from('reports')
          .select(
            'id, created_at, pay_period_label, matched_count, unmatched_count, total_claims, report_data'
          )
          .order('created_at', { ascending: false })

        if (!isMounted) return

        if (historyError) {
          console.error('Failed to load report history', historyError)
          setHistory([])
          return
        }

        setHistory(historyData ?? [])
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading dashboard data', error)
        setProfile(null)
        setHistory([])
      } finally {
        if (!isMounted) return
        setIsLoading(false)
        setOnboardingReady(true)
      }
    }

    void fetchDashboardData()

    return () => {
      isMounted = false
    }
  }, [])

  const totalClaimsChecked = useMemo(() => {
    return history.reduce((total, entry) => total + Number(entry.total_claims ?? 0), 0)
  }, [history])

  const latestReport = history[0]

  const subscriptionStatus = profile?.stripe_subscription_status ?? null
  const isSubscriptionActive = subscriptionStatus
    ? ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
    : false
  const isFullNameMissing = !(profile?.full_name ?? '').trim()
  const shouldPromptProfile = onboardingReady && isFullNameMissing
  const shouldPromptBilling = onboardingReady && !isSubscriptionActive
  const showOnboardingPrompt = shouldPromptProfile || shouldPromptBilling

  const handleGoToAccount = useCallback(() => {
    router.push('/account')
  }, [router])

  const handleGoToBilling = useCallback(() => {
    router.push('/account/billing')
  }, [router])

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <GlassPanel variant="slate" className="p-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_55%),_radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Dashboard
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-lg font-bold text-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  Welcome back. Let&apos;s reconcile your overtime claims.
                </h1>
              </div>
              <p className="max-w-3xl text-base text-slate-600 sm:text-lg">
                Upload new documents, review recent analyses, and follow up on claims that need attention all from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-md transition hover:from-indigo-600 hover:to-blue-600"
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
                className="rounded-xl border-indigo-200/70 bg-white/60 text-indigo-700 shadow-sm transition hover:bg-white/80"
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
          <Card className="overflow-hidden rounded-2xl border border-slate-200/40 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-slate-500/10 bg-white/80 p-5 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
            <CardContent className="p-0">
              <div className="flex flex-col gap-5">
                {/* Reports Section */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="h-1.5 w-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-sm" aria-hidden="true" />
                    <div className="opacity-20 transition-opacity group-hover:opacity-30">
                      <FileText className="h-12 w-12" />
                    </div>
                  </div>
                  <span className="text-3xl font-bold tracking-tight text-slate-800">
                    {isLoading ? '—' : history.length}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Reports stored</span>
                    <span className="text-xs font-medium text-slate-500">
                      (Claims checked {isLoading ? 0 : totalClaimsChecked.toLocaleString()})
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="relative -mx-5 px-5">
                  <div className="border-t-2 border-slate-200/60"></div>
                </div>

                {/* Latest Analysis Section */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="h-1.5 w-12 rounded-full bg-gradient-to-r from-slate-500 to-slate-600 shadow-sm" aria-hidden="true" />
                    <div className="opacity-20 transition-opacity group-hover:opacity-30">
                      <Clock className="h-12 w-12" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Latest analysis</span>
                    {isLoading ? (
                      <span className="text-lg font-semibold text-slate-700">Loading…</span>
                    ) : latestReport ? (
                      <>
                        <span className="text-xl font-bold tracking-tight text-slate-800">
                          {new Intl.DateTimeFormat('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }).format(new Date(latestReport.created_at))}
                        </span>
                        <span className="text-base font-semibold text-slate-600">
                          {new Intl.DateTimeFormat('en-AU', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          }).format(new Date(latestReport.created_at))}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-1 font-semibold text-emerald-700">
                            Matched {latestReport.matched_count ?? 0}
                          </span>
                          <span className="rounded-full border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 font-semibold text-amber-700">
                            Unmatched {latestReport.unmatched_count ?? 0}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="text-lg font-semibold text-slate-700">No analyses yet</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </GlassPanel>

      {showOnboardingPrompt ? (
        <GlassPanel variant="amber" className="mt-10 p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
                <NotebookPen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-amber-900">
                  Complete your CheckPay setup
                </h2>
                <p className="text-sm text-amber-800/80">
                  Finish these quick steps to unlock the full dashboard experience.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {shouldPromptProfile ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-amber-900">Add your display name</p>
                      <p className="text-sm text-amber-800/80">
                        We use it in the app header and on downloaded reports.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl border-amber-300/80 text-amber-900 hover:bg-amber-100"
                    onClick={handleGoToAccount}
                  >
                    Update account
                  </Button>
                </div>
              ) : null}
              {shouldPromptBilling ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-amber-900">Activate billing</p>
                      <p className="text-sm text-amber-800/80">
                        Choose a plan to keep analysing overtime and access saved reports.
                      </p>
                    </div>
                  </div>
                  <Button className="rounded-xl bg-amber-700 text-white shadow hover:bg-amber-800" onClick={handleGoToBilling}>
                    Manage subscription
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </GlassPanel>
      ) : null}

      <section className="mt-10">
        <Card className="overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/40 to-blue-50/20 shadow-lg backdrop-blur-sm">
          <CardHeader className="flex flex-col gap-3 pb-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
                <History className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Report history
                </CardTitle>
                <CardDescription className="text-sm text-slate-600">
                  Recently generated analyses are stored securely with your CheckPay account.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center gap-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                Loading your saved reports…
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200/60 bg-white/70 p-8 text-center shadow-sm">
                <NotebookPen className="h-8 w-8 text-slate-400" />
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-700">No reports yet</p>
                  <p className="text-sm text-slate-500">
                    Start by uploading a payslip and AVAC forms. Your reports will appear here once the analysis is complete.
                  </p>
                </div>
                <Button
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow hover:from-indigo-600 hover:to-blue-600"
                  onClick={() => router.push('/check/new')}
                >
                  Run your first analysis
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => {
                  // Parse report_data to get accurate row-level counts
                  const analysis = entry.report_data ? normalizeAnalysisJson(entry.report_data) : null
                  const rows = analysis?.rows ?? []

                  // Count actual rows by status
                  const paidRowCount = rows.filter((row: any) => row.status === 'paid').length
                  const partiallyPaidRowCount = rows.filter((row: any) => row.status === 'partially_paid').length
                  const unpaidRowCount = rows.filter((row: any) => row.status === 'unpaid').length
                  const needsFollowUpCount = partiallyPaidRowCount + unpaidRowCount

                  const totalClaims = rows.length || (entry.total_claims ?? 0)
                  const matchedCount = paidRowCount || (entry.matched_count ?? 0)
                  const matchPercentage = totalClaims > 0 ? Math.round((matchedCount / totalClaims) * 100) : 0

                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/check/report/${entry.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          router.push(`/check/report/${entry.id}`)
                        }
                      }}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-4 shadow-sm transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-indigo-200/80 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      {/* Top Row: Pay Period and Arrow Icon */}
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900 leading-tight">
                          {formatPayPeriodLabel(entry.pay_period_label)}
                        </h3>
                        <ArrowRight className="h-4 w-4 text-slate-400 transition-all duration-200 group-hover:text-indigo-500 group-hover:translate-x-1 mt-0.5" />
                      </div>

                      {/* Date Row */}
                      <div className="mb-3">
                        <span className="text-sm text-slate-500">
                          {createdFormatter.format(new Date(entry.created_at))}
                        </span>
                      </div>

                      {/* Progress Row */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-32 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-300"
                              style={{ width: `${matchPercentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-slate-700 font-medium whitespace-nowrap">
                            {matchedCount} of {totalClaims} matched ({matchPercentage}%)
                          </span>
                        </div>
                        
                        {needsFollowUpCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-sm text-amber-700 font-medium whitespace-nowrap">
                              {needsFollowUpCount} need follow-up
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </section>
    </div>
  )
}
