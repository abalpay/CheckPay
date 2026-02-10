'use client'

import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, LockKeyhole, Scale, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type StatKey = 'time' | 'steps' | 'files'

type Stat = {
  key: StatKey
  value: number
  suffix: string
  label: string
}

const stats = [
  { key: 'time', value: 60, suffix: 's', label: 'Typical time to first result' },
  { key: 'steps', value: 3, suffix: '', label: 'Steps from upload to report' },
  { key: 'files', value: 0, suffix: '', label: 'Documents retained after analysis' },
] satisfies Stat[]

const features = [
  {
    icon: BrainCircuit,
    title: 'AVAC Form Intelligence',
    description:
      'Maps AVAC entries to the right shift allowances and penalty rates for the pay period under review.',
  },
  {
    icon: Scale,
    title: 'Award Compliance',
    description:
      'Cross-checks overtime against current Queensland Health awards and enterprise agreement rules.',
  },
  {
    icon: LockKeyhole,
    title: 'Confidential by Design',
    description:
      'Data stays in Australia and results remain visible only to you throughout the review workflow.',
  },
  {
    icon: Trash2,
    title: 'Auto-Delete Security',
    description:
      'Every uploaded document is automatically removed once analysis is complete to reduce data exposure.',
  },
]

const COUNT_DURATION_MS = 800

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [inView, setInView] = useState(false)
  const [counts, setCounts] = useState({
    time: 0,
    steps: 0,
    files: 0,
  })

  useEffect(() => {
    const node = sectionRef.current
    if (!node) {
      return
    }

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
    if (!inView) {
      return
    }

    const start = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / COUNT_DURATION_MS, 1)
      setCounts({
        time: Math.round(60 * progress),
        steps: Math.round(3 * progress),
        files: 0,
      })

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [inView])

  const getStatValue = (key: StatKey) => {
    switch (key) {
      case 'time':
        return counts.time
      case 'steps':
        return counts.steps
      case 'files':
        return counts.files
      default:
        return 0
    }
  }

  return (
    <section id="why-checkpay" ref={sectionRef} className="bg-[var(--cp-bg-secondary)] py-16 md:py-24">
      <div className="mx-auto max-w-[1120px] px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
          Why This Matters
        </p>
        <h2 className="cp-display mt-3 max-w-3xl text-[clamp(2rem,4vw,2.75rem)] leading-tight text-[var(--cp-text-primary)]">
          Healthcare payroll is Australia&apos;s highest-risk sector for errors.
        </h2>

        <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--cp-text-secondary)] md:text-lg">
          Complex shift penalties, allowances, and AVAC processes make manual checks difficult to verify
          confidently. CheckPay gives QH teams a faster way to validate claims against current award rules.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] px-5 py-4"
            >
              <p className="cp-mono text-2xl font-semibold text-[var(--cp-text-primary)]">
                {getStatValue(stat.key)}
                {stat.suffix}
              </p>
              <p className="mt-2 text-sm text-[var(--cp-text-secondary)]">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-5 md:mt-14 md:grid-cols-2">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article
              key={title}
              className={cn(
                'rounded-xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] px-6 py-7 transition-all duration-300 ease-out md:px-7',
                inView ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              )}
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--cp-accent-subtle)] text-[var(--cp-accent)]">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-[var(--cp-text-primary)]">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-[var(--cp-text-secondary)]">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
