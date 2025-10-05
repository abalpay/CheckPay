import * as React from 'react'
import { cn } from '@/lib/utils'

export type SummaryStatVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'rose'
  | 'neutral'

export interface SummaryStatBreakdownItem {
  label: string
  value: number | string
}

export interface SummaryStatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: number | string
  breakdown?: SummaryStatBreakdownItem[]
  variant?: SummaryStatVariant
  icon?: React.ReactNode
}

const variantStyles: Record<SummaryStatVariant, { card: string; accent: string }> = {
  primary: {
    card: 'from-blue-500/10 via-indigo-500/10 to-indigo-500/10 border-blue-200/40',
    accent: 'bg-gradient-to-r from-blue-500 to-indigo-500',
  },
  success: {
    card: 'from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border-emerald-200/40',
    accent: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  },
  warning: {
    card: 'from-amber-500/10 via-orange-500/10 to-orange-500/10 border-amber-200/40',
    accent: 'bg-gradient-to-r from-amber-500 to-orange-500',
  },
  rose: {
    card: 'from-rose-500/10 via-pink-500/10 to-rose-500/10 border-rose-200/40',
    accent: 'bg-gradient-to-r from-rose-500 to-pink-500',
  },
  neutral: {
    card: 'from-slate-500/10 via-slate-400/10 to-slate-500/10 border-slate-200/40',
    accent: 'bg-gradient-to-r from-slate-500 to-slate-600',
  },
}

function formatValue(value: number | string): string {
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  return value
}

export const SummaryStatCard = React.forwardRef<HTMLDivElement, SummaryStatCardProps>(
  ({ label, value, breakdown, variant = 'primary', icon, className, ...props }, ref) => {
    const { card, accent } = variantStyles[variant]
    const breakdownLabel = React.useMemo(() => {
      if (!breakdown || breakdown.length === 0) return null

      const parts = breakdown
        .filter((item) => {
          if (typeof item.value === 'number') {
            return item.value !== 0
          }
          return `${item.value}`.trim().length > 0
        })
        .map((item) => `${item.label} ${formatValue(item.value)}`)

      return parts.length > 0 ? `(${parts.join(' / ')})` : null
    }, [breakdown])

    return (
      <div
        ref={ref}
        className={cn(
          'group relative overflow-hidden rounded-2xl border bg-gradient-to-br bg-white/80 p-5 text-slate-800 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
          card,
          className
        )}
        {...props}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className={cn('h-1.5 w-12 rounded-full shadow-sm', accent)} aria-hidden="true" />
            {icon ? (
              <div className="opacity-20 transition-opacity group-hover:opacity-30">
                {icon}
              </div>
            ) : null}
          </div>
          <span className="text-4xl font-bold tracking-tight text-slate-800 transition-colors group-hover:text-slate-900">
            {formatValue(value)}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{label}</span>
            {breakdownLabel ? (
              <span className="text-xs font-medium text-slate-500">{breakdownLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    )
  }
)

SummaryStatCard.displayName = 'SummaryStatCard'
