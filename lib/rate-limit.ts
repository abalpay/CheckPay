export interface RateBucket {
  limit: number
  windowMs: number
}

// ponytail: in-memory, per process. On Vercel every proxy instance counts alone, so the real ceiling is
// limit × instances — enough to stop a script, not a botnet. Upgrade path: a Vercel Firewall rate-limit
// rule (WAF custom rule on /api/parse and /api/reconcile, action "Rate limit"), then delete this file.
const hits = new Map<string, number[]>()
const LONGEST_WINDOW_MS = 10 * 60_000

// Evict idle keys so memory stays bounded between bursts.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, stamps] of hits) {
    const live = stamps.filter((t) => now - t < LONGEST_WINDOW_MS)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
}, 60_000)
;(sweeper as { unref?: () => void }).unref?.()

/** Sliding window. True when `key` already has `limit` hits inside the window; a refused hit is not recorded. */
export function isRateLimited(key: string, { limit, windowMs }: RateBucket, now = Date.now()): boolean {
  const live = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  const limited = live.length >= limit
  if (!limited) live.push(now)
  hits.set(key, live)
  return limited
}

export function resetRateLimits(): void {
  hits.clear()
}
