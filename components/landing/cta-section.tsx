import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--cp-bg-dark)] py-16 text-center text-[var(--cp-text-inverse)] md:py-24">
      <div className="pointer-events-none absolute inset-0 opacity-55 cp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] cp-grid" aria-hidden />
      <div className="relative mx-auto max-w-[1120px] px-6">
        <h2 className="cp-display text-[clamp(2rem,4vw,2.75rem)] leading-tight">
          Don&apos;t leave your overtime to chance.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#C8C8C8] md:text-lg">
          QH staff have lost thousands to payroll errors. A quick, confidential check shows you exactly
          where you stand.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            asChild
            className="h-auto rounded-lg bg-[var(--cp-accent)] px-8 py-4 text-base font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_12px_24px_rgba(0,87,255,0.35)]"
          >
            <Link href="/check/new" className="inline-flex items-center gap-2">
              Get Your QH Analysis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <p className="text-sm text-[#B6B6B6]">Free to start · Under a minute</p>
        </div>
      </div>
    </section>
  )
}
