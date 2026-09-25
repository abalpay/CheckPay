import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { SAMPLE_REPORT_ROUTE } from '@/lib/sample-report'
import { Button } from '@/components/ui/button'

// Shared "check your own payslip" CTA, dropped near the top of every guide (after the intro,
// before the article body) so search traffic that lands on a guide sees the tool immediately.
export default function CheckPayslipCta() {
  return (
    <section className="bg-[var(--cp-bg-primary)] pb-2 pt-10 md:pt-14">
      <div className="mx-auto max-w-[720px] px-6">
        <div className="flex flex-col gap-5 rounded-2xl border border-[var(--cp-accent)]/35 bg-[var(--cp-accent-subtle)] p-6 shadow-[0_14px_30px_rgba(0,87,255,0.12)] sm:flex-row sm:items-center sm:justify-between md:p-8">
          <div>
            <h2 className="cp-display text-xl text-[#0F203A] md:text-2xl">Check your own payslip</h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-[#2D456A] md:text-base">
              Drop your payslips and AVAC forms — a whole year works — and CheckPay compares expected
              vs paid overtime in about a minute. Free, no account, nothing stored.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-11 rounded-lg bg-[var(--cp-accent)] px-6 text-sm font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
            >
              <Link href="/check/new" className="inline-flex items-center justify-center gap-2">
                Start free check
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-lg border-[var(--cp-accent)]/40 bg-white px-6 text-sm font-semibold text-[var(--cp-accent)] hover:bg-white hover:text-[var(--cp-accent-hover)]"
            >
              <Link href={SAMPLE_REPORT_ROUTE} className="inline-flex items-center justify-center">
                See a sample report
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
