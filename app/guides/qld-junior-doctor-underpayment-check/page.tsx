import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Junior Doctor Underpayment Check in Queensland: Practical Guide',
  description:
    'Use this junior doctor underpayment check in Queensland to identify payroll gaps, document evidence, and escalate issues with clear, actionable records.',
  alternates: {
    canonical: '/guides/qld-junior-doctor-underpayment-check',
  },
}

const faqs = [
  {
    question: 'What records should I gather for an underpayment check?',
    answer:
      'Collect your payslip, approved AVAC forms, personal shift log, and any prior payroll correspondence for the same pay period.',
  },
  {
    question: 'How far back can I review underpayment risk?',
    answer:
      'As a practical approach, start with recent pay periods and expand backwards where patterns appear; retain full evidence for each period reviewed.',
  },
  {
    question: 'Should I escalate immediately after one mismatch?',
    answer:
      'Escalate quickly for clear, material discrepancies; for minor uncertainty, first confirm rates and AVAC coding to avoid avoidable back-and-forth.',
  },
  {
    question: 'What makes payroll queries resolve faster?',
    answer:
      'A concise table showing date, claim type, expected amount, paid amount, and difference usually leads to faster action than broad summaries.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Junior Doctor Underpayment Check in Queensland: Practical Guide',
  description:
    'A step-by-step underpayment check process for Queensland junior doctors using AVAC and payslip evidence.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2026-02-23',
  dateModified: '2026-02-23',
  mainEntityOfPage: 'https://checkpay.ai/guides/qld-junior-doctor-underpayment-check',
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
      name: 'Junior Doctor Underpayment Check',
      item: 'https://checkpay.ai/guides/qld-junior-doctor-underpayment-check',
    },
  ],
}

export default function QldJuniorDoctorUnderpaymentCheckPage() {
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
              Junior Doctor Underpayment Check in Queensland
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              This junior doctor underpayment check in Queensland is designed for rapid, evidence-first
              review. Use it to validate pay outcomes, build a defensible variance record, and escalate
              discrepancies with confidence. You can find related workflows in the <Link href="/guides" className="text-[#93C5FD] underline">guides hub</Link>.
            </p>
          </div>
        </div>
      </section>

      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>Why Underpayment Checks Need a System</h2>
            <p>
              Most underpayment issues are not discovered because someone reviews every pay line in
              real time. They are discovered late, usually after multiple periods, when a trend becomes
              too large to ignore. A structured review rhythm prevents small errors from becoming large
              debt over time.
            </p>
            <p>
              For junior doctors, payroll risk is amplified by rotating rosters, frequent overtime
              variation, and changing classification milestones. A repeatable check process reduces
              ambiguity and improves escalation quality.
            </p>

            <h2>How to Run a Junior Doctor Underpayment Check in Queensland</h2>
            <p>
              Run the check in five stages: collect records, reconcile each AVAC line, calculate
              expected amounts, compare against payslip pay lines, then compile a variance summary.
              Keep each stage date-specific so payroll teams can verify quickly.
            </p>

            <h3>Stage 1: Collect Source Records</h3>
            <ul>
              <li>Approved AVAC forms for the target pay period.</li>
              <li>Payslip for the same period.</li>
              <li>Your personal shift log or diary if available.</li>
              <li>Any prior query emails for unresolved lines.</li>
            </ul>
            <p>
              If AVAC records themselves look inconsistent, review <Link href="/guides/qh-avac-common-errors">common AVAC errors</Link> first so your baseline evidence is clean.
            </p>

            <h3>Stage 2: Reconcile by Date and Claim Type</h3>
            <p>
              Match each AVAC entry to the equivalent payslip line where possible. Use a tight key:
              date, day type, pay type, and units. Avoid broad &quot;total looks low&quot; comparisons at this
              point; line-level matching makes root causes visible.
            </p>

            <h3>Stage 3: Calculate Expected Pay</h3>
            <p>
              For each entry, calculate expected pay from base hourly rate and relevant multipliers.
              When uncertainty exists, cross-check with the <Link href="/guides/qh-overtime-calculator-guide">overtime calculator guide</Link> and
              the <Link href="/guides/qh-overtime-rates">overtime rates reference</Link>.
            </p>

            <h3>Stage 4: Create a Variance Table</h3>
            <p>
              Keep the table concise and auditable:
            </p>
            <ul>
              <li>Date</li>
              <li>Claim type</li>
              <li>Expected amount</li>
              <li>Paid amount</li>
              <li>Difference</li>
              <li>Evidence reference (AVAC page/line)</li>
            </ul>
            <p>
              This structure makes your query directly actionable and reduces clarification loops.
            </p>

            <h3>Stage 5: Escalate With a Clear Request</h3>
            <p>
              Send a short payroll query that references the variance table and requests correction for
              specific lines. Ask for confirmation of calculation logic where relevant. Precision matters
              more than length.
            </p>

            <h2>Patterns That Suggest Systemic Underpayment Risk</h2>
            <ul>
              <li>
                <strong>Repeated threshold misses:</strong> overtime escalation not applied after the
                initial block.
              </li>
              <li>
                <strong>Wrong day coding:</strong> weekend work mapped to weekday pay logic.
              </li>
              <li>
                <strong>Classification drift:</strong> entries processed at an outdated level after
                progression.
              </li>
              <li>
                <strong>Submission lag:</strong> approved AVAC lines missing from the expected cycle
                without explanation.
              </li>
            </ul>
            <p>
              One isolated discrepancy may be clerical. Repeated patterns usually indicate process or
              configuration issues that deserve formal follow-up.
            </p>

            <h2>Evidence Quality Rules That Improve Outcomes</h2>
            <ol>
              <li>Use one table per pay period to keep context clear.</li>
              <li>Reference exact dates and claim lines, not broad totals only.</li>
              <li>Attach source documents in the same order as your table rows.</li>
              <li>Keep a timeline of all payroll responses and promised follow-up dates.</li>
            </ol>
            <p>
              Well-structured evidence helps payroll teams verify quickly and helps you escalate without
              rebuilding the case each time.
            </p>

            <h2>When to Escalate Beyond First-Line Payroll</h2>
            <p>
              Escalate when a clear discrepancy remains unresolved after a reasonable cycle, when the
              same issue repeats across periods, or when responses do not address the documented line
              items. Keep escalation professional and evidence-based, and request a direct explanation
              of how disputed lines were calculated.
            </p>
            <p>
              Where available, include support channels that understand medical officer award
              interpretation and can validate technical pay logic.
            </p>

            <h2>Use Automation to Shorten Review Time</h2>
            <p>
              Manual reviews build understanding, but they take time. For faster full-period checks,
              upload your documents to <Link href="/check/new">CheckPay&apos;s analysis flow</Link> and use the output as your
              first-pass variance draft. You can then refine, annotate, and escalate with less admin
              overhead.
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
                href: '/guides/qh-overtime-calculator-guide',
                title: 'QH Overtime Calculator Guide',
                description: 'Calculate expected amounts before escalating discrepancies.',
              },
              {
                href: '/guides/qh-payroll-discrepancy-steps',
                title: 'QH Payroll Discrepancy Steps',
                description: 'Follow an escalation path when issues persist.',
              },
              {
                href: '/guides/qh-avac-common-errors',
                title: 'QH AVAC Common Errors',
                description: 'Fix source-document issues that distort underpayment checks.',
              },
            ]}
          />

          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Run a fast underpayment check with your files
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload payslip and AVAC documents to generate a structured discrepancy review in under a
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
      </article>
    </>
  )
}
