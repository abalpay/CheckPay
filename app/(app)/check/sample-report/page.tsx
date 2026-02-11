import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SAMPLE_REPORT_ID } from '@/lib/sample-report'

export const metadata: Metadata = {
  title: 'Sample Report | CheckPay',
  robots: {
    index: false,
    follow: false,
  },
}

export default function SampleReportPage() {
  redirect(`/check/report/${SAMPLE_REPORT_ID}`)
}
