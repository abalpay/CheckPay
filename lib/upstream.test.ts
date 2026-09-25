// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getUpstreamUrl } from './upstream'

describe('getUpstreamUrl', () => {
  it('uses the service binding URL', () => {
    expect(getUpstreamUrl('api/reconcile', { BACKEND_URL: 'https://svc.internal' })).toBe('https://svc.internal/api/reconcile')
  })
  it('handles a trailing slash on the binding URL', () => {
    expect(getUpstreamUrl('api/reconcile', { BACKEND_URL: 'https://svc.internal/' })).toBe('https://svc.internal/api/reconcile')
  })
  it('keeps a base path on the binding URL', () => {
    expect(getUpstreamUrl('api/reconcile', { BACKEND_URL: 'https://svc.internal/base' })).toBe('https://svc.internal/base/api/reconcile')
  })
  it('falls back to FASTAPI_RECONCILE_URL', () => {
    expect(getUpstreamUrl('api/reconcile', { FASTAPI_RECONCILE_URL: 'http://x:9/api/reconcile' })).toBe('http://x:9/api/reconcile')
  })
  it('defaults to local uvicorn', () => {
    expect(getUpstreamUrl('api/reconcile', {})).toBe('http://localhost:8000/api/reconcile')
  })
  it('builds sibling backend paths from BACKEND_URL', () => {
    expect(getUpstreamUrl('api/parse', { BACKEND_URL: 'http://backend/' })).toBe('http://backend/api/parse')
    expect(getUpstreamUrl('api/reconcile/json', { FASTAPI_RECONCILE_URL: 'http://localhost:8000/api/reconcile' }))
      .toBe('http://localhost:8000/api/reconcile/json')
  })
})
