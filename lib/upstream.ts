// BACKEND_URL is injected by the Vercel Services binding (see vercel.json).
export function getUpstreamUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.BACKEND_URL) {
    return new URL('api/reconcile', env.BACKEND_URL.replace(/\/?$/, '/')).toString()
  }
  return env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'
}
