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
import { createClient } from '@/lib/supabase-client'
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
  UserRound,
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

type SubscriptionStatus = string | null

interface ProfileStatus {
  full_name: string | null
  stripe_subscription_status: SubscriptionStatus
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])

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
            'id, created_at, pay_period_label, matched_count, unmatched_count, total_claims'
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

      {showOnboardingPrompt ? (
        <section className="mt-10">
          <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <NotebookPen className="h-5 w-5" />
                Complete your CheckPay setup
              </CardTitle>
              <CardDescription className="text-amber-900/80">
                Finish these quick steps to unlock the full dashboard experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {shouldPromptProfile ? (
                <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 h-5 w-5 text-amber-700" />
                    <div>
                      <p className="font-medium text-amber-900">Add your display name</p>
                      <p className="text-sm text-amber-800/80">
                        We use it in the app header and on downloaded reports.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-amber-300 text-amber-900 hover:bg-amber-100"
                    onClick={handleGoToAccount}
                  >
                    Update account
                  </Button>
                </div>
              ) : null}
              {shouldPromptBilling ? (
                <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 text-amber-700" />
                    <div>
                      <p className="font-medium text-amber-900">Activate billing</p>
                      <p className="text-sm text-amber-800/80">
                        Choose a plan to keep analysing overtime and access saved reports.
                      </p>
                    </div>
                  </div>
                  <Button className="bg-amber-700 text-white hover:bg-amber-800" onClick={handleGoToBilling}>
                    Manage subscription
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

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
