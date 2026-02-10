import Link from 'next/link'
import { ArrowRight, LockKeyhole, ScanSearch, Stethoscope } from 'lucide-react'

import { Button } from '@/components/ui/button'

const trustPills = [
  {
    icon: Stethoscope,
    label: 'Built for QH RMOs',
  },
  {
    icon: ScanSearch,
    label: 'Smart rules engine',
  },
  {
    icon: LockKeyhole,
    label: 'Secure & auto-delete',
  },
]

export default function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
      <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] cp-grid" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_70%_at_50%_5%,rgba(0,87,255,0.22),transparent_65%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1120px] px-6 pb-20 pt-32 md:pb-24 md:pt-44 lg:min-h-[90vh] lg:pt-48">
        <div className="mx-auto max-w-3xl text-center">
          <div className="cp-reveal inline-flex rounded-full border border-[var(--cp-accent)]/40 bg-[var(--cp-accent-subtle)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cp-accent)]">
            QH Overtime Assistant
          </div>

          <h1 className="cp-display cp-reveal cp-reveal-delay-1 mt-6 text-[clamp(2.5rem,6.2vw,4rem)] leading-[1.04] text-[var(--cp-text-inverse)]">
            Verify your QH overtime.
            <br />
            Accurately. Confidentially.
          </h1>

          <p className="cp-reveal cp-reveal-delay-2 mx-auto mt-6 max-w-[62ch] text-[1.0625rem] leading-relaxed text-[#C8C8C8] md:text-[1.125rem]">
            Upload your payslips and AVAC forms. We cross-check against QH award rules and surface
            potential underpayments in under a minute.
          </p>

          <div className="cp-reveal cp-reveal-delay-3 mt-10 flex flex-col items-center gap-4">
            <Button
              asChild
              className="h-auto rounded-lg bg-[var(--cp-accent)] px-8 py-4 text-base font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
            >
              <Link href="/check/new" className="inline-flex items-center gap-2">
                Start Free Analysis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-sm text-[#B6B6B6]">Free to start · Results in ~60 seconds</p>
          </div>

          <div className="cp-reveal cp-reveal-delay-4 mt-12 border-t border-white/15 pt-8">
            <ul className="mx-auto grid max-w-[760px] gap-3 sm:grid-cols-3">
              {trustPills.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#D9D9D9]"
                >
                  <Icon className="h-4 w-4 text-[var(--cp-accent)]" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
