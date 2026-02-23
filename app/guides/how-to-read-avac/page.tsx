import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'How to Read Your AVAC Form — QH Medical Officers',
  description:
    'Step-by-step guide to understanding AVAC form fields, columns, and common mistakes. Learn what each section means and how to spot payroll discrepancies.',
  alternates: {
    canonical: '/guides/how-to-read-avac',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Read Your AVAC Form — QH Medical Officers',
  description:
    'Step-by-step guide to understanding AVAC form fields and spotting payroll discrepancies.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2025-02-11',
  dateModified: '2025-02-11',
  mainEntityOfPage: 'https://checkpay.ai/guides/how-to-read-avac',
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
      name: 'How to Read AVAC',
      item: 'https://checkpay.ai/guides/how-to-read-avac',
    },
  ],
}

export default function HowToReadAvacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([articleJsonLd, breadcrumbJsonLd]) }}
      />

      {/* Hero */}
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
              How to Read Your QH AVAC Form
            </h1>
            <p className="mt-6 max-w-[64ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              A practical guide to understanding every field on your Attendance, Variation, and
              Adjustment Claim (AVAC) form — and how to spot discrepancies before they hit your pay.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>What Is an AVAC Form?</h2>
            <p>
              The AVAC (Attendance, Variation, and Adjustment Claim) form is the primary document
              used by Queensland Health to record variations from your standard roster. This includes
              overtime, shift swaps, callbacks, and other attendance changes. It is the official
              record that drives what appears on your payslip for non-standard hours.
            </p>
            <p>
              Understanding your AVAC is critical because payroll processes your pay based on what
              appears on this form — not what you actually worked. If your AVAC is incomplete or
              incorrect, your pay will be too.
            </p>

            <h2>Key Fields on the AVAC Form</h2>

            <h3>Employee Details</h3>
            <p>
              The top section of the AVAC contains your identifying information: name, employee
              number, classification level, and the facility or department. Verify your
              classification level is correct, as this directly determines your hourly rate for
              overtime calculations.
            </p>

            <h3>Pay Period</h3>
            <p>
              The pay period indicates which fortnight the AVAC covers. Queensland Health runs on a
              fortnightly pay cycle, and each AVAC should correspond to exactly one pay period. Check
              that the dates match the payslip you are comparing against.
            </p>

            <h3>Date and Day Columns</h3>
            <p>
              Each row on the AVAC represents one day. The date and day-of-week columns help you
              verify that entries line up with the correct days — this matters because weekend and
              public holiday rates differ significantly from weekday rates.
            </p>

            <h3>Start Time and Finish Time</h3>
            <p>
              These columns record when your shift actually started and ended, as opposed to when it
              was rostered. The difference between rostered and actual times is what generates
              overtime. Pay attention to entries where the finish time extends well past your rostered
              end — these should be reflected as overtime on your payslip.
            </p>

            <h3>Overtime Hours</h3>
            <p>
              The overtime column should show the total overtime hours claimed for each day. This is
              calculated from the difference between your ordinary hours and actual hours worked.
              Verify that the hours here match your own records of when you started and finished.
            </p>

            <h3>Claim Type / Reason Codes</h3>
            <p>
              AVAC forms use reason codes to classify the type of variation — for example, overtime,
              callback, on-call, or shift swap. The reason code determines how the hours are paid.
              An incorrect code can result in hours being paid at the wrong rate or not paid at all.
            </p>

            <h3>Approval Signatures</h3>
            <p>
              Each AVAC entry typically requires supervisor approval. Unsigned or unapproved entries
              may be held up or excluded from the pay run. If you notice missing pay, check whether
              the corresponding AVAC entries were approved in time.
            </p>

            <h2>Common Mistakes to Watch For</h2>
            <ul>
              <li>
                <strong>Wrong classification level:</strong> If you have recently progressed (e.g.,
                L4 to L5), check the AVAC reflects your new level from the correct date.
              </li>
              <li>
                <strong>Missing entries:</strong> Shifts you worked overtime on but that do not
                appear on the AVAC at all — these will not be paid.
              </li>
              <li>
                <strong>Incorrect day type:</strong> A Sunday or public holiday entered as a
                standard weekday will be paid at a lower rate.
              </li>
              <li>
                <strong>Rounded or truncated hours:</strong> Overtime rounded down by even 15
                minutes per shift adds up significantly over a pay period.
              </li>
              <li>
                <strong>Late submissions:</strong> AVAC entries submitted after the payroll cut-off
                may be deferred to a later pay period and easy to lose track of.
              </li>
            </ul>

            <h2>How AVAC Data Reaches Your Payslip</h2>
            <p>
              After your supervisor approves the AVAC, the data is entered into Queensland
              Health&apos;s payroll system (typically LATTICE/SAP). The system calculates your
              entitlements based on the hours and reason codes, applies the appropriate penalty
              rates for your classification level, and generates your payslip.
            </p>
            <p>
              Errors can occur at multiple points: the AVAC might be filled in incorrectly, data
              entry into the payroll system might introduce errors, or the system might apply the
              wrong rate. That is why cross-checking your AVAC against your payslip is essential.
            </p>

            <h2>Verify Your AVAC Against Your Payslip</h2>
            <p>
              Manually matching every AVAC entry to the corresponding payslip line is tedious and
              error-prone. CheckPay automates this process — upload your payslip and AVAC forms, and
              get a detailed reconciliation report in under 60 seconds.
            </p>
          </div>

          <RelatedGuides
            items={[
              {
                href: '/guides/qh-avac-common-errors',
                title: 'QH AVAC Common Errors',
                description: 'Catch the highest-impact documentation mistakes before submission.',
              },
              {
                href: '/guides/qh-overtime-rates',
                title: 'Queensland Health Overtime Rates',
                description: 'Use the correct multipliers for each AVAC day and claim type.',
              },
              {
                href: '/guides/qh-payroll-discrepancy-steps',
                title: 'QH Payroll Discrepancy Steps',
                description: 'Escalate unresolved AVAC-to-payslip mismatches with clear evidence.',
              },
            ]}
          />

          {/* CTA */}
          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Check your AVAC against your payslip
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload both documents and get a free reconciliation report in seconds.
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
