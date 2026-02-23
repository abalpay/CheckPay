import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Queensland Health Payroll Discrepancy Steps for Medical Officers',
  description:
    'Follow these Queensland Health payroll discrepancy steps to document mismatches, submit precise payroll queries, and escalate unresolved overtime issues.',
  alternates: {
    canonical: '/guides/qh-payroll-discrepancy-steps',
  },
}

const faqs = [
  {
    question: 'What should I include in a payroll discrepancy query?',
    answer:
      'Include period, line-by-line variance details, source references, and a clear request for correction or calculation clarification.',
  },
  {
    question: 'How quickly should I escalate if there is no response?',
    answer:
      'Escalate after a reasonable processing window if no substantive response is provided, especially where discrepancies are clear and recurring.',
  },
  {
    question: 'Do I need to send every source document every time?',
    answer:
      'Yes for the initial query; for follow-ups, send delta evidence while referencing the original package to maintain continuity.',
  },
  {
    question: 'How do I avoid emotional or unclear escalation messages?',
    answer:
      'Use objective language, structured tables, and precise asks. Focus on evidence and required action rather than broad complaints.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Queensland Health Payroll Discrepancy Steps for Medical Officers',
  description:
    'A practical escalation workflow for overtime and allowance payroll discrepancies in Queensland Health.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2026-02-23',
  dateModified: '2026-02-23',
  mainEntityOfPage: 'https://checkpay.ai/guides/qh-payroll-discrepancy-steps',
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
      name: 'QH Payroll Discrepancy Steps',
      item: 'https://checkpay.ai/guides/qh-payroll-discrepancy-steps',
    },
  ],
}

export default function QhPayrollDiscrepancyStepsPage() {
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
              Queensland Health Payroll Discrepancy Steps
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              Use these Queensland Health payroll discrepancy steps when expected and paid overtime do
              not match. The workflow prioritizes evidence clarity, faster triage, and escalation that
              drives resolution. Browse companion material in the <Link href="/guides" className="text-[#93C5FD] underline">guides hub</Link>.
            </p>
          </div>
        </div>
      </section>

      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>Applying Queensland Health Payroll Discrepancy Steps in Practice</h2>
            <p>
              Before escalating, ensure the discrepancy is validated against source records. Most failed
              escalation threads happen because the initial message is too broad or missing clear line
              references. A short validation step saves time and strengthens your case.
            </p>
            <p>
              Use approved AVAC entries and payslip lines from the same cycle, then calculate expected
              outcomes with documented assumptions.
            </p>

            <h2>Step 1: Build a Clean Evidence Pack</h2>
            <p>
              Your pack should be compact and auditable:
            </p>
            <ul>
              <li>One payslip for the period in question.</li>
              <li>Corresponding approved AVAC files.</li>
              <li>A variance table (expected vs paid by line).</li>
              <li>Any prior query chain relevant to the same entries.</li>
            </ul>
            <p>
              If AVAC quality is uncertain, review <Link href="/guides/qh-avac-common-errors">common AVAC errors</Link>
              before preparing a discrepancy submission.
            </p>

            <h2>Step 2: Run Calculation Validation</h2>
            <p>
              Ensure expected amounts are based on the correct rate logic and day type. A discrepancy
              claim is only as strong as the expected baseline behind it. Use the <Link href="/guides/qh-overtime-calculator-guide">overtime
              calculator guide</Link> for line-level calculations and verify multipliers with the <Link href="/guides/qh-overtime-rates">rate
              reference</Link>.
            </p>

            <h2>Step 3: Submit a Structured First Payroll Query</h2>
            <p>
              Keep the first message focused. Include:
            </p>
            <ol>
              <li>Pay period covered.</li>
              <li>Number of affected entries.</li>
              <li>Total variance amount.</li>
              <li>Attached table with line-level details.</li>
              <li>Specific request for correction or explanation.</li>
            </ol>
            <p>
              Clarity beats volume. Long narrative without line-level references slows triage.
            </p>

            <h2>Step 4: Track Response Quality and Timelines</h2>
            <p>
              Not every response resolves the issue. Track whether payroll has:
            </p>
            <ul>
              <li>Addressed each disputed line directly.</li>
              <li>Provided calculation logic where numbers differ.</li>
              <li>Given an implementation date for corrections.</li>
            </ul>
            <p>
              If responses remain generic after a reasonable interval, escalate with the same evidence
              pack and a brief status summary of unresolved items.
            </p>

            <h2>Step 5: Escalate With Precision</h2>
            <p>
              Escalation should not restart the entire case. It should reference the original package,
              list unresolved rows, and request decision-level review. Keep tone professional and
              evidence-focused.
            </p>
            <p>
              Useful escalation structure:
            </p>
            <ul>
              <li>Original submission date and reference.</li>
              <li>Number of items resolved vs unresolved.</li>
              <li>Total unresolved variance.</li>
              <li>Requested action and target date.</li>
            </ul>

            <h2>Step 6: Confirm Remediation on Next Cycle</h2>
            <p>
              After a correction is promised, verify the next payslip line-by-line. Some discrepancies
              are only partially corrected, and residual items can be missed if the follow-up check is
              skipped.
            </p>
            <p>
              Treat remediation as complete only when each unresolved item is closed in your tracking
              table.
            </p>

            <h2>Common Escalation Failure Modes</h2>
            <ul>
              <li>
                <strong>No line-level evidence:</strong> broad statements without specific rows are
                hard to action.
              </li>
              <li>
                <strong>Mixed periods in one request:</strong> combining many cycles can blur context
                and delay responses.
              </li>
              <li>
                <strong>Unclear requested outcome:</strong> queries should ask for exact correction or
                exact logic explanation.
              </li>
              <li>
                <strong>No response tracking:</strong> missing follow-up logs leads to repeated threads
                and duplicated effort.
              </li>
            </ul>

            <h2>Where Automation Helps</h2>
            <p>
              Discrepancy workflows become slow when every row is reconciled manually each cycle.
              Automated reconciliation can generate a first-pass issue list, which you then verify and
              escalate with human judgment. If you have files ready, start in the <Link href="/check/new">analysis
              workflow</Link> and use the output as your evidence draft.
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
                href: '/guides/qld-junior-doctor-underpayment-check',
                title: 'Junior Doctor Underpayment Check',
                description: 'Detect and document discrepancies before escalation.',
              },
              {
                href: '/guides/qh-overtime-calculator-guide',
                title: 'QH Overtime Calculator Guide',
                description: 'Validate expected amounts with a repeatable formula process.',
              },
              {
                href: '/guides/qh-avac-common-errors',
                title: 'QH AVAC Common Errors',
                description: 'Eliminate source-data issues that weaken discrepancy claims.',
              },
            ]}
          />

          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Build a discrepancy pack from real payroll data
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload your files and generate a reconciliation output you can use for faster payroll
              follow-up.
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
