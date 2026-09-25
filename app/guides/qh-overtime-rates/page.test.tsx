import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import QhOvertimeRatesPage from './page'

describe('QhOvertimeRatesPage', () => {
  it('renders the check-your-payslip CTA near the top, above the article body, with correct links', () => {
    render(<QhOvertimeRatesPage />)

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Queensland Health Overtime Rates for Medical Officers')

    const ctaHeading = screen.getByRole('heading', { level: 2, name: 'Check your own payslip' })
    expect(ctaHeading.tagName).toBe('H2') // never the page h1

    const startLink = screen.getByRole('link', { name: /Start free check/ })
    expect(startLink).toHaveAttribute('href', '/check/new')

    const sampleLink = screen.getByRole('link', { name: 'See a sample report' })
    expect(sampleLink).toHaveAttribute('href', '/check/sample-report')

    // Positioned after the intro heading and before the first body heading.
    const bodyHeading = screen.getByRole('heading', { level: 2, name: 'When Does Overtime Apply?' })
    const position = h1.compareDocumentPosition(ctaHeading)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const ctaBeforeBody = ctaHeading.compareDocumentPosition(bodyHeading)
    expect(ctaBeforeBody & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
