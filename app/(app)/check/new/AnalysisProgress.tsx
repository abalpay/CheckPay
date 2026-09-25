'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, FileText } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AvacProgressState = { state: 'pending' } | { state: 'done' } | { state: 'error'; message?: string }

// Shown only after this long, when a cold start is the likely cause.
const SLOW_AFTER_MS = 10_000

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function stageLabel(completed: number, total: number, failed: number, ready: boolean) {
  if (ready) return failed ? `${completed - failed} checked, ${failed} skipped` : `All ${plural(total, 'AVAC')} checked`
  if (completed === 0) return 'Sending your files and reading the AVAC forms'
  if (completed < total) return 'Comparing each AVAC with the award rules'
  return 'Building your report'
}

export function AnalysisProgress({
  payslipName,
  avacNames,
  progress,
  ready,
}: {
  payslipName: string
  avacNames: string[]
  progress: AvacProgressState[]
  ready: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [slow, setSlow] = useState(false)

  const total = avacNames.length
  const completed = progress.filter((p) => p.state !== 'pending').length
  const failed = progress.filter((p) => p.state === 'error').length

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

  // Announce milestones only, never every tick.
  const announcement = ready
    ? `Report ready. ${completed - failed} of ${plural(total, 'AVAC')} checked` +
      (failed ? `, ${failed} could not be read and will be noted in the report` : '') +
      '. Opening your report.'
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
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,rgba(0,87,255,0.22),transparent_65%)]"
        aria-hidden
      />

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
          {ready ? 'Your report is ready' : `Checking ${plural(total, 'AVAC')} against your payslip`}
        </h2>
        <p className="mt-3 flex min-w-0 items-center gap-2 text-sm text-[#C8C8C8]">
          <FileText className="h-4 w-4 shrink-0 text-[#a9c3ff]" aria-hidden />
          <span className="truncate">{payslipName}</span>
        </p>

        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <p className="text-[#E6E6E4]" data-testid="analysis-stage">
              {stageLabel(completed, total, failed, ready)}
            </p>
            <p className="cp-mono shrink-0 text-xs tabular-nums text-[#B6B6B6]" aria-hidden>
              {completed}/{total}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="AVAC forms checked"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-valuetext={`${completed} of ${total} checked`}
            className={cn(
              'relative mt-3 h-[3px] overflow-hidden rounded-full bg-white/15',
              !ready && 'cp-progress-track',
            )}
          >
            <div
              className="h-full origin-left rounded-full bg-[var(--cp-accent)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${total ? completed / total : 0})` }}
            />
          </div>
        </div>

        <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
          {avacNames.map((name, i) => {
            const p = progress.at(i) ?? { state: 'pending' }
            return (
              <li key={`${name}-${i}`} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                  {p.state === 'pending' && <span className="cp-pending-ring h-4 w-4 rounded-full" />}
                  {p.state === 'done' && (
                    <span className="cp-pop flex h-5 w-5 items-center justify-center rounded-full bg-[#8fdcb0] text-[var(--cp-bg-dark)]">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                  {p.state === 'error' && <CircleAlert className="cp-pop h-5 w-5 text-[#f2c874]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#FAFAF9]">{name}</p>
                  {p.state === 'error' && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[#C8C8C8]">
                      {p.message ?? 'We couldn\u2019t check this file.'}{' '}
                      <span className="text-[#9A9A9A]">It will be noted in your report.</span>
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'cp-mono mt-0.5 shrink-0 text-[11px] uppercase tracking-[0.08em]',
                    p.state === 'pending' && 'text-[#9A9A9A]',
                    p.state === 'done' && 'text-[#8fdcb0]',
                    p.state === 'error' && 'text-[#f2c874]',
                  )}
                >
                  {p.state === 'pending' ? 'Checking' : p.state === 'done' ? 'Checked' : 'Skipped'}
                </span>
              </li>
            )
          })}
        </ul>

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
