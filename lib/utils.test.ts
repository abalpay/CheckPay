import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn', () => {
  it('merges class names while filtering falsy values', () => {
    expect(cn('flex', null, undefined, 'items-center', false && 'hidden')).toBe(
      'flex items-center'
    )
  })

  it('prefers the later Tailwind class when conflicts occur', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
