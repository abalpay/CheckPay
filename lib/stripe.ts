import 'server-only'

import Stripe from 'stripe'

import { getServerEnv } from './env.server'

export type BillingPlan = 'monthly' | 'yearly'

const { STRIPE_SECRET_KEY } = getServerEnv()

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  appInfo: {
    name: 'CheckPay',
    version: '0.1.0',
  },
})

type PriceConfig = {
  priceId?: string
  lookupKey?: string
}

function getPriceConfig(plan: BillingPlan): PriceConfig {
  const {
    STRIPE_PRICE_MONTHLY,
    STRIPE_PRICE_YEARLY,
    STRIPE_PRICE_LOOKUP_MONTHLY,
    STRIPE_PRICE_LOOKUP_YEARLY,
  } = getServerEnv()

  if (plan === 'monthly') {
    return {
      priceId: STRIPE_PRICE_MONTHLY,
      lookupKey: STRIPE_PRICE_LOOKUP_MONTHLY,
    }
  }

  return {
    priceId: STRIPE_PRICE_YEARLY,
    lookupKey: STRIPE_PRICE_LOOKUP_YEARLY,
  }
}

async function findPriceByLookup(lookupKey: string, expand?: Array<string>): Promise<Stripe.Price> {
  const listExpand = expand?.map((field) =>
    field.startsWith('data.') ? field : `data.${field}`,
  )

  const { data } = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
    expand: listExpand,
  })

  const price = data[0]

  if (!price) {
    throw new Error(`No active Stripe price found for lookup key "${lookupKey}"`)
  }

  return price
}

function missingPriceConfigError(plan: BillingPlan): Error {
  const envSuffix = plan === 'monthly' ? 'MONTHLY' : 'YEARLY'
  return new Error(
    `Missing Stripe price configuration for ${plan} plan. Set STRIPE_PRICE_${envSuffix} or STRIPE_PRICE_LOOKUP_${envSuffix}.`,
  )
}

export async function resolvePriceId(plan: BillingPlan): Promise<string> {
  const { priceId, lookupKey } = getPriceConfig(plan)

  if (lookupKey) {
    const price = await findPriceByLookup(lookupKey)
    return price.id
  }

  if (priceId) {
    return priceId
  }

  throw missingPriceConfigError(plan)
}

export async function retrievePrice(
  plan: BillingPlan,
  options?: Stripe.PriceRetrieveParams,
): Promise<Stripe.Price> {
  const { priceId, lookupKey } = getPriceConfig(plan)
  const expand = options?.expand

  if (lookupKey) {
    return findPriceByLookup(lookupKey, expand)
  }

  if (!priceId) {
    throw missingPriceConfigError(plan)
  }

  return stripe.prices.retrieve(priceId, options)
}

export function resolvePlanFromIdentifier(identifier: string | null | undefined): BillingPlan | null {
  if (!identifier) {
    return null
  }

  const {
    STRIPE_PRICE_LOOKUP_MONTHLY,
    STRIPE_PRICE_LOOKUP_YEARLY,
    STRIPE_PRICE_MONTHLY,
    STRIPE_PRICE_YEARLY,
  } = getServerEnv()

  if (
    identifier === STRIPE_PRICE_LOOKUP_MONTHLY ||
    identifier === STRIPE_PRICE_MONTHLY
  ) {
    return 'monthly'
  }

  if (
    identifier === STRIPE_PRICE_LOOKUP_YEARLY ||
    identifier === STRIPE_PRICE_YEARLY
  ) {
    return 'yearly'
  }

  return null
}
