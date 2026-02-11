import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Overtime Verification Report',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
