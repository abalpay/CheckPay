import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export type RelatedGuideLink = {
  href: string
  title: string
  description: string
}

export default function RelatedGuides({
  items,
}: {
  items: RelatedGuideLink[]
}) {
  return (
    <section className="mt-12 rounded-xl border border-[var(--cp-border)] bg-white p-6 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="cp-display text-2xl text-[var(--cp-text-primary)]">Related Guides</h2>
        <Link
          href="/guides"
          className="text-sm font-medium text-[var(--cp-accent)] transition-colors hover:text-[var(--cp-accent-hover)]"
        >
          Browse all guides
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.href}
            className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] p-4"
          >
            <h3 className="text-base font-semibold text-[var(--cp-text-primary)]">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cp-text-secondary)]">
              {item.description}
            </p>
            <Link
              href={item.href}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--cp-accent)] transition-colors hover:text-[var(--cp-accent-hover)]"
            >
              Read guide
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
