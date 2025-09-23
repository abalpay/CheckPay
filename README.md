# CheckPay

This repository contains the CheckPay Next.js application. See `CLAUDE.md` for an extended project overview and development guidance.

## Supabase clients
- `lib/supabase-client.ts`: Browser and client components (uses the public anon key).
- `lib/supabase-server.ts`: Server route handlers and server components (uses the service role key; guarded with `server-only`).
- `lib/supabase-auth.ts`: Auth helpers for route handlers and server components.

