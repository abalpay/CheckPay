import { CircleAlert, CircleCheck, CircleHelp, Clock, Info, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { formatStatusLabel, getStatusTone, type StatusTone } from '../report-formatters'

export const TONE_STYLES: Record<StatusTone, { pill: string; text: string; icon: LucideIcon }> = {
  owed: { pill: 'bg-[var(--cp-owed-bg)] text-[var(--cp-owed)] ring-[var(--cp-owed-ring)]', text: 'text-[var(--cp-owed)]', icon: CircleAlert },
  review: { pill: 'bg-[var(--cp-review-bg)] text-[var(--cp-review)] ring-[var(--cp-review-ring)]', text: 'text-[var(--cp-review)]', icon: CircleHelp },
  timing: { pill: 'bg-[var(--cp-timing-bg)] text-[var(--cp-timing)] ring-[var(--cp-timing-ring)]', text: 'text-[var(--cp-timing)]', icon: Clock },
  ok: { pill: 'bg-[var(--cp-ok-bg)] text-[var(--cp-ok)] ring-[var(--cp-ok-ring)]', text: 'text-[var(--cp-ok)]', icon: CircleCheck },
  info: { pill: 'bg-[var(--cp-accent-subtle)] text-[var(--cp-accent-hover)] ring-[#cfdcfb]', text: 'text-[var(--cp-accent-hover)]', icon: Info },
}

interface StatusPillProps {
  status: string
  label?: string
  className?: string
}

/** Status is always conveyed by icon + words, never colour alone. */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const { pill, icon: Icon } = TONE_STYLES[getStatusTone(status)]
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        pill,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label ?? formatStatusLabel(status)}
    </span>
  )
}
