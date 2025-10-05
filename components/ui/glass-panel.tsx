import * as React from 'react'
import { cn } from '@/lib/utils'

type GlassPanelVariant =
  | 'slate'
  | 'indigo'
  | 'amber'
  | 'midnight'
  | 'plain'

type GlassPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: GlassPanelVariant
  padding?: 'none' | 'md' | 'lg'
}

const baseClass =
  'relative overflow-hidden rounded-3xl border shadow-xl backdrop-blur-sm transition-transform duration-300'

const variantClasses: Record<GlassPanelVariant, string> = {
  slate: 'border-slate-200/60 bg-gradient-to-br from-white via-slate-50/30 to-blue-50/20',
  indigo: 'border-indigo-200/60 bg-gradient-to-br from-white via-indigo-50/50 to-blue-50/50',
  amber: 'border-amber-200/60 bg-gradient-to-br from-white via-amber-50/30 to-orange-50/20',
  midnight:
    'border-white/10 bg-slate-900/80 text-white shadow-2xl backdrop-blur-lg transition-all duration-500 hover:shadow-3xl',
  plain: 'border-transparent bg-white/60 shadow-lg',
}

const paddingClasses: Record<NonNullable<GlassPanelProps['padding']>, string> = {
  none: 'p-0',
  md: 'p-6',
  lg: 'p-8',
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ variant = 'slate', padding = 'lg', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(baseClass, variantClasses[variant], paddingClasses[padding], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

GlassPanel.displayName = 'GlassPanel'

export type { GlassPanelProps, GlassPanelVariant }
