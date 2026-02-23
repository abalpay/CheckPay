import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import RelatedGuides from '@/components/guides/related-guides'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'How to Claim Overtime at Queensland Health — Junior Doctor Guide',
  description:
    'Practical guide to the QH overtime claim process for medical officers. Learn timeframes, AVAC submission, what to do if underpaid, and your rights under the award.',
  alternates: {
    canonical: '/guides/claiming-overtime-qh',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Claim Overtime at Queensland Health — Junior Doctor Guide',
  description:
    'Practical guide to the QH overtime claim process, timeframes, and what to do if underpaid.',
  author: { '@type': 'Organization', name: 'CheckPay' },
  publisher: { '@type': 'Organization', name: 'CheckPay', url: 'https://checkpay.ai' },
  datePublished: '2025-02-11',
  dateModified: '2025-02-11',
  mainEntityOfPage: 'https://checkpay.ai/guides/claiming-overtime-qh',
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
      name: 'Claiming Overtime at QH',
      item: 'https://checkpay.ai/guides/claiming-overtime-qh',
    },
  ],
}

export default function ClaimingOvertimeQhPage() {
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
              How to Claim Overtime at Queensland Health
            </h1>
            <p className="mt-6 max-w-[64ch] text-base leading-relaxed text-[#C8C8C8] md:text-lg">
              A practical, step-by-step guide for junior doctors and medical officers on how to
              submit overtime claims, meet deadlines, and escalate underpayment issues.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <article className="bg-[var(--cp-bg-primary)] py-14 md:py-20">
        <div className="mx-auto max-w-[720px] px-6">
          <div className="guide-article">
            <h2>The Overtime Claim Process</h2>
            <p>
              Claiming overtime at Queensland Health follows a defined process. Understanding each
              step — and the common pitfalls — helps ensure you are paid correctly and on time.
            </p>

            <h3>Step 1: Record Your Hours</h3>
            <p>
              Keep a personal record of your actual start and finish times each shift. Many doctors
              use a simple note on their phone or a small notebook. This is your evidence if a
              dispute arises later. Do not rely solely on the roster or the AVAC submitted by
              someone else.
            </p>

            <h3>Step 2: Complete Your AVAC Form</h3>
            <p>
              At the end of each pay period (fortnightly), complete your AVAC form with all
              variations from the standard roster. This includes overtime, callbacks, shift swaps,
              and any other non-standard attendance. Be precise with times — round to the nearest
              minute, not the nearest half-hour.
            </p>
            <p>
              For more detail on what each AVAC field means, see our{' '}
              <Link href="/guides/how-to-read-avac">guide to reading AVAC forms</Link>.
            </p>

            <h3>Step 3: Get Supervisor Approval</h3>
            <p>
              Your AVAC must be signed off by your supervisor (typically the department registrar
              or consultant on call). Submit your AVAC promptly — ideally within a day or two of the
              pay period ending. Late submissions risk missing the payroll cut-off.
            </p>

            <h3>Step 4: Payroll Processing</h3>
            <p>
              Once approved, the AVAC data is entered into the payroll system. Queensland Health
              processes payroll on a fortnightly cycle. Your overtime should appear on the payslip
              for the corresponding pay period, though late-submitted AVACs may be processed in the
              following period.
            </p>

            <h3>Step 5: Check Your Payslip</h3>
            <p>
              When your payslip arrives, verify that every overtime entry from your AVAC is
              reflected and paid at the correct rate. Cross-reference the hours, dates, and penalty
              rates. This is where most underpayment issues are discovered.
            </p>

            <h2>Key Deadlines and Timeframes</h2>
            <ul>
              <li>
                <strong>AVAC submission:</strong> Ideally within 1–2 days of the pay period ending.
                Check your facility&apos;s specific cut-off — it varies by hospital.
              </li>
              <li>
                <strong>Payroll processing:</strong> Typically 3–5 business days after the AVAC
                cut-off date.
              </li>
              <li>
                <strong>Backdated claims:</strong> Under the award, you can claim underpayments
                going back up to 6 years for current employees. However, the sooner you identify and
                raise an issue, the easier it is to resolve.
              </li>
            </ul>

            <div className="guide-callout">
              <p>
                <strong>Important:</strong> You can backdate overtime claims up to 6 years as a
                current employee. Do not assume older underpayments are lost — gather your records
                and raise the issue formally.
              </p>
            </div>

            <h2>What to Do If You Are Underpaid</h2>
            <p>
              If you identify a discrepancy between your AVAC and your payslip, follow these steps:
            </p>
            <ol>
              <li>
                <strong>Document the discrepancy:</strong> Note the specific dates, hours, and rates
                that are incorrect. Keep copies of both your AVAC and payslip.
              </li>
              <li>
                <strong>Raise it with your line manager or payroll contact:</strong> Most issues are
                genuine errors and can be resolved at this level. Email (not verbal) creates a paper
                trail.
              </li>
              <li>
                <strong>Follow up in writing:</strong> If the issue is not resolved within one pay
                cycle, send a formal written request referencing the specific award clause and
                attaching your evidence.
              </li>
              <li>
                <strong>Contact your union:</strong> If internal resolution fails, your union
                (typically ASMOF Queensland for medical officers) can assist with formal disputes
                and back-pay claims.
              </li>
              <li>
                <strong>Lodge a complaint:</strong> As a last resort, you can lodge a complaint with
                the Queensland Industrial Relations Commission (QIRC).
              </li>
            </ol>

            <h2>Your Rights Under the Award</h2>
            <p>
              As a Queensland Health medical officer, your overtime entitlements are protected under
              the Medical Officers&apos; (Queensland Health) Certified Agreement and the Medical
              Officers&apos; Award — State. Key rights include:
            </p>
            <ul>
              <li>The right to be paid for all authorised overtime at the correct penalty rate</li>
              <li>The right to claim backdated underpayments (up to 6 years for current employees)</li>
              <li>Protection from adverse action for claiming your entitlements</li>
              <li>
                The right to request a detailed breakdown of how your overtime was calculated
              </li>
            </ul>
            <p>
              For current overtime rates by classification level, see our{' '}
              <Link href="/guides/qh-overtime-rates">QH overtime rates guide</Link>.
            </p>

            <h2>Tips for Junior Doctors</h2>
            <div className="guide-callout">
              <p>
                <strong>Keep your own records.</strong> A timestamped phone note of your actual start
                and finish times is your best evidence in any dispute. Do not rely solely on the
                roster or AVAC submitted by someone else.
              </p>
            </div>
            <ul>
              <li>
                <strong>Claim every minute:</strong> Do not round down or skip small amounts of
                overtime. Fifteen minutes per shift, five days a week, adds up to significant
                amounts over a year.
              </li>
              <li>
                <strong>Keep your own records:</strong> Your personal log is your best evidence in
                any dispute. A timestamped phone note is sufficient.
              </li>
              <li>
                <strong>Submit AVACs on time:</strong> Late submissions are the most common reason
                for missed overtime payments.
              </li>
              <li>
                <strong>Check every payslip:</strong> Do not assume payroll is correct. Systematic
                errors can persist for months if nobody checks.
              </li>
              <li>
                <strong>Talk to your colleagues:</strong> If you have been underpaid, others in your
                department likely have too. Collective awareness leads to faster resolution.
              </li>
            </ul>

            <h2>Automate Your Payslip Check</h2>
            <p>
              Manually cross-referencing your AVAC entries against your payslip is tedious — but
              it is important. CheckPay automates the entire process. Upload your payslip and AVAC
              forms, and get a detailed reconciliation report showing exactly where your pay matches
              (or does not match) what you are owed.
            </p>
          </div>

          <RelatedGuides
            items={[
              {
                href: '/guides/qld-junior-doctor-underpayment-check',
                title: 'Junior Doctor Underpayment Check',
                description: 'Use a structured review workflow before escalating underpayment risk.',
              },
              {
                href: '/guides/qh-payroll-discrepancy-steps',
                title: 'QH Payroll Discrepancy Steps',
                description: 'Follow a clear escalation path for unresolved payroll issues.',
              },
              {
                href: '/guides/how-to-read-avac',
                title: 'How to Read Your QH AVAC Form',
                description: 'Improve claim quality so payroll outcomes align with approved entries.',
              },
            ]}
          />

          {/* CTA */}
          <div className="mt-14 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-secondary)] p-8 text-center">
            <h3 className="cp-display text-xl text-[var(--cp-text-primary)]">
              Check if your overtime was paid correctly
            </h3>
            <p className="mx-auto mt-3 max-w-md text-base text-[var(--cp-text-secondary)]">
              Free, confidential analysis in under 60 seconds. No account required.
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
