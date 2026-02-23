import Link from 'next/link'
import { ArrowRight, BookOpenText } from 'lucide-react'

import { Button } from '@/components/ui/button'

const featuredGuides = [
  {
    href: '/guides/qh-overtime-calculator-guide',
    title: 'Queensland Health Overtime Calculator Guide',
    description:
      'Learn the exact inputs and formulas to calculate weekday, weekend, and public holiday overtime correctly.',
  },
  {
    href: '/guides/qld-junior-doctor-underpayment-check',
    title: 'Junior Doctor Underpayment Check (QLD)',
    description:
      'Run a structured underpayment check with payslips, AVAC evidence, and escalation steps that get action.',
  },
  {
    href: '/guides/qh-avac-common-errors',
    title: 'QH AVAC Common Errors',
    description:
      'Spot the high-frequency AVAC mistakes that lead to lower overtime payouts and delayed corrections.',
  },
]

export default function GuidesSection() {
  return (
    <section className="bg-[var(--cp-bg-primary)] py-16 md:py-24">
      <div className="mx-auto max-w-[1120px] px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cp-accent)]">
          Learning Hub
        </p>
        <h2 className="cp-display mt-3 max-w-3xl text-[clamp(2rem,4vw,2.75rem)] leading-tight text-[var(--cp-text-primary)]">
          Guides for overtime checks, AVAC review, and payroll follow-up
        </h2>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--cp-text-secondary)] md:text-lg">
          Explore practical guides built for Queensland Health doctors who want to verify pay outcomes,
          document discrepancies, and escalate issues with confidence.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {featuredGuides.map((guide) => (
            <article
              key={guide.href}
              className="rounded-xl border border-[var(--cp-border)] bg-white p-6 shadow-[0_10px_24px_rgba(26,26,26,0.04)]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                <BookOpenText className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--cp-text-primary)]">{guide.title}</h3>
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

        <div className="mt-10">
          <Button
            asChild
            className="h-auto rounded-lg bg-[var(--cp-accent)] px-7 py-3 text-sm font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
          >
            <Link href="/guides" className="inline-flex items-center gap-2">
              Explore all guides
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
