import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Cookie,
  type LucideIcon,
  LockKeyhole,
  Radar,
  ScanSearch,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import LandingLayout from '@/components/layout/landing-layout'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Learn how CheckPay handles your payslip and AVAC data. No accounts, no storage — files are processed in memory and automatically deleted.',
  alternates: {
    canonical: '/privacy',
  },
}

const LAST_UPDATED = 'February 10, 2026'

type Highlight = {
  icon: LucideIcon
  title: string
  description: string
}

const highlights: Highlight[] = [
  {
    icon: ScanSearch,
    title: 'Upload-only flow',
    description: 'We process files you submit to generate your reconciliation report.',
  },
  {
    icon: Trash2,
    title: 'Short retention',
    description: 'Uploads are handled in temporary processing storage and removed after processing.',
  },
  {
    icon: LockKeyhole,
    title: 'No ad tracking',
    description: 'We do not use advertising cookies or sell uploaded payroll data.',
  },
]

type PolicySection = {
  icon: LucideIcon
  title: string
  points: string[]
}

const policySections: PolicySection[] = [
  {
    icon: ScanSearch,
    title: '1. What We Process',
    points: [
      'Payslip and AVAC PDF files you upload.',
      'Extracted payroll fields required for reconciliation (for example: names, dates, pay lines, and amounts).',
      'Technical request metadata such as IP address and timestamps for security and reliability.',
    ],
  },
  {
    icon: ShieldCheck,
    title: '2. Why We Process It',
    points: [
      'To compare expected overtime/allowances against what was paid.',
      'To return your analysis report in the same session.',
      'To detect misuse, enforce rate limits, and troubleshoot service errors.',
    ],
  },
  {
    icon: Trash2,
    title: '3. Storage and Retention',
    points: [
      'Files are sent to our analysis backend during processing.',
      'The backend uses temporary files while parsing and removes them when processing completes.',
      'Generated report data is kept in short-lived in-memory session state (up to ~30 minutes) and clears on refresh/new session.',
    ],
  },
  {
    icon: Cookie,
    title: '4. Cookies',
    points: [
      'We set one essential HttpOnly cookie (`checkpay_session`) with an approximately 30-minute lifetime.',
      'This cookie supports session continuity and basic abuse protection.',
      'We do not use advertising cookies.',
    ],
  },
  {
    icon: Radar,
    title: '5. Third-Party Services',
    points: [
      'In production, we may use Vercel Speed Insights for aggregated performance metrics.',
      'We do not use ad networks and we do not sell uploaded payroll content.',
      'If you self-host with a custom backend, your infrastructure and hosting logs are governed by your own setup.',
    ],
  },
  {
    icon: LockKeyhole,
    title: '6. Security Controls',
    points: [
      'File type and size validation is applied before processing.',
      'API endpoints are protected by origin checks and rate limiting.',
      'Production configuration requires secure (HTTPS) upstream processing.',
    ],
  },
  {
    icon: ArrowRight,
    title: '7. Your Choices',
    points: [
      'Upload only documents required for your check.',
      'You can stop using the service at any time.',
      'This MVP does not use user accounts or a long-term report database, so historical retrieval/export is generally not available.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <LandingLayout>
      <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
        <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_70%_at_50%_5%,rgba(0,87,255,0.22),transparent_65%)]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[1120px] px-6 pb-14 pt-32 md:pb-20 md:pt-40">
          <div className="mx-auto max-w-3xl text-center">
            <p className="cp-reveal inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
              Privacy Policy
            </p>

            <h1 className="cp-display cp-reveal cp-reveal-delay-1 mt-6 text-[clamp(2.2rem,5.3vw,3.4rem)] leading-[1.05] text-[var(--cp-text-inverse)]">
              Clear, practical privacy terms
              <br />
              for a free MVP tool.
            </h1>

            <p className="cp-reveal cp-reveal-delay-2 mx-auto mt-6 max-w-[64ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              This page explains what CheckPay processes, how long data is kept, and the controls in
              place when you upload payslip and AVAC documents.
            </p>

            <div className="cp-reveal cp-reveal-delay-3 mt-8 flex items-center justify-center gap-4 text-sm text-[#C8C8C8]">
              <span>Last updated: {LAST_UPDATED}</span>
              <span className="text-[#818181]">•</span>
              <Link href="/" className="text-[#FAFAF9] underline-offset-4 transition hover:underline">
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--cp-bg-secondary)] py-12 md:py-16">
        <div className="mx-auto grid max-w-[1120px] gap-4 px-6 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] px-5 py-5"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--cp-text-primary)]">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cp-text-secondary)]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="grid gap-5 md:grid-cols-2">
            {policySections.map(({ icon: Icon, title, points }) => (
              <article
                key={title}
                className="rounded-xl border border-[var(--cp-border)] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(26,26,26,0.04)]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold text-[var(--cp-text-primary)]">{title}</h3>
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--cp-text-secondary)] md:text-[15px]">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-[var(--cp-accent)]" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[var(--cp-bg-dark)] py-14 text-[var(--cp-text-inverse)] md:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-50 cp-grain" aria-hidden />
        <div className="relative mx-auto max-w-[1120px] px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="cp-display text-[clamp(1.8rem,3.8vw,2.5rem)] leading-tight">
              Questions about privacy?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#C8C8C8]">
              Email us at{' '}
              <a
                href="mailto:privacy@checkpay.com.au"
                className="font-semibold text-[#FAFAF9] underline-offset-4 hover:underline"
              >
                privacy@checkpay.com.au
              </a>{' '}
              and we&apos;ll respond as quickly as we can.
            </p>
            <div className="mt-8">
              <Button
                asChild
                className="h-auto rounded-lg bg-[var(--cp-accent)] px-7 py-3 text-sm font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
              >
                <Link href="/check/new" className="inline-flex items-center gap-2">
                  Start Free Analysis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  )
}
