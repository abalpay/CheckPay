import type { Metadata } from 'next'

import LandingLayout from '@/components/layout/landing-layout'

export const metadata: Metadata = {
  title: {
    template: '%s | CheckPay Guides',
    default: 'Guides | CheckPay',
  },
}

export default function GuidesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <LandingLayout>{children}</LandingLayout>
}
