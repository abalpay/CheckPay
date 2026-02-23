import { describe, expect, it } from 'vitest'

import sitemap from './sitemap'

describe('sitemap', () => {
  it('includes canonical indexable URLs and excludes dynamic noindex routes', () => {
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls).toContain('https://checkpay.ai')
    expect(urls).toContain('https://checkpay.ai/check/new')
    expect(urls).toContain('https://checkpay.ai/check/sample-report')
    expect(urls).toContain('https://checkpay.ai/guides')
    expect(urls).toContain('https://checkpay.ai/guides/qh-overtime-rates')
    expect(urls).toContain('https://checkpay.ai/guides/how-to-read-avac')
    expect(urls).toContain('https://checkpay.ai/guides/claiming-overtime-qh')
    expect(urls).toContain('https://checkpay.ai/guides/qh-overtime-calculator-guide')
    expect(urls).toContain('https://checkpay.ai/guides/qld-junior-doctor-underpayment-check')
    expect(urls).toContain('https://checkpay.ai/guides/qh-avac-common-errors')
    expect(urls).toContain('https://checkpay.ai/guides/qh-payroll-discrepancy-steps')
    expect(urls).toContain('https://checkpay.ai/privacy')

    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.some((url) => url.includes('/check/report/'))).toBe(false)
    expect(urls.some((url) => url.includes('/api/'))).toBe(false)
  })
})
