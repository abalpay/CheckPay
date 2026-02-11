'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { faqs } from '@/lib/faq-data'
import { cn } from '@/lib/utils'

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="bg-[var(--cp-bg-primary)] py-16 md:py-24">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
            FAQ
          </p>
          <h2 className="cp-display mt-3 text-[clamp(2rem,4vw,2.75rem)] leading-tight text-[var(--cp-text-primary)]">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--cp-text-secondary)] md:text-lg">
            Everything you need to know about using CheckPay for your overtime verification.
          </p>

          <div className="mt-10 divide-y divide-[var(--cp-border)]">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-base font-semibold text-[var(--cp-text-primary)] md:text-lg">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-5 w-5 shrink-0 text-[var(--cp-text-secondary)] transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      'grid transition-all duration-200 ease-in-out',
                      isOpen ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="text-base leading-relaxed text-[var(--cp-text-secondary)]">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
