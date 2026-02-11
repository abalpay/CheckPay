'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type StatKey = 'settlement' | 'underclaim' | 'discouraged'

type Stat = {
  key: StatKey
  prefix: string
  value: number
  suffix: string
  label: string
}

const stats: Stat[] = [
  {
    key: 'settlement',
    prefix: '$',
    value: 230,
    suffix: 'M',
    label: 'Junior doctor underpayment settlement in NSW — the largest in Australian history',
  },
  {
    key: 'underclaim',
    prefix: '',
    value: 52,
    suffix: '%',
    label: 'Of QH junior doctors partially or never claim their overtime',
  },
  {
    key: 'discouraged',
    prefix: '',
    value: 22,
    suffix: '%',
    label: 'Told not to claim overtime by a senior colleague',
  },
]

const COUNT_DURATION_MS = 900

export default function StatsSection() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [inView, setInView] = useState(false)
  const [counts, setCounts] = useState<Record<StatKey, number>>({
    settlement: 0,
    underclaim: 0,
    discouraged: 0,
  })

  useEffect(() => {
    const node = sectionRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return

    const start = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / COUNT_DURATION_MS, 1)
      setCounts({
        settlement: Math.round(230 * progress),
        underclaim: Math.round(52 * progress),
        discouraged: Math.round(22 * progress),
      })

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [inView])

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[var(--cp-bg-secondary)] py-16 text-center md:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cp-accent)]">
          The Overtime Gap
        </p>

        <h2 className="cp-display mt-3 text-[clamp(2rem,4vw,2.75rem)] leading-tight text-[var(--cp-text-primary)]">
          Over half of QH junior doctors under-claim their overtime.
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--cp-text-secondary)] md:text-lg">
          These are not edge cases. Across Queensland Health, complex payroll rules and workplace
          pressures mean most RMOs leave money on the table — often without knowing it.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {stats.map(({ key, prefix, suffix, label }, index) => (
            <div
              key={key}
              className={cn(
                'rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] px-6 py-7 text-left transition-all duration-300 ease-out',
                inView ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              )}
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <p className="cp-mono text-3xl font-semibold text-[var(--cp-text-primary)] md:text-4xl">
                {prefix && (
                  <span className="text-[var(--cp-accent)]">{prefix}</span>
                )}
                {counts[key]}
                {suffix && (
                  <span className="text-[var(--cp-accent)]">{suffix}</span>
                )}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--cp-text-secondary)]">{label}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-[var(--cp-text-secondary)]">
          Sources: AMA Queensland RHHC 2023 · NSW Health (2024)
        </p>
      </div>
    </section>
  )
}
