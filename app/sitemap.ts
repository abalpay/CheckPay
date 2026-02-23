import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: 'https://checkpay.ai',
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://checkpay.ai/check/new',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://checkpay.ai/check/sample-report',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/qh-overtime-rates',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/how-to-read-avac',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/claiming-overtime-qh',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/qh-overtime-calculator-guide',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/qld-junior-doctor-underpayment-check',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/qh-avac-common-errors',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/guides/qh-payroll-discrepancy-steps',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://checkpay.ai/privacy',
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
