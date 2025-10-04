import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePriceId, resolvePlanFromIdentifier, retrievePrice } from './stripe'

// Mock the environment
vi.mock('./env.server', () => ({
  getServerEnv: () => ({
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/account/billing',
    STRIPE_PRICE_MONTHLY: 'price_monthly_mock',
    STRIPE_PRICE_YEARLY: 'price_yearly_mock',
    STRIPE_PRICE_LOOKUP_MONTHLY: 'monthly-plan',
    STRIPE_PRICE_LOOKUP_YEARLY: 'yearly-plan',
  })
}))

// Mock Stripe
vi.mock('stripe', () => {
  const mockStripe = {
    prices: {
      list: vi.fn(),
      retrieve: vi.fn(),
    }
  }
  
  return {
    default: vi.fn(() => mockStripe)
  }
})

describe('Stripe utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolvePlanFromIdentifier', () => {
    it('should return monthly for monthly price ID', () => {
      const plan = resolvePlanFromIdentifier('price_monthly_mock')
      expect(plan).toBe('monthly')
    })

    it('should return yearly for yearly price ID', () => {
      const plan = resolvePlanFromIdentifier('price_yearly_mock')
      expect(plan).toBe('yearly')
    })

    it('should return monthly for monthly lookup key', () => {
      const plan = resolvePlanFromIdentifier('monthly-plan')
      expect(plan).toBe('monthly')
    })

    it('should return yearly for yearly lookup key', () => {
      const plan = resolvePlanFromIdentifier('yearly-plan')
      expect(plan).toBe('yearly')
    })

    it('should return null for unknown identifier', () => {
      const plan = resolvePlanFromIdentifier('unknown-plan')
      expect(plan).toBe(null)
    })

    it('should return null for null/undefined identifier', () => {
      expect(resolvePlanFromIdentifier(null)).toBe(null)
      expect(resolvePlanFromIdentifier(undefined)).toBe(null)
    })
  })

  describe('resolvePriceId', () => {
    it('should return price ID when configured', async () => {
      const priceId = await resolvePriceId('monthly')
      expect(priceId).toBe('price_monthly_mock')
    })

    it('should throw error when no price configuration exists', async () => {
      // Mock environment without price configuration
      vi.doMock('./env.server', () => ({
        getServerEnv: () => ({
          STRIPE_SECRET_KEY: 'sk_test_mock',
          STRIPE_WEBHOOK_SECRET: 'whsec_mock',
          STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/account/billing',
        })
      }))

      await expect(resolvePriceId('monthly')).rejects.toThrow(
        'Missing Stripe price configuration for monthly plan'
      )
    })
  })
})
