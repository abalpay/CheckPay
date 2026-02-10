'use client'

import { Fragment, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const steps = [
  {
    title: 'Upload docs',
    description:
      'Drop in your latest payslips and AVAC forms. Files are encrypted and auto-delete after analysis.',
  },
  {
    title: 'Cross-check',
    description:
      'Our rules engine verifies allowances and overtime claims against current QH award settings.',
  },
  {
    title: 'Get report',
    description:
      'Receive a clear summary of potential discrepancies with practical next steps for review.',
  },
]

const COUNTER_DURATION_MS = 400

export default function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [inView, setInView] = useState(false)
  const [counts, setCounts] = useState({
    first: 0,
    second: 0,
    third: 0,
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
      { threshold: 0.35 },
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
      const progress = Math.min(elapsed / COUNTER_DURATION_MS, 1)
      setCounts({
        first: Math.round(1 * progress),
        second: Math.round(2 * progress),
        third: Math.round(3 * progress),
      })

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [inView])

  const getStepCount = (index: number) => {
    switch (index) {
      case 0:
        return counts.first
      case 1:
        return counts.second
      case 2:
        return counts.third
      default:
        return 0
    }
  }

  return (
    <section id="how-it-works" ref={sectionRef} className="bg-[var(--cp-bg-primary)] py-16 md:py-24">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="cp-display text-[clamp(2rem,4vw,2.75rem)] leading-tight text-[var(--cp-text-primary)]">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[var(--cp-text-secondary)] md:text-lg">
            A focused three-step flow built for quick and confidential overtime verification.
          </p>
        </div>

        <div className="mt-14 hidden md:block">
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-6">
            {steps.map((step, index) => (
              <Fragment key={step.title}>
                <article className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-accent)] text-base font-bold text-white cp-mono">
                    {getStepCount(index)}
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-[var(--cp-text-primary)]">{step.title}</h3>
                  <p className="mx-auto mt-3 max-w-[280px] text-base leading-relaxed text-[var(--cp-text-secondary)]">
                    {step.description}
                  </p>
                </article>

                {index < steps.length - 1 && (
                  <div className="mt-5 h-0.5 w-24 overflow-hidden bg-[var(--cp-border)]">
                    <span
                      className={cn(
                        'block h-full origin-left bg-[var(--cp-accent)] transition-transform duration-700 ease-in-out',
                        inView ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="relative mt-12 space-y-8 md:hidden">
          <div className="absolute left-5 top-2 h-[calc(100%-2.5rem)] w-[2px] bg-[var(--cp-border)]">
            <span
              className={cn(
                'absolute inset-x-0 top-0 origin-top bg-[var(--cp-accent)] transition-transform duration-700 ease-in-out',
                inView ? 'scale-y-100' : 'scale-y-0',
              )}
              style={{ height: '100%' }}
            />
          </div>

          {steps.map((step, index) => (
            <article key={step.title} className="relative pl-16">
              <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-accent)] text-base font-bold text-white cp-mono">
                {getStepCount(index)}
              </div>
              <h3 className="text-lg font-semibold text-[var(--cp-text-primary)]">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--cp-text-secondary)]">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
