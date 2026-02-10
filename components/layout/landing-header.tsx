'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Logo from './logo'

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed top-0 z-40 w-full px-4 pt-4">
      <div className="mx-auto max-w-[1120px]">
        <div
          className={cn(
            'flex h-14 items-center justify-between rounded-xl border px-3 backdrop-blur transition-all duration-200 md:px-4',
            scrolled
              ? 'border-[var(--cp-border)] bg-[rgba(250,250,249,0.96)] shadow-[0_8px_24px_rgba(26,26,26,0.06)]'
              : 'border-white/20 bg-black/25',
          )}
        >
          <Logo inverted={!scrolled} />

          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="#how-it-works"
              className={cn(
                'text-sm font-medium transition-colors',
                scrolled ? 'text-[#5C5C5C] hover:text-[#1A1A1A]' : 'text-[#FAFAF9]/80 hover:text-[#FAFAF9]',
              )}
            >
              How It Works
            </Link>
            <Link
              href="#why-checkpay"
              className={cn(
                'text-sm font-medium transition-colors',
                scrolled ? 'text-[#5C5C5C] hover:text-[#1A1A1A]' : 'text-[#FAFAF9]/80 hover:text-[#FAFAF9]',
              )}
            >
              Why CheckPay
            </Link>
          </nav>

          <Button
            asChild
            size="sm"
            className="h-9 rounded-md bg-[var(--cp-accent)] px-4 text-sm font-semibold text-white transition duration-150 hover:scale-[1.02] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_10px_20px_rgba(0,87,255,0.25)]"
          >
            <Link href="/check/new">Start Free Analysis</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
