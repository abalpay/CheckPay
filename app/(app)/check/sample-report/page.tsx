import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SAMPLE_REPORT_ID } from '@/lib/sample-report'

export const metadata: Metadata = {
  title: 'Sample Overtime Report — See What CheckPay Finds',
  description:
    'View a sample Queensland Health overtime verification report. See how CheckPay cross-references payslips and AVAC forms to identify discrepancies.',
  alternates: {
    canonical: '/check/sample-report',
  },
}

export default function SampleReportPage() {
  redirect(`/check/report/${SAMPLE_REPORT_ID}`)
}
