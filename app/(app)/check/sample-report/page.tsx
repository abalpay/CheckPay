import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Eye, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SAMPLE_REPORT_ID } from '@/lib/sample-report'

export const metadata: Metadata = {
  title: {
    absolute: 'Sample Queensland Health Overtime Report | CheckPay',
  },
  description:
    'Preview a sample Queensland Health overtime report with fictional data. See how CheckPay flags underpayments, missing lines, and likely future adjustments.',
  alternates: {
    canonical: '/check/sample-report',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://checkpay.ai' },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Sample Overtime Report',
      item: 'https://checkpay.ai/check/sample-report',
    },
  ],
}

export default function SampleReportPage() {
  return (
    <div className="pb-12 md:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
        <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(105%_65%_at_50%_4%,rgba(0,87,255,0.22),transparent_70%)]" aria-hidden />

        <div className="relative mx-auto max-w-[1120px] px-4 pb-10 pt-24 sm:px-6 md:pb-12 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="cp-reveal inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
              Sample Report
            </p>

            <h1 className="cp-display cp-reveal cp-reveal-delay-1 mt-5 text-[clamp(2rem,5.3vw,3.25rem)] leading-[1.06]">
              Sample Queensland Health Overtime Report
            </h1>

            <p className="cp-reveal cp-reveal-delay-2 mx-auto mt-4 max-w-[70ch] text-[15px] leading-relaxed text-[#C8C8C8] md:text-base">
              Explore an indexable preview page before opening the interactive report. This sample
              shows how CheckPay highlights underpayments, missing entries, and likely future pay-cycle
              adjustments.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--cp-border)] bg-white p-6 shadow-[0_14px_34px_rgba(0,87,255,0.08)] md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] p-5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                <Eye className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--cp-text-primary)]">
                What you will see
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--cp-text-secondary)]">
                <li>Per-AVAC summaries with follow-up items and status labels.</li>
                <li>Differences between expected and paid overtime amounts.</li>
                <li>Action-ready text you can use for payroll follow-up.</li>
              </ul>
            </article>

            <article className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] p-5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--cp-text-primary)]">
                Sample data only
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--cp-text-secondary)]">
                The preview report uses fictional values and does not include personal payroll data.
                For your own overtime reconciliation, upload your files in the analysis flow.
              </p>
            </article>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-auto rounded-lg bg-[var(--cp-accent)] px-7 py-3 text-sm font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
            >
              <Link href={`/check/report/${SAMPLE_REPORT_ID}`} className="inline-flex items-center gap-2">
                Open interactive sample report
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <Link
              href="/check/new"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--cp-accent)] transition-colors hover:text-[var(--cp-accent-hover)]"
            >
              Run your own free analysis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-6 text-sm text-[var(--cp-text-secondary)]">
            Need context first? Visit the <Link href="/guides" className="text-[var(--cp-accent)] hover:underline">guides hub</Link> for
            practical overtime and AVAC walkthroughs.
          </p>
        </div>
      </section>
    </div>
  )
}
