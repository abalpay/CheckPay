export type UpstreamPath = 'api/reconcile' | 'api/reconcile/json' | 'api/parse'

// BACKEND_URL is injected by the Vercel Services binding (see vercel.json).
// FASTAPI_RECONCILE_URL (legacy) names the reconcile endpoint; sibling paths are resolved from its base.
export function getUpstreamUrl(
  path: UpstreamPath = 'api/reconcile',
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.BACKEND_URL) {
    return new URL(path, env.BACKEND_URL.replace(/\/?$/, '/')).toString()
  }
  const legacy = env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'
  return new URL(path, legacy.replace(/api\/reconcile\/?$/, '')).toString()
}
