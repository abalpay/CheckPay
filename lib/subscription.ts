export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']) as ReadonlySet<string>

export type SubscriptionStatus = string | null | undefined

export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  if (!status) return false
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status)
}
