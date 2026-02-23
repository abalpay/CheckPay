import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Queensland Health Overtime Calculator Guide for Medical Officers',
  description:
    'Use this practical Queensland Health overtime calculator guide to estimate expected overtime pay, validate AVAC entries, and spot payroll discrepancies early.',
  alternates: {
    canonical: '/guides/qh-overtime-calculator-guide',
  },
}

const faqs = [
  {
    question: 'What does a Queensland Health overtime calculator need to include?',
    answer:
      'At minimum, it should include your classification level, day type, overtime hours, and the penalty-rate rules that apply after threshold hours.',
  },
  {
    question: 'Can I rely on rostered hours instead of actual hours worked?',
    answer:
      'No. Overtime checks should use actual start and finish times supported by AVAC records, not only rostered shifts.',
  },
  {
    question: 'Why do manual overtime calculations still miss discrepancies?',
    answer:
      'Common misses include wrong day type, incorrect classification level, and failing to apply escalation from time-and-a-half to double time where required.',
  },
  {
    question: 'What should I do if my calculator result is higher than payslip pay?',
    answer:
      'Document the variance by date, keep AVAC and payslip evidence, and raise a payroll query with specific line-level differences.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Queensland Health Overtime Calculator Guide for Medical Officers',
  description:
    'A practical guide to building and using a Queensland Health overtime calculator for payroll validation.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2026-02-23',
  dateModified: '2026-02-23',
  mainEntityOfPage: 'https://checkpay.ai/guides/qh-overtime-calculator-guide',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://checkpay.ai' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://checkpay.ai/guides' },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'QH Overtime Calculator Guide',
      item: 'https://checkpay.ai/guides/qh-overtime-calculator-guide',
    },
  ],
}

export default function QhOvertimeCalculatorGuidePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([articleJsonLd, breadcrumbJsonLd, faqJsonLd]),
        }}
      />

      <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
        <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_70%_at_50%_5%,rgba(0,87,255,0.22),transparent_65%)]" aria-hidden />

        <div className="relative mx-auto max-w-[1120px] px-6 pb-14 pt-32 md:pb-20 md:pt-40">
          <div className="mx-auto max-w-3xl">
            <p className="inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
              Guide
            </p>
            <h1 className="cp-display mt-6 text-[clamp(2.2rem,5.3vw,3.4rem)] leading-[1.05]">
              Queensland Health Overtime Calculator Guide
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              This Queensland Health overtime calculator guide explains how to estimate expected pay,
              compare it against payroll outcomes, and flag discrepancies before they repeat. For
              broader resources, you can always return to the <Link href="/guides" className="text-[#93C5FD] underline">guides hub</Link>.
            </p>
          </div>
        </div>
      </section>

      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>Why a Calculator Process Matters</h2>
            <p>
              Overtime discrepancies often happen in small increments: a missing half-hour, a wrong
              day code, or an escalation threshold that was not applied. Individually these numbers may
              look minor, but over a roster cycle they compound quickly. A consistent calculator process
              gives you a repeatable way to test what you should have been paid.
            </p>
            <p>
              The goal is not to build a complex finance model. The goal is to create a reliable
              check that catches obvious mismatches early, while records are still fresh and easy to
              correct.
            </p>

            <h2>How a Queensland Health Overtime Calculator Should Work</h2>
            <p>
              A Queensland Health overtime calculator should map each overtime entry to four core
              variables: your classification level, the day type, the number of overtime hours, and
              the correct penalty multipliers. If any one variable is wrong, the expected result is
              wrong.
            </p>
            <p>
              Start with a row-by-row approach. Treat each AVAC line as one calculation item, then
              compare the total expected amount with the matching payslip lines for the same period.
            </p>

            <h3>Inputs You Need Before Calculating</h3>
            <ul>
              <li>
                <strong>Classification level:</strong> use the level active at the date worked,
                especially around increment dates.
              </li>
              <li>
                <strong>Base hourly rate:</strong> derive this from your classification and current
                agreement settings.
              </li>
              <li>
                <strong>Day type:</strong> weekday, Saturday, Sunday, or public holiday.
              </li>
              <li>
                <strong>Overtime duration:</strong> actual claimed hours from approved AVAC records.
              </li>
              <li>
                <strong>Relevant thresholds:</strong> where the multiplier changes after initial
                overtime blocks.
              </li>
            </ul>
            <p>
              If you need a rate refresher before calculating, use the <Link href="/guides/qh-overtime-rates">Queensland Health overtime rates guide</Link> as the baseline reference.
            </p>

            <h3>Step-by-Step Formula Pattern</h3>
            <p>
              Use this practical formula for each entry:
            </p>
            <ol>
              <li>Confirm base hourly rate for the date worked.</li>
              <li>Apply day-type multiplier for the first overtime block.</li>
              <li>Apply escalation multiplier for hours beyond the threshold where applicable.</li>
              <li>Sum both portions to get expected pay for that entry.</li>
              <li>Compare expected pay to the corresponding payslip line amount.</li>
            </ol>
            <p>
              The process is intentionally simple. Accuracy comes from correctly assigning each shift
              condition, not from adding more spreadsheet complexity.
            </p>

            <h2>Worked Example You Can Reuse</h2>
            <p>
              Suppose a weekday overtime entry has 4 hours at an hourly base of $70. If the first
              3 hours are paid at 1.5x and the next hour at 2.0x, expected pay is:
            </p>
            <ul>
              <li>First 3 hours: 3 x 70 x 1.5 = $315</li>
              <li>Fourth hour: 1 x 70 x 2.0 = $140</li>
              <li>Total expected: $455</li>
            </ul>
            <p>
              If payroll paid all 4 hours at 1.5x, actual would be $420 and the discrepancy would
              be -$35 for that single line. That is exactly the kind of difference a structured
              overtime check should reveal.
            </p>

            <h2>Common Calculator Mistakes That Distort Results</h2>
            <ul>
              <li>
                <strong>Using rostered instead of actual hours:</strong> this can understate owed
                overtime after shift overruns.
              </li>
              <li>
                <strong>Ignoring day-type differences:</strong> Sunday and holiday multipliers are
                not interchangeable with weekday calculations.
              </li>
              <li>
                <strong>Skipping increment timing:</strong> if your level changed mid-period, one
                base rate across all dates may be wrong.
              </li>
              <li>
                <strong>Not reconciling AVAC errors first:</strong> inaccurate source entries produce
                inaccurate expected totals.
              </li>
            </ul>
            <p>
              Many of these issues originate in documentation quality. If AVAC quality is inconsistent,
              review the <Link href="/guides/qh-avac-common-errors">QH AVAC common errors guide</Link> before
              escalating a pay dispute.
            </p>

            <h2>Turning Calculations Into Actionable Payroll Checks</h2>
            <p>
              Once you calculate expected amounts, create a short variance table with five columns:
              date, pay type, expected amount, actual amount, and difference. Keep this table attached
              to your AVAC and payslip evidence when you contact payroll. Precise evidence reduces
              back-and-forth and shortens resolution time.
            </p>
            <p>
              If you find repeated mismatches across multiple periods, escalate early. A pattern often
              indicates a configuration or process issue rather than a one-off typo.
            </p>

            <h2>Manual Calculator vs Automated Reconciliation</h2>
            <p>
              A manual calculator is useful for understanding logic and validating individual lines.
              For full-period checks with many AVAC entries, automation is usually faster and less
              error-prone. CheckPay applies the same validation logic at scale and returns structured
              follow-up insights.
            </p>
            <p>
              When you are ready, run your files through the <Link href="/check/new">free analysis flow</Link> and
              compare automated outputs with your manual calculator notes.
            </p>

            <h2>FAQs</h2>
            {faqs.map((faq) => (
              <div key={faq.question} className="guide-callout">
                <p>
                  <strong>{faq.question}</strong>
                </p>
                <p>{faq.answer}</p>
              </div>
            ))}
          </div>

          <RelatedGuides
            items={[
              {
                href: '/guides/qh-overtime-rates',
                title: 'Queensland Health Overtime Rates',
                description: 'Reference guide for multipliers and day-type rate logic.',
              },
              {
                href: '/guides/qh-avac-common-errors',
                title: 'QH AVAC Common Errors',
                description: 'Fix source-document issues before reconciling payroll outcomes.',
              },
              {
                href: '/guides/qld-junior-doctor-underpayment-check',
                title: 'Junior Doctor Underpayment Check',
                description: 'Use evidence-based steps when discrepancies are confirmed.',
              },
            ]}
          />

          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Run your overtime calculator check with real files
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload your payslip and AVAC forms to compare expected versus paid overtime in under
              60 seconds.
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
      </article>
    </>
  )
}
