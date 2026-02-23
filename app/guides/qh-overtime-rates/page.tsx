import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Queensland Health Overtime Rates for Medical Officers (2025)',
  description:
    'Complete breakdown of QH overtime rates by classification level (L1–L13). Understand MOCA 5 penalty rates, weekend and public holiday rates for junior doctors.',
  alternates: {
    canonical: '/guides/qh-overtime-rates',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Queensland Health Overtime Rates for Medical Officers',
  description:
    'Complete breakdown of QH overtime rates by classification level (L1–L13) under the Medical Officers Award and MOCA 5.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2025-02-11',
  dateModified: '2025-02-11',
  mainEntityOfPage: 'https://checkpay.ai/guides/qh-overtime-rates',
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
      name: 'QH Overtime Rates',
      item: 'https://checkpay.ai/guides/qh-overtime-rates',
    },
  ],
}

export default function QhOvertimeRatesPage() {
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
              Queensland Health Overtime Rates for Medical Officers
            </h1>
            <p className="mt-6 max-w-[64ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              A clear breakdown of overtime penalty rates by classification level under the Medical
              Officers&apos; (Queensland Health) Certified Agreement (MOCA 5) and the Medical
              Officers&apos; Award — State.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>When Does Overtime Apply?</h2>
            <p>
              Under the MOCA 5 agreement, overtime applies when a medical officer works beyond their
              ordinary rostered hours. For full-time medical officers, ordinary hours are typically
              38 per week (or an average of 38 hours over a roster cycle). Any time worked beyond
              these ordinary hours — including unrostered callbacks, extended shifts, and additional
              duties — is classified as overtime.
            </p>
            <p>Key triggers for overtime include:</p>
            <ul>
              <li>Hours worked beyond the ordinary span of duty for your roster</li>
              <li>Unrostered recalls and callbacks outside normal working hours</li>
              <li>Work performed on rostered days off (RDOs)</li>
              <li>Shift extensions beyond rostered finish times</li>
            </ul>

            <h2>Overtime Rate Structure</h2>
            <p>
              Queensland Health overtime rates for medical officers are calculated as multiples of
              your base hourly rate, which varies by classification level (L1 through L13). The
              multiplier depends on when the overtime is worked:
            </p>

            <table>
              <thead>
                <tr>
                  <th>Day Type</th>
                  <th>First 3 Hours</th>
                  <th>After 3 Hours</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Weekday</strong> (Mon–Fri)</td>
                  <td>150%</td>
                  <td>200%</td>
                </tr>
                <tr>
                  <td><strong>Saturday</strong></td>
                  <td>150%</td>
                  <td>200%</td>
                </tr>
                <tr>
                  <td><strong>Sunday</strong></td>
                  <td>200% (all hours)</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td><strong>Public Holiday</strong></td>
                  <td>250% (all hours)</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>

            <div className="guide-callout">
              <p>
                <strong>Key point:</strong> Weekday and Saturday overtime transitions from 150% to
                200% after the first 3 hours. A common payroll error is paying all overtime hours at
                150%, missing the double-time escalation.
              </p>
            </div>

            <h2>Classification Levels Explained</h2>
            <p>
              Queensland Health medical officers are classified from Level 1 (L1) through Level 13
              (L13). Your classification determines your base salary and therefore your base hourly
              rate for overtime calculations:
            </p>
            <ul>
              <li>
                <strong>L1–L2:</strong> Intern / Junior House Officer (PGY1–PGY2)
              </li>
              <li>
                <strong>L3–L5:</strong> Senior House Officer (PGY3–PGY5)
              </li>
              <li>
                <strong>L6–L9:</strong> Registrar
              </li>
              <li>
                <strong>L10–L13:</strong> Senior Registrar / Principal House Officer
              </li>
            </ul>
            <p>
              Your base hourly rate is derived from your annual salary divided by the standard
              annual ordinary hours. This rate is then multiplied by the relevant overtime penalty
              rate to calculate your overtime payment for each shift.
            </p>

            <h2>Common Payroll Discrepancies</h2>
            <p>
              Payroll errors with overtime are more common than most doctors realise. The most
              frequent issues include:
            </p>
            <ul>
              <li>Overtime paid at the wrong classification level after a recent increment</li>
              <li>Weekday overtime incorrectly paid at time-and-a-half for all hours instead of transitioning to double time after 3 hours</li>
              <li>Public holiday overtime paid at double time instead of double-time-and-a-half</li>
              <li>Callbacks not recorded or paid as overtime at all</li>
              <li>AVAC form entries not matching what appears on the payslip</li>
            </ul>

            <h2>How to Verify Your Overtime Pay</h2>
            <p>
              Manually checking your overtime against award rates is time-consuming and error-prone.
              CheckPay automates this by cross-referencing your payslip against your AVAC forms and
              current award rates — identifying any discrepancies in under 60 seconds.
            </p>
          </div>

          <RelatedGuides
            items={[
              {
                href: '/guides/qh-overtime-calculator-guide',
                title: 'QH Overtime Calculator Guide',
                description: 'Apply these rates with practical formulas and worked examples.',
              },
              {
                href: '/guides/how-to-read-avac',
                title: 'How to Read Your QH AVAC Form',
                description: 'Verify source entries before reconciling paid overtime lines.',
              },
              {
                href: '/guides/qld-junior-doctor-underpayment-check',
                title: 'Junior Doctor Underpayment Check',
                description: 'Turn rate discrepancies into a structured payroll review process.',
              },
            ]}
          />

          {/* CTA */}
          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Think your overtime might be wrong?
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Upload your payslip and AVAC forms for a free, confidential analysis.
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
