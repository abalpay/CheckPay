import { pageview } from '@vercel/analytics'

// Vercel Hobby has no custom events, but virtual page views are countable by route in
// `vercel metrics`. Each funnel step is recorded as a pageview of a synthetic `/_funnel/*` route.
export type FunnelStep = 'files-added' | 'analysis-started' | 'analysis-succeeded' | 'analysis-failed'

/**
 * Records a funnel step as a virtual page view. Sends only the step's route — no file names,
 * counts, amounts, or employee data.
 *
 * Safety (checked in node_modules/@vercel/analytics 1.6.1 dist/index.mjs): `pageview()` just calls
 * `window.va?.(...)`. Before `<Analytics />` injects its script, `window.va` is either undefined
 * (call is a no-op) or a queueing stub installed by `inject()` (call is queued and flushed once the
 * real script loads). Either way it never throws for a missing/late script.
 */
export function trackFunnel(step: FunnelStep): void {
  if (process.env.NODE_ENV !== 'production') return
  try {
    pageview({ route: `/_funnel/${step}`, path: `/_funnel/${step}` })
  } catch {
    // Tracking must never break the app.
  }
}
