import { afterEach, describe, expect, it, vi } from 'vitest'

const pageviewMock = vi.fn()

vi.mock('@vercel/analytics', () => ({
  pageview: (...args: unknown[]) => pageviewMock(...args),
}))

import { trackFunnel } from './funnel'

afterEach(() => {
  vi.unstubAllEnvs()
  pageviewMock.mockReset()
})

describe('trackFunnel', () => {
  it('records a pageview for the step route in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    trackFunnel('analysis-started')

    expect(pageviewMock).toHaveBeenCalledWith({
      route: '/_funnel/analysis-started',
      path: '/_funnel/analysis-started',
    })
  })

  it.each(['development', 'test'] as const)('is a no-op outside production (%s)', (env) => {
    vi.stubEnv('NODE_ENV', env)

    trackFunnel('files-added')

    expect(pageviewMock).not.toHaveBeenCalled()
  })

  it('never throws when pageview throws', () => {
    vi.stubEnv('NODE_ENV', 'production')
    pageviewMock.mockImplementation(() => {
      throw new Error('boom')
    })

    expect(() => trackFunnel('analysis-failed')).not.toThrow()
  })
})
