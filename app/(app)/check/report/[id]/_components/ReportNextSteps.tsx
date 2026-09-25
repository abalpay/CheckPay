import { Printer, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { type ReportViewModel } from '../report-view-model'

interface ReportNextStepsProps {
  steps: string[]
  confidenceLevel: ReportViewModel['confidenceLevel']
  confidenceDetail: string
  onPrint: () => void
}

export function ReportNextSteps({ steps, confidenceLevel, confidenceDetail, onPrint }: ReportNextStepsProps) {
  return (
    <section aria-labelledby="next-steps-heading">
      <h2
        id="next-steps-heading"
        className="cp-display border-b border-[var(--cp-text-primary)] pb-3 text-2xl text-[var(--cp-text-primary)]"
      >
        What to do next
      </h2>

      <ol className="mt-2">
        {steps.map((step, index) => (
          <li
            key={`${index}-${step}`}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-b border-[var(--cp-border)] py-4 text-[15px] leading-relaxed text-[var(--cp-text-primary)]"
          >
            <span className="cp-display text-xl leading-6 text-[var(--cp-accent)]" aria-hidden>
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        onClick={onPrint}
        className="mt-6 h-11 w-full gap-2 rounded-lg bg-[var(--cp-accent)] text-sm font-semibold text-white hover:bg-[var(--cp-accent-hover)] focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2"
      >
        <Printer className="h-4 w-4" aria-hidden />
        Print summary
      </Button>

      <div className="mt-8 text-sm leading-relaxed text-[var(--cp-text-secondary)]">
        <p className="font-medium text-[var(--cp-text-primary)]">
          Confidence: {confidenceLevel.charAt(0)}{confidenceLevel.slice(1).toLowerCase()}
        </p>
        <p className="mt-1">{confidenceDetail}</p>
      </div>

      <p className="mt-6 flex gap-2 text-xs leading-relaxed text-[var(--cp-text-secondary)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        CheckPay is decision support, not payroll advice. Check against your official payroll records before
        lodging a query.
      </p>
    </section>
  )
}
