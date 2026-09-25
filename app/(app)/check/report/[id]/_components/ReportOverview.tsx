import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'

import { type AnalysisJson } from '@/lib/jobs'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  describePayslipScope,
  toSafeNumber,
  type StatusTone,
} from '../report-formatters'
import { type ReportViewModel } from '../report-view-model'

const createdFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// Tints tuned for the dark band (all >= 7:1 on --cp-bg-dark).
const DARK_TONE_TEXT: Record<StatusTone, string> = {
  owed: 'text-[#ffb4a6]',
  timing: 'text-[#f2c874]',
  review: 'text-[#d6d9e0]',
  ok: 'text-[#8fdcb0]',
  info: 'text-[#a9c3ff]',
}

interface ReportOverviewProps {
  analysis: AnalysisJson
  viewModel: ReportViewModel
  reportCreatedAt: string | null
  isSampleReport: boolean
}

interface HeadlineFigure {
  label: string
  value: string
  note: string
  tone: StatusTone | null
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function getHeadlineFigure(analysis: AnalysisJson, viewModel: ReportViewModel): HeadlineFigure | null {
  if (analysis.status === 'correction_payslip') {
    if (typeof analysis.overpayment_amount !== 'number') return null
    return {
      label: 'Overpayment on this payslip',
      value: formatCurrency(analysis.overpayment_amount),
      note: 'Recorded as a correction, not an AVAC claim.',
      tone: 'review',
    }
  }

  const rows = viewModel.needsFollowUpNowRows
  const shortfall = rows.reduce((sum, row) => sum + Math.max(0, -toSafeNumber(row.difference)), 0)
  const overpaid = rows.reduce((sum, row) => sum + Math.max(0, toSafeNumber(row.difference)), 0)

  switch (viewModel.decisionState) {
    case 'INCOMPLETE_REVIEW':
      return {
        label: 'AVAC files read',
        value: viewModel.topParsedAvacsLabel,
        note: 'Re-upload the files to run the check.',
        tone: 'owed',
      }
    case 'ACTION_NOW':
      if (shortfall > 0) {
        return {
          label: 'Possibly underpaid',
          value: formatCurrency(shortfall),
          note:
            `Across ${plural(rows.length, 'line')} on ${viewModel.payslipScope}.` +
            (overpaid > 0 ? ` A further ${formatCurrency(overpaid)} may have been overpaid.` : ''),
          tone: 'owed',
        }
      }
      return {
        label: overpaid > 0 ? 'Possibly overpaid' : 'Lines to confirm',
        value: overpaid > 0 ? formatCurrency(overpaid) : String(rows.length),
        note: 'Confirm with payroll before anything is clawed back.',
        tone: 'review',
      }
    case 'CHECK_ADJACENT_PAYSLIP':
      return {
        label: `Underpaid on ${viewModel.payslipScope}`,
        value: formatCurrency(0),
        note: `${plural(viewModel.likelyOtherPayslipCount, 'claim')} to look for on other payslips.`,
        tone: 'timing',
      }
    default:
      return {
        label: `Underpaid on ${viewModel.payslipScope}`,
        value: formatCurrency(0),
        note: 'Nothing to raise with payroll.',
        tone: 'ok',
      }
  }
}

/** DM Serif's "$" is very wide; set it smaller and raised so the digits carry the figure. */
function FigureValue({ value }: { value: string }) {
  const firstDigit = value.search(/\d/)
  if (firstDigit <= 0) return <>{value}</>
  return (
    <>
      <span className="mr-1 align-[0.45em] text-[0.5em]">{value.slice(0, firstDigit)}</span>
      {value.slice(firstDigit)}
    </>
  )
}


export function ReportOverview({
  analysis,
  viewModel,
  reportCreatedAt,
  isSampleReport,
}: ReportOverviewProps) {
  const figure = getHeadlineFigure(analysis, viewModel)

  const payslipScope = describePayslipScope(analysis)
  const facts = [
    { label: 'Doctor', value: analysis.employee || '—' },
    ...(payslipScope.count > 1 ? [{ label: 'Payslips', value: String(payslipScope.count) }] : []),
    { label: payslipScope.count > 1 ? 'Pay dates' : 'Pay date', value: payslipScope.payDate },
    { label: payslipScope.count > 1 ? 'Pay periods' : 'Pay period', value: payslipScope.period },
    { label: 'AVAC files read', value: viewModel.topParsedAvacsLabel },
    {
      label: 'Generated',
      value: reportCreatedAt ? createdFormatter.format(new Date(reportCreatedAt)) : '—',
    },
  ]

  return (
    <section
      aria-labelledby="report-verdict"
      className="relative isolate -mt-4 overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_85%_0%,rgba(0,87,255,0.18),transparent_65%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 md:pb-14 md:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/check/new"
            className="inline-flex items-center gap-2 rounded-md py-1 text-sm text-[#c8c8c8] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            New check
          </Link>
          {isSampleReport && (
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-[#d9d9d9]">
              <Info className="h-3.5 w-3.5 shrink-0 text-[#a9c3ff]" aria-hidden />
              Sample report preview — fictional data, not your payroll result.
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-end lg:gap-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a3a3a3]">
              Overtime reconciliation report
            </p>
            <h1
              id="report-verdict"
              className="cp-display mt-4 max-w-[22ch] text-balance text-[clamp(2.125rem,4.8vw,3.375rem)] leading-[1.04]"
            >
              {viewModel.decisionHeadline}
            </h1>
            <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-[#c8c8c8] md:text-base">
              {viewModel.decisionDetail}
            </p>
          </div>

          {figure && (
            <div className="border-t border-white/15 pt-6 lg:border-l lg:border-t-0 lg:pb-1 lg:pl-10 lg:pt-0">
              <p className="text-sm text-[#b6b6b6]">{figure.label}</p>
              <p
                className={cn(
                  'cp-display mt-2 text-[clamp(2.75rem,6vw,4rem)] leading-none tabular-nums',
                  figure.tone ? DARK_TONE_TEXT[figure.tone] : 'text-white'
                )}
              >
                <FigureValue value={figure.value} />
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#c8c8c8]">{figure.note}</p>
            </div>
          )}
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-6 sm:grid-cols-3 lg:grid-cols-5 md:mt-14">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a9a9a]">
                {fact.label}
              </dt>
              <dd className="mt-1 break-words text-sm text-[#ededed]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
