import Link from 'next/link'

import CurrentYear from './current-year'
import Logo from './logo'

export default function Footer({ border = false }: { border?: boolean }) {
  return (
    <footer className="relative overflow-hidden bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)]">
      <div className="pointer-events-none absolute inset-0 opacity-40 cp-grain" aria-hidden />
      <div
        className={`mx-auto grid max-w-[1120px] gap-10 px-6 py-14 md:grid-cols-3 ${
          border ? 'border-t border-white/10' : ''
        }`}
      >
        <div className="relative z-10 space-y-3">
          <Logo inverted />
          <p className="max-w-xs text-sm leading-relaxed text-[#D4D4D4]">
            Ensuring fair overtime pay for healthcare workers.
          </p>
          <p className="text-sm text-[#BDBDBD]">
            &copy; <CurrentYear /> CheckPay
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#FAFAF9]">Product</h3>
          <ul className="space-y-2 text-sm text-[#D4D4D4]">
            <li>
              <Link href="/#how-it-works" className="transition-colors hover:text-[#FAFAF9]">
                How It Works
              </Link>
            </li>
            <li>
              <Link href="/#why-checkpay" className="transition-colors hover:text-[#FAFAF9]">
                Features
              </Link>
            </li>
            <li>
              <Link href="/check/new" className="transition-colors hover:text-[#FAFAF9]">
                Start Analysis
              </Link>
            </li>
          </ul>
        </div>

        <div className="relative z-10 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#FAFAF9]">Guides</h3>
          <ul className="space-y-2 text-sm text-[#D4D4D4]">
            <li>
              <Link href="/guides" className="transition-colors hover:text-[#FAFAF9]">
                All Guides
              </Link>
            </li>
            <li>
              <Link href="/guides/qh-overtime-rates" className="transition-colors hover:text-[#FAFAF9]">
                QH Overtime Rates
              </Link>
            </li>
            <li>
              <Link href="/guides/how-to-read-avac" className="transition-colors hover:text-[#FAFAF9]">
                How to Read AVAC
              </Link>
            </li>
            <li>
              <Link href="/guides/claiming-overtime-qh" className="transition-colors hover:text-[#FAFAF9]">
                Claiming Overtime
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="transition-colors hover:text-[#FAFAF9]">
                Privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
