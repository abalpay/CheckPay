import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { retrievePrice, type BillingPlan } from '@/lib/stripe'

type Plan = BillingPlan

type SerializableMetadata = Record<string, string>

type PlanDetails = {
  id: string
  unitAmount: number | null
  currency: string | null
  interval: Stripe.Price.Recurring.Interval | null
  intervalCount: number | null
  nickname: string | null
  productName: string | null
  description: string | null
  metadata: SerializableMetadata
}

function toSerializableMetadata(metadata: Stripe.Metadata | null | undefined): SerializableMetadata {
  return Object.fromEntries(Object.entries(metadata ?? {}))
}

function transformPrice(price: Stripe.Price): PlanDetails {
  const product = typeof price.product === 'object' && price.product !== null ? price.product : null

  return {
    id: price.id,
    unitAmount: price.unit_amount ?? null,
    currency: price.currency ?? null,
    interval: price.recurring?.interval ?? null,
    intervalCount: price.recurring?.interval_count ?? null,
    nickname: price.nickname ?? null,
    productName: product?.name ?? null,
    description: product?.description ?? null,
    metadata: product ? toSerializableMetadata(product.metadata) : {},
  }
}

export async function GET() {
  try {
    const [monthlyPrice, yearlyPrice] = await Promise.all([
      retrievePrice('monthly', { expand: ['product'] }),
      retrievePrice('yearly', { expand: ['product'] }),
    ])

    const response: Record<Plan, PlanDetails> = {
      monthly: transformPrice(monthlyPrice),
      yearly: transformPrice(yearlyPrice),
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Stripe pricing fetch failed', error)
    return NextResponse.json({ error: 'Unable to load pricing' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
