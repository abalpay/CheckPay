import { formatCurrency, formatLongDate } from '../report-formatters'
import { type PayrollContextModel } from '../report-view-model'

interface PayrollContextPanelProps {
  context: PayrollContextModel
}

export function PayrollContextPanel({ context }: PayrollContextPanelProps) {
  const adjustmentWindow =
    context.earliestAdjustmentDate && context.latestAdjustmentDate
      ? `${formatLongDate(context.earliestAdjustmentDate)} – ${formatLongDate(context.latestAdjustmentDate)}`
      : '—'

  const fields = [
    { label: 'AVAC files read', value: context.parsedAvacs },
    { label: 'Adjustment window', value: adjustmentWindow },
    { label: 'Claims before window', value: String(context.checkPreviousCount) },
    { label: 'Claims after window', value: String(context.checkFutureCount) },
    { label: 'Issues inside window', value: String(context.withinWindowIssueCount) },
    { label: 'Adjustments on this payslip', value: formatCurrency(context.adjustmentTotal) },
    { label: 'Base hourly rate', value: formatCurrency(context.baseRate) },
    { label: 'Older adjustments', value: formatCurrency(context.olderAdjustmentsTotal) },
  ]

  return (
    <section aria-labelledby="assessment-heading">
      <h3 id="assessment-heading" className="text-base font-semibold text-[var(--cp-text-primary)]">
        How this report was assessed
      </h3>
      <p className="mt-1 max-w-[70ch] text-sm text-[var(--cp-text-secondary)]">
        The payslip’s adjustment window decides which claims can be checked against it. Claims outside the window are
        listed for checking on other payslips.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 lg:grid-cols-4 lg:gap-x-8">
        {fields.map((field) => (
          <div key={field.label} className="border-t border-[var(--cp-border)] py-3">
            <dt className="text-xs text-[var(--cp-text-secondary)]">{field.label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--cp-text-primary)]">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
