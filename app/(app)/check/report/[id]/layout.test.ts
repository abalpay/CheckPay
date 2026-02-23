import { describe, expect, it } from 'vitest'

import { metadata } from './layout'

describe('Report layout metadata', () => {
  it('keeps dynamic report pages noindex and nofollow', () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    })
  })
})
