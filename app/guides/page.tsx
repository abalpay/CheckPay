import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpenText } from 'lucide-react'

import { Button } from '@/components/ui/button'

const guides = [
  {
    href: '/guides/qh-overtime-calculator-guide',
    title: 'Queensland Health Overtime Calculator Guide',
    description:
      'Learn the inputs, formulas, and checks needed to calculate overtime correctly for QH medical officers.',
  },
  {
    href: '/guides/qld-junior-doctor-underpayment-check',
    title: 'Junior Doctor Underpayment Check in Queensland',
    description:
      'A practical process to identify underpayments, gather evidence, and escalate with clear documentation.',
  },
  {
    href: '/guides/qh-avac-common-errors',
    title: 'Queensland Health AVAC Common Errors',
    description:
      'Understand the AVAC mistakes that most often lead to delayed or reduced overtime payments.',
  },
  {
    href: '/guides/qh-payroll-discrepancy-steps',
    title: 'Queensland Health Payroll Discrepancy Steps',
    description:
      'Follow a structured escalation pathway when payroll outcomes do not match approved overtime records.',
  },
  {
    href: '/guides/qh-overtime-rates',
    title: 'Queensland Health Overtime Rates',
    description:
      'Reference overtime multipliers and common rate pitfalls across weekday, weekend, and holiday shifts.',
  },
  {
    href: '/guides/how-to-read-avac',
    title: 'How to Read Your QH AVAC Form',
    description:
      'Field-by-field guide to AVAC forms so you can validate entries before they reach payroll.',
  },
  {
    href: '/guides/claiming-overtime-qh',
    title: 'How to Claim Overtime at Queensland Health',
    description:
      'Step-by-step claiming workflow, deadlines, and follow-up actions for unresolved payment issues.',
  },
]

export const metadata: Metadata = {
  title: 'Queensland Health Overtime & Payroll Guides',
  description:
    'Browse practical guides for Queensland Health overtime checks, AVAC validation, underpayment reviews, and payroll discrepancy follow-up.',
  alternates: {
    canonical: '/guides',
  },
}

const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'CheckPay Guides',
  description:
    'Practical Queensland Health overtime and payroll guides for medical officers and junior doctors.',
  url: 'https://checkpay.ai/guides',
}

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: guides.map((guide, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: guide.title,
    url: `https://checkpay.ai${guide.href}`,
  })),
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://checkpay.ai' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://checkpay.ai/guides' },
  ],
}

export default function GuidesIndexPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([collectionJsonLd, itemListJsonLd, breadcrumbJsonLd]),
        }}
      />

      <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
        <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_70%_at_50%_5%,rgba(0,87,255,0.22),transparent_65%)]" aria-hidden />

        <div className="relative mx-auto max-w-[1120px] px-6 pb-14 pt-32 md:pb-20 md:pt-40">
          <div className="mx-auto max-w-3xl">
            <p className="inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
              Guides
            </p>
            <h1 className="cp-display mt-6 text-[clamp(2.2rem,5.3vw,3.4rem)] leading-[1.05]">
              Queensland Health overtime and payroll guides
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              Use these practical guides to run accurate overtime checks, review AVAC data, and
              resolve payroll discrepancies with stronger evidence.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="grid gap-5 md:grid-cols-2">
            {guides.map((guide) => (
              <article
                key={guide.href}
                className="rounded-xl border border-[var(--cp-border)] bg-white p-6 shadow-[0_8px_24px_rgba(26,26,26,0.04)]"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-[var(--cp-text-primary)]">{guide.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--cp-text-secondary)]">
                  {guide.description}
                </p>
                <Link
                  href={guide.href}
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--cp-accent)] transition-colors hover:text-[var(--cp-accent-hover)]"
                >
                  Read guide
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h2 className="cp-display text-2xl text-[var(--cp-text-primary)]">
              Ready to run your overtime check?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--cp-text-secondary)]">
              Upload your payslip and AVAC files to compare expected versus paid overtime in under a
              minute.
            </p>
            <div className="mt-6">
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
    </>
  )
}
