import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Start Your Free Overtime Analysis',
  description:
    'Upload your Queensland Health payslip and AVAC forms to verify overtime payments against award rules. Free, confidential, results in under 60 seconds.',
  alternates: {
    canonical: '/check/new',
  },
}

export default function NewAnalysisLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
