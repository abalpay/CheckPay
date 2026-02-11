import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Start Your Free Overtime Analysis',
  description:
    'Upload your Queensland Health payslip and AVAC forms to verify overtime payments against award rules. Free, confidential, results in under 60 seconds.',
  alternates: {
    canonical: '/check/new',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://checkpay.ai',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Start Analysis',
      item: 'https://checkpay.ai/check/new',
    },
  ],
}

export default function NewAnalysisLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {children}
    </>
  )
}
