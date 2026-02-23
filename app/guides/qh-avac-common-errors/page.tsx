import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Queensland Health AVAC Errors: Common Issues and Fixes',
  description:
    'Review the most common Queensland Health AVAC errors that lead to overtime underpayment, delayed processing, and avoidable payroll disputes.',
  alternates: {
    canonical: '/guides/qh-avac-common-errors',
  },
}

const faqs = [
  {
    question: 'What AVAC error causes the most frequent pay mismatch?',
    answer:
      'Incorrect day type or claim coding is one of the most frequent causes because it can change the multiplier applied to overtime.',
  },
  {
    question: 'Should I submit AVACs even if one line is uncertain?',
    answer:
      'Submit on time with best-available accurate detail, then correct uncertain lines quickly with documented amendments rather than missing deadlines.',
  },
  {
    question: 'How can teams reduce repeated AVAC issues?',
    answer:
      'Use a standard pre-submission checklist and a quick second-person review for high-risk fields such as dates, day type, and classification.',
  },
  {
    question: 'Do AVAC errors affect only one pay cycle?',
    answer:
      'Not always. If an error pattern is repeated across rosters, it can affect multiple periods until the source process is corrected.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Queensland Health AVAC Errors: Common Issues and Fixes',
  description:
    'A practical guide to identifying and fixing AVAC errors that drive overtime payroll discrepancies.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2026-02-23',
  dateModified: '2026-02-23',
  mainEntityOfPage: 'https://checkpay.ai/guides/qh-avac-common-errors',
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
      name: 'QH AVAC Common Errors',
      item: 'https://checkpay.ai/guides/qh-avac-common-errors',
    },
  ],
}

export default function QhAvacCommonErrorsPage() {
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
              Queensland Health AVAC Errors: Common Issues and Fixes
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              Queensland Health AVAC errors are a leading cause of delayed payments and preventable
              overtime disputes. This guide explains what to check before submission, what to fix first,
              and when to escalate. For broader workflows, see the <Link href="/guides" className="text-[#93C5FD] underline">guides hub</Link>.
            </p>
          </div>
        </div>
      </section>

      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>Why AVAC Accuracy Drives Payroll Accuracy</h2>
            <p>
              Payroll systems process what is entered, not what was intended. When AVAC entries are
              incomplete, misclassified, or inconsistent with actual work patterns, payroll outputs can
              look formally processed but still be materially wrong. That is why AVAC quality is one
              of the highest-leverage controls in overtime pay accuracy.
            </p>
            <p>
              The strongest approach is to treat AVAC completion as a quality workflow, not a routine
              admin task. A two-minute review before submission can prevent weeks of follow-up later.
            </p>

            <h2>The Highest-Risk Queensland Health AVAC Errors</h2>
            <p>
              The following issue types appear most often in discrepancy reviews and are usually
              preventable with a short checklist.
            </p>

            <h3>1. Day Type Mismatch</h3>
            <p>
              If a Sunday or public holiday line is coded as a weekday, overtime is often paid at a
              lower multiplier than expected. This single classification error can create a significant
              gap for long shifts.
            </p>

            <h3>2. Claim Type or Reason Code Errors</h3>
            <p>
              Different claim types trigger different pay logic. A callback entered as standard
              overtime, or overtime entered under the wrong variation code, can produce a clean-looking
              but incorrect payslip line.
            </p>

            <h3>3. Time Entry Precision Problems</h3>
            <p>
              Rounded start/finish times, missing break context, or dropped fractions of an hour can
              silently reduce paid units. Small rounding differences repeated over many shifts produce
              meaningful underpayment risk.
            </p>

            <h3>4. Classification Level Drift</h3>
            <p>
              When progression dates are not reflected promptly, entries may be processed at outdated
              rates. Always confirm the effective classification for the specific date worked.
            </p>

            <h3>5. Submission Timing and Approval Gaps</h3>
            <p>
              Late or unapproved AVAC lines often miss the expected cycle, then become hard to trace
              if not tracked. Submission discipline is as important as entry accuracy.
            </p>

            <h2>How to Review AVAC Entries Before Submission</h2>
            <ol>
              <li>Confirm date and day type match the actual shift date.</li>
              <li>Confirm claim type aligns with the actual work pattern.</li>
              <li>Check start and finish times against your personal log.</li>
              <li>Verify classification level for the shift date.</li>
              <li>Ensure required approval is complete before payroll cut-off.</li>
            </ol>
            <p>
              This checklist is short enough to run every period and catches most high-impact issues
              before they flow downstream.
            </p>

            <h2>When AVAC Errors Reach the Payslip</h2>
            <p>
              If an AVAC issue reaches payroll, move from diagnosis to evidence quickly. Build a
              variance table with date, claim type, expected amount, paid amount, and difference.
              Reference the original AVAC line for each discrepancy.
            </p>
            <p>
              If you need help calculating expected amounts, use the <Link href="/guides/qh-overtime-calculator-guide">overtime calculator guide</Link> and
              cross-check against the <Link href="/guides/qh-overtime-rates">rate reference</Link> before escalating.
            </p>

            <h2>Building a Team-Level AVAC Quality Process</h2>
            <p>
              Individual diligence helps, but repeated error reduction usually requires team habits.
              Consider a shared process:
            </p>
            <ul>
              <li>Standard AVAC checklist used by all roster groups.</li>
              <li>Short peer review for high-risk entries before submission.</li>
              <li>Weekly spot-check of submitted vs paid lines for trend detection.</li>
              <li>Escalation template for unresolved discrepancies.</li>
            </ul>
            <p>
              A small amount of standardization can dramatically reduce duplicate mistakes and repeated
              payroll correction loops.
            </p>

            <h2>Distinguishing One-Off Errors from Process Failures</h2>
            <p>
              One mismatch may be clerical. Repeated mismatches of the same type usually point to a
              process failure. Flag recurrence explicitly in your query so resolution targets the root
              cause, not only the latest symptom.
            </p>
            <p>
              For full escalation sequencing, follow the <Link href="/guides/qh-payroll-discrepancy-steps">payroll discrepancy steps guide</Link>.
            </p>

            <h2>Manual Review vs Automated Validation</h2>
            <p>
              Manual AVAC review remains important, especially for understanding local workflow context.
              For faster period-wide checks, automation helps you identify line-level anomalies quickly
              and consistently. You can run that workflow via <Link href="/check/new">CheckPay analysis</Link> once
              AVAC files are ready.
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
                href: '/guides/how-to-read-avac',
                title: 'How to Read Your QH AVAC Form',
                description: 'Field-by-field AVAC interpretation for better source accuracy.',
              },
              {
                href: '/guides/qh-overtime-calculator-guide',
                title: 'QH Overtime Calculator Guide',
                description: 'Convert clean AVAC entries into reliable expected-pay checks.',
              },
              {
                href: '/guides/qh-payroll-discrepancy-steps',
                title: 'QH Payroll Discrepancy Steps',
                description: 'Escalate unresolved AVAC-related discrepancies systematically.',
              },
            ]}
          />

          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Validate AVAC entries against payroll outcomes
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload your payslip and AVAC files to run a fast discrepancy review and identify follow-up
              items.
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
