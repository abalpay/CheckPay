// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetRateLimits } from '@/lib/rate-limit'
import { proxy } from './proxy'

const post = (path: string, ip = '203.0.113.7') =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, host: 'localhost:3000', origin: 'http://localhost:3000' },
  })

beforeEach(() => resetRateLimits())

describe('proxy rate limits', () => {
  it('lets one whole year through: 86 parses and then a reconcile', () => {
    for (let i = 0; i < 86; i++) expect(proxy(post('/api/parse')).status).toBe(200)
    expect(proxy(post('/api/reconcile')).status).toBe(200)
  })

  it('caps parses at 200 per 10 minutes per IP', () => {
    for (let i = 0; i < 200; i++) expect(proxy(post('/api/parse')).status).toBe(200)
    expect(proxy(post('/api/parse')).status).toBe(429)
    expect(proxy(post('/api/parse', '198.51.100.1')).status).toBe(200)
  })

  it('caps analyses at 6 per 10 minutes and keeps the two budgets apart', () => {
    for (let i = 0; i < 6; i++) expect(proxy(post('/api/reconcile')).status).toBe(200)
    expect(proxy(post('/api/reconcile')).status).toBe(429)
    expect(proxy(post('/api/parse')).status).toBe(200)
  })

  it('still refuses a cross-site POST', () => {
    const evil = new NextRequest('http://localhost:3000/api/parse', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7', host: 'localhost:3000', origin: 'https://evil.example' },
    })
    expect(proxy(evil).status).toBe(403)
  })
})
