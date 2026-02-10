import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { formatCurrency, formatReportDate } from '../report-formatters'
import { type PayrollContextModel } from '../report-view-model'

interface PayrollContextPanelProps {
  context: PayrollContextModel
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

export function PayrollContextPanel({ context }: PayrollContextPanelProps) {
  const adjustmentWindow =
    context.earliestAdjustmentDate && context.latestAdjustmentDate
      ? `${formatReportDate(context.earliestAdjustmentDate)} – ${formatReportDate(context.latestAdjustmentDate)}`
      : '—'

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Payroll context</CardTitle>
        <CardDescription>
          Reference details for reconciliation context. Hidden by default to keep the page focused.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full rounded-lg border px-4">
          <AccordionItem value="payroll-context" className="border-none">
            <AccordionTrigger className="hover:no-underline">Show payroll context</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Parsed AVACs" value={context.parsedAvacs} />
                <Field label="Check previous" value={String(context.checkPreviousCount)} />
                <Field label="Check future" value={String(context.checkFutureCount)} />
                <Field label="Issue (window)" value={String(context.withinWindowIssueCount)} />
                <Field label="Adjustment window" value={adjustmentWindow} />
                <Field label="Adjustment total" value={formatCurrency(context.adjustmentTotal)} />
                <Field label="Base rate" value={formatCurrency(context.baseRate)} />
                <Field label="Older adjustments total" value={formatCurrency(context.olderAdjustmentsTotal)} />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
