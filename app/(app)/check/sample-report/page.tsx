import type { Metadata } from 'next'

import { SAMPLE_REPORT_ID } from '@/lib/sample-report'

import ReportPage from '../report/[id]/page'

export const metadata: Metadata = {
  title: {
    absolute: 'Sample Queensland Health Overtime Report | CheckPay',
  },
  description:
    'Preview a sample Queensland Health overtime report with fictional data. See how CheckPay flags underpayments, missing lines, and likely future adjustments.',
  alternates: {
    canonical: '/check/sample-report',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://checkpay.ai' },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Sample Overtime Report',
      item: 'https://checkpay.ai/check/sample-report',
    },
  ],
}

export default function SampleReportPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ReportPage params={Promise.resolve({ id: SAMPLE_REPORT_ID })} />
    </>
  )
}
