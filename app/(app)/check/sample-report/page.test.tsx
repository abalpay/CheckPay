import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SampleReportPage, { metadata } from './page'

describe('Sample report page metadata', () => {
  it('is indexable with canonical sample route metadata', () => {
    expect(metadata.alternates?.canonical).toBe('/check/sample-report')
    expect(metadata.robots).toBeUndefined()

    const title = metadata.title
    if (typeof title === 'string') {
      expect(title).toContain('Sample Queensland Health Overtime Report')
      return
    }

    expect(title).toEqual({ absolute: 'Sample Queensland Health Overtime Report | CheckPay' })
  })
})

describe('Sample report page', () => {
  it('renders the sample report directly, without an intermediate click', async () => {
    render(<SampleReportPage />)

    expect(
      await screen.findByRole('heading', { level: 1, name: '2 items to raise with payroll.' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Open interactive sample report/i)).not.toBeInTheDocument()
  })
})
