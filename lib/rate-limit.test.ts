// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { isRateLimited, resetRateLimits } from './rate-limit'

beforeEach(() => resetRateLimits())

describe('isRateLimited', () => {
  it('allows `limit` hits inside the window and refuses the next one without recording it', () => {
    const b = { limit: 2, windowMs: 1000 }
    expect(isRateLimited('k', b, 0)).toBe(false)
    expect(isRateLimited('k', b, 1)).toBe(false)
    expect(isRateLimited('k', b, 2)).toBe(true)
    expect(isRateLimited('k', b, 3)).toBe(true)
  })

  it('forgets hits older than the window (sliding)', () => {
    const b = { limit: 2, windowMs: 1000 }
    isRateLimited('k', b, 0)
    isRateLimited('k', b, 500)
    expect(isRateLimited('k', b, 999)).toBe(true)
    expect(isRateLimited('k', b, 1000)).toBe(false) // the hit at 0 has aged out
  })

  it('keeps keys apart', () => {
    const b = { limit: 1, windowMs: 1000 }
    expect(isRateLimited('a', b, 0)).toBe(false)
    expect(isRateLimited('b', b, 0)).toBe(false)
    expect(isRateLimited('a', b, 1)).toBe(true)
  })
})
