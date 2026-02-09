'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Logo from './logo'

export default function AppHeader() {
  const pathname = usePathname()
  const isNewAnalysis = pathname === '/check/new'

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cn(
      'fixed top-0 z-30 w-full bg-white/95 backdrop-blur-sm border-b border-gray-200 transition-shadow',
      scrolled && 'shadow-sm',
    )}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Site branding and App Navigation */}
          <div className="flex flex-1 items-center gap-6">
            <Logo />
            <nav className="hidden md:flex items-center gap-4">
              <Link
                href="/"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/check/new"
                className={`text-sm font-medium transition-colors ${
                  isNewAnalysis
                    ? 'text-gray-900 font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Start Analysis
              </Link>
            </nav>
          </div>

          {/* Primary app action — hidden when already on /check/new */}
          {!isNewAnalysis && (
            <div className="flex items-center justify-end gap-3">
              <Button asChild size="sm">
                <Link href="/check/new">Generate Report</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
