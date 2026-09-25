'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Shown only after this long, when a cold start is the likely cause.
const SLOW_AFTER_MS = 10_000

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function AnalysisProgress({ payslipCount, avacCount, ready }: { payslipCount: number; avacCount: number; ready: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [slow, setSlow] = useState(false)

  // The Analyse button unmounts with the form; hand focus to the panel so keyboard and
  // screen reader users land on what replaced it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [ready])

  const announcement = ready
    ? `Report ready. ${plural(avacCount, 'AVAC')} checked against ${plural(payslipCount, 'payslip')}. Opening your report.`
    : slow
      ? 'Still working. The first check can take a few extra seconds.'
      : ''

  return (
    <section
      aria-labelledby="analysis-progress-heading"
      aria-busy={!ready}
      className="cp-reveal relative isolate overflow-hidden rounded-2xl bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)] shadow-[0_24px_60px_rgba(26,26,26,0.18)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,rgba(0,87,255,0.22),transparent_65%)]" aria-hidden />

      <div className="relative px-5 pb-6 pt-7 sm:px-9 sm:pb-9 sm:pt-10">
        <p className="cp-mono text-[11px] uppercase tracking-[0.12em] text-[#a9c3ff]">
          {ready ? 'Analysis complete' : 'Analysis in progress'}
        </p>
        <h2
          id="analysis-progress-heading"
          ref={headingRef}
          tabIndex={-1}
          className="cp-display mt-3 max-w-[22ch] text-[clamp(1.75rem,4.2vw,2.5rem)] leading-[1.08] outline-none"
        >
          {ready ? 'Your report is ready' : `Checking ${plural(avacCount, 'AVAC')} against ${plural(payslipCount, 'payslip')}`}
        </h2>

        <div className="mt-8">
          <p className="text-sm text-[#E6E6E4]" data-testid="analysis-stage">
            {ready ? 'Every shift compared with the award rules and your payslips' : 'Comparing every shift with the award rules and your payslips'}
          </p>
          <div
            role="progressbar"
            aria-label="Comparing shifts with payslips"
            aria-valuetext={ready ? 'Done' : 'In progress'}
            className={cn('relative mt-3 h-[3px] overflow-hidden rounded-full bg-white/15', !ready && 'cp-progress-track')}
          >
            <div className="h-full origin-left rounded-full bg-[var(--cp-accent)] transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${ready ? 1 : 0})` }} />
          </div>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-[#B6B6B6]">
          {ready
            ? 'Opening your report…'
            : slow
              ? 'Taking a little longer than usual. The first check can need a few extra seconds while the service starts up.'
              : 'Keep this tab open until your report opens.'}
        </p>

        <p role="status" aria-live="polite" className="sr-only" data-testid="analysis-announcement">
          {announcement}
        </p>
      </div>
    </section>
  )
}
