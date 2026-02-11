'use client'

import { useEffect, useRef, useState } from 'react'
import { BadgeCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

const classifications = [
  { title: 'Intern', level: 'L1' },
  { title: 'Junior House Officer (JHO)', level: 'L2' },
  { title: 'Senior House Officer (SHO)', level: 'L3' },
  { title: 'Principal House Officer (PHO)', level: 'L4–L7' },
  { title: 'Registrar', level: 'L4–L9' },
  { title: 'Senior Registrar', level: 'L10–L13' },
]

export default function WhoItsForSection() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [inView, setInView] = useState(false)

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

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[var(--cp-bg-dark)] py-16 text-center text-[var(--cp-text-inverse)] md:py-24"
    >
      <div className="pointer-events-none absolute inset-0 opacity-55 cp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] cp-grid" aria-hidden />

      <div className="relative mx-auto max-w-[1120px] px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cp-accent)]">
          Who It&apos;s For
        </p>

        <h2 className="cp-display mt-3 text-[clamp(2rem,4vw,2.75rem)] leading-tight">
          From intern to senior registrar. One verification tool.
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#C8C8C8] md:text-lg">
          CheckPay covers every RMO classification under the same Award overtime
          rules — so you get accurate results regardless of your training level.
        </p>

        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {classifications.map(({ title, level }, index) => (
            <div
              key={title}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-[#D9D9D9] transition-all duration-300 ease-out',
                inView ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              )}
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--cp-accent)]" />
              <span>
                {title} <span className="text-[#999]">— {level}</span>
              </span>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-[#999]">
          All covered under the Medical Officers (QH) Award – Clause 19
        </p>
      </div>
    </section>
  )
}
