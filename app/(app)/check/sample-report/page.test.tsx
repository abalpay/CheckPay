import { describe, expect, it } from 'vitest'

import { metadata } from './page'

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
