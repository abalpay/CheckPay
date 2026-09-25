'use client'

import { CalendarDays, CircleAlert, FileText, Loader2, X, type LucideIcon } from 'lucide-react'

import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { type Counts, type UploadItem, type UploadStatus } from './upload-state'

// Kind and state are always icon + words, never colour alone.
const BADGES: Record<'reading' | 'payslip' | 'avac' | 'error', { icon: LucideIcon; label: string; className: string }> = {
  reading: { icon: Loader2, label: 'Reading…', className: 'bg-[var(--cp-bg-secondary)] text-[var(--cp-text-secondary)] ring-[var(--cp-border)]' },
  payslip: { icon: FileText, label: 'Payslip', className: 'bg-[var(--cp-accent-subtle)] text-[var(--cp-accent-hover)] ring-[#cfdcfb]' },
  avac: { icon: CalendarDays, label: 'AVAC', className: 'bg-[var(--cp-review-bg)] text-[var(--cp-review)] ring-[var(--cp-review-ring)]' },
  error: { icon: CircleAlert, label: "Couldn't read", className: 'bg-[var(--cp-owed-bg)] text-[var(--cp-owed)] ring-[var(--cp-owed-ring)]' },
}

function badgeOf(status: UploadStatus) {
  if (status.state === 'ready') return BADGES[status.kind]
  if (status.state === 'reading') return BADGES.reading
  return BADGES.error
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function RemoveButton({ name, onClick, disabled }: { name: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--cp-text-secondary)] transition hover:border-[var(--cp-border)] hover:bg-[var(--cp-accent-subtle)] hover:text-[var(--cp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
      aria-label={`Remove ${name}`}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  )
}

export function FileList({
  items,
  counts,
  disabled,
  onRemove,
  onRemoveAll,
}: {
  items: UploadItem[]
  counts: Counts
  disabled: boolean
  onRemove: (id: string) => void
  onRemoveAll: () => void
}) {
  if (items.length === 0) return null
  const active = items.filter((i) => i.status.state !== 'skipped')
  const skipped = items.filter((i) => i.status.state === 'skipped')
  const over = counts.payslips > MAX_PAYSLIP_FILES || counts.avacs > MAX_AVAC_FILES

  return (
    <section aria-labelledby="files-heading" className="mt-6 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="files-heading" className="text-sm font-semibold text-[var(--cp-text-primary)]">Your files</h2>
        <p data-testid="file-counts" className={cn('cp-mono text-[11px] uppercase tracking-[0.08em]', over ? 'text-[var(--cp-owed)]' : 'text-[var(--cp-text-secondary)]')}>
          {counts.payslips}/{MAX_PAYSLIP_FILES} payslips · {counts.avacs}/{MAX_AVAC_FILES} AVACs{counts.skipped > 0 && ` · ${counts.skipped} skipped`}
        </p>
        <Button type="button" variant="ghost" onClick={onRemoveAll} disabled={disabled} className="h-8 px-2 text-xs text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]">
          Remove all
        </Button>
      </div>

      {active.length > 0 && (
        <ul aria-label="Files" className="mt-3 space-y-2">
          {active.map((item) => {
            const badge = badgeOf(item.status)
            const Icon = badge.icon
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-lg border border-[var(--cp-border)] bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--cp-text-primary)]">{item.file.name}</span>
                    <span className="cp-mono shrink-0 text-[11px] text-[var(--cp-text-secondary)]">{formatFileSize(item.file.size)}</span>
                    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', badge.className)}>
                      <Icon className={cn('h-3.5 w-3.5', item.status.state === 'reading' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                      {badge.label}
                    </span>
                  </div>
                  {item.status.state === 'error' && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-text-secondary)]">{item.status.message}</p>
                  )}
                </div>
                <RemoveButton name={item.file.name} onClick={() => onRemove(item.id)} disabled={disabled} />
              </li>
            )
          })}
        </ul>
      )}

      {skipped.length > 0 && (
        <details className="mt-3 rounded-lg border border-dashed border-[var(--cp-border)] px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none text-[var(--cp-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)]">
            Skipped {skipped.length} file{skipped.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {skipped.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[var(--cp-text-primary)]">{item.file.name}</span>
                  <span className="block text-[13px] text-[var(--cp-text-secondary)]">{item.status.state === 'skipped' ? item.status.reason : ''}</span>
                </span>
                <RemoveButton name={item.file.name} onClick={() => onRemove(item.id)} disabled={disabled} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
