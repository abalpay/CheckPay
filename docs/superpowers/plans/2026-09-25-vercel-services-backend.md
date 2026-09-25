# Move FastAPI Backend onto Vercel Services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing FastAPI reconciliation backend inside the same Vercel project as the Next.js frontend (Vercel Services), so the live site works again with no Railway dependency.

**Architecture:** `vercel.json` declares two services: `frontend` (Next.js, repo root) and `backend` (FastAPI, `backend/`). Only `frontend` gets a public rewrite; `backend` is private and reached through a service binding that injects `BACKEND_URL` into the Next.js runtime. The browser always posts to same-origin `/api/reconcile` (Next route handler), which validates and forwards to `${BACKEND_URL}/api/reconcile`. Railway-era code (CORS, direct browser upload, CSP origin, SSRF checks on an env var, slowapi) is deleted.

**Tech Stack:** Next.js 16 App Router, Vitest, FastAPI + pdfplumber + pikepdf on Vercel Python runtime (3.12), Vercel Services (beta).

**Spec:** Review + recommendation given in-session on 2026-09-25 (no separate spec file). Key decisions: Services over separate host; keep the Next proxy route for validation; cap total upload at 4 MB to fit Vercel's 4.5 MB request-body limit.

## Global Constraints

- Vercel request body limit is 4.5 MB → client + Next route enforce **4 MB total** across all files (`4 * 1024 * 1024`). Per-file limit also 4 MB.
- Max 10 AVAC files (unchanged).
- Python runtime pinned via `backend/.python-version` = `3.12`.
- `BACKEND_URL` is platform-injected by the binding in deployments; locally falls back to `FASTAPI_RECONCILE_URL`, then `http://localhost:8000`.
- No new npm or pip dependencies. Remove `slowapi`.
- Install JS deps with `npm ci --legacy-peer-deps` (matches existing `vercel.json` installCommand).
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **Uploaded filename used in a filesystem path** (`os.path.join(tmpdir, payslip.filename)`): a filename like `../../etc/x` or `/tmp/x` escapes the temp dir. Expected: fixed server-side filenames; test in Task 1.
2. **Backend rate limit behind a binding**: every request arrives from the Next function, so a per-IP limiter throttles all users as one. Expected: backend has no per-IP limiter (Next `proxy.ts` already limits per client IP); Task 1 removes slowapi.
3. **Combined upload just over 4 MB** (e.g. 11 files × 400 KB): Expected a clear "total upload too large" error before hitting Vercel's opaque 413. Tests in Task 2 (client lib + route).
4. **`BACKEND_URL` with or without trailing slash**: Expected: upstream URL is always `…/api/reconcile`, never `//api` or dropped path segment. Test in Task 2.
5. **Backend unreachable/timeouts**: Expected: route returns JSON 500/502 with friendly message, never an HTML error page. Covered by existing catch; test in Task 2.

---

### Task 1: Backend — make it a clean private Vercel service

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/requirements.txt`
- Delete: `backend/Procfile`
- Create: `backend/.python-version`
- Create: `backend/tests/test_api.py`

**Interfaces:**
- Produces: `POST /api/reconcile` (multipart: `payslip` file, `avacs` files) → same JSON as today. FastAPI `app` object in `backend/main.py` (entrypoint `main:app`).

- [ ] **Step 1: Write failing tests** — `backend/tests/test_api.py`:

```python
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
PDF = b"%PDF-1.4 fake"


def test_no_cors_or_rate_limit_middleware():
    names = {m.cls.__name__ for m in main.app.user_middleware}
    assert "CORSMiddleware" not in names
    assert not hasattr(main, "limiter")


def test_too_many_avacs_rejected():
    files = [("payslip", ("p.pdf", PDF, "application/pdf"))] + [
        ("avacs", (f"a{i}.pdf", PDF, "application/pdf")) for i in range(11)
    ]
    r = client.post("/api/reconcile", files=files)
    assert r.status_code == 400


def test_filenames_never_reach_filesystem(monkeypatch, tmp_path):
    seen = []

    def fake_parse_payslip(path):
        seen.append(path)
        raise ValueError("stop")

    monkeypatch.setattr(main, "parse_payslip", fake_parse_payslip)
    files = [
        ("payslip", ("../../evil.pdf", PDF, "application/pdf")),
        ("avacs", ("/tmp/evil2.pdf", PDF, "application/pdf")),
    ]
    r = client.post("/api/reconcile", files=files)
    assert r.status_code == 400
    assert seen and "evil" not in seen[0]
    assert Path(seen[0]).name == "payslip.pdf"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run --python 3.12 --with-requirements requirements.txt --with pytest --with httpx pytest tests -q`
Expected: `test_no_cors_or_rate_limit_middleware` and `test_filenames_never_reach_filesystem` FAIL; others pass.

- [ ] **Step 3: Implement** in `backend/main.py`:
  - Delete imports `CORSMiddleware`, `slowapi` (`Limiter`, `get_remote_address`, `RateLimitExceeded`), `JSONResponse` if now unused; delete `limiter`, `app.state.limiter`, `ALLOWED_ORIGINS`, `app.add_middleware(...)`, the `rate_limit_handler`, and the `@limiter.limit("20/minute")` decorator. Keep `request: Request` param removal optional (remove it if unused).
  - Change `MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB (Vercel body limit is 4.5 MB)` and the message to `"File exceeds the 4 MB size limit."`.
  - Replace `os.path.join(tmpdir, payslip.filename or "payslip.pdf")` with `os.path.join(tmpdir, "payslip.pdf")`.
  - In the AVAC loop use `for i, avac_file in enumerate(avacs):` and `os.path.join(tmpdir, f"avac_{i}.pdf")`. Keep `avac_file.filename` only as the display value in `avac_name`.
  - Update the module docstring's first line if it mentions Railway (it doesn't today — leave).
- `backend/requirements.txt`: remove `slowapi>=0.1.9` and `uvicorn>=0.24` (Vercel runs the ASGI app itself; local dev below uses `uv run --with uvicorn`).
- `backend/.python-version`: `3.12`
- `git rm backend/Procfile`

- [ ] **Step 4: Run all backend tests**

Run: same command as Step 2. Expected: all pass (including `test_reconciler_pending_statuses.py`).

- [ ] **Step 5: Commit** — `git add -A backend && git commit -m "refactor(backend): prepare FastAPI app to run as private Vercel service"`

**GATE 1:** backend test suite green.

---

### Task 2: Frontend — same-origin upload through a binding-aware proxy, 4 MB total cap

**Files:**
- Modify: `app/api/reconcile/route.ts`
- Create: `app/api/reconcile/route.test.ts`
- Modify: `lib/jobs.ts` (remove `getReconcileEndpoint`, add total-size check)
- Modify: `lib/jobs.test.ts`
- Modify: `app/(app)/check/new/page.tsx` (4 MB copy/constant)
- Modify: `app/(app)/check/new/page.test.tsx`
- Modify: `next.config.js` (drop `fastApiOrigin` from CSP)

**Interfaces:**
- Consumes: backend `POST /api/reconcile` from Task 1.
- Produces: `export function getUpstreamUrl(env = process.env): string` in new `lib/upstream.ts` (not in `route.ts` — Next route files may only export handlers/config). `export const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024` in `lib/jobs.ts`, imported by the route.
- Files also: Create `lib/upstream.ts`, `lib/upstream.test.ts`. `lib/jobs.test.ts` must import `vi` from vitest.

- [ ] **Step 1: Write failing tests**

`lib/upstream.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { getUpstreamUrl } from './upstream'

describe('getUpstreamUrl', () => {
  it('uses the service binding URL', () => {
    expect(getUpstreamUrl({ BACKEND_URL: 'https://svc.internal' })).toBe('https://svc.internal/api/reconcile')
  })
  it('handles a trailing slash on the binding URL', () => {
    expect(getUpstreamUrl({ BACKEND_URL: 'https://svc.internal/' })).toBe('https://svc.internal/api/reconcile')
  })
  it('keeps a base path on the binding URL', () => {
    expect(getUpstreamUrl({ BACKEND_URL: 'https://svc.internal/base' })).toBe('https://svc.internal/base/api/reconcile')
  })
  it('falls back to FASTAPI_RECONCILE_URL verbatim', () => {
    expect(getUpstreamUrl({ FASTAPI_RECONCILE_URL: 'http://x:9/api/reconcile' })).toBe('http://x:9/api/reconcile')
  })
  it('defaults to local uvicorn', () => {
    expect(getUpstreamUrl({})).toBe('http://localhost:8000/api/reconcile')
  })
})
```

Add to `lib/jobs.test.ts` (import `startAnalyzeJob`, `MAX_TOTAL_UPLOAD_BYTES`):
```ts
describe('startAnalyzeJob', () => {
  const pdf = (name: string, size: number) =>
    new File([new Uint8Array(size)], name, { type: 'application/pdf' })

  it('rejects a combined upload over the total limit before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const third = Math.ceil(MAX_TOTAL_UPLOAD_BYTES / 3) + 1
    await expect(
      startAnalyzeJob({ payslip: pdf('p.pdf', third), avacs: [pdf('a.pdf', third), pdf('b.pdf', third)] }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/total/i) })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('always posts to same-origin /api/reconcile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
    await startAnalyzeJob({ payslip: pdf('p.pdf', 10), avacs: [pdf('a.pdf', 10)] }).catch(() => {})
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/reconcile')
    fetchSpy.mockRestore()
  })
})
```
(Check `StartAnalyzeJobParams` for any extra required fields and include them.)

`app/api/reconcile/route.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const pdf = (name: string, size = 20) => {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('%PDF-'))
  return new File([bytes], name, { type: 'application/pdf' })
}

function req(files: Array<[string, File]>) {
  const fd = new FormData()
  files.forEach(([k, f]) => fd.append(k, f))
  return new Request('http://localhost/api/reconcile', { method: 'POST', body: fd })
}

afterEach(() => vi.restoreAllMocks())

describe('POST /api/reconcile', () => {
  it('rejects combined uploads over 4 MB with 413', async () => {
    const big = 1.5 * 1024 * 1024
    const res = await POST(req([['payslip', pdf('p.pdf', big)], ['avacs', pdf('a.pdf', big)], ['avacs', pdf('b.pdf', big)]]))
    expect(res.status).toBe(413)
  })

  it('returns JSON 500 when the backend is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(500)
    expect(await res.json()).toHaveProperty('error')
  })

  it('forwards to the upstream URL and returns validated JSON', async () => {
    const body = { status: 'correction_payslip', employee: 'X', pay_date: '2025-01-01', adjustment_total: 0, avac_results: [], message: 'm' }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await POST(req([['payslip', pdf('p.pdf')], ['avacs', pdf('a.pdf')]]))
    expect(res.status).toBe(200)
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/reconcile$/)
  })
})
```
If vitest's default environment is jsdom (see `vitest.config.ts`), add `// @vitest-environment node` as the first line of `route.test.ts` and `upstream.test.ts`.

- [ ] **Step 2: Run to verify failure** — `npm run test -- --run`. Expected: new tests fail (missing module / wrong status / wrong endpoint); `page.test.tsx` still passes.

- [ ] **Step 3: Implement**

`lib/upstream.ts`:
```ts
// BACKEND_URL is injected by the Vercel Services binding (see vercel.json).
export function getUpstreamUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.BACKEND_URL) {
    return new URL('api/reconcile', env.BACKEND_URL.replace(/\/?$/, '/')).toString()
  }
  return env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'
}
```

`app/api/reconcile/route.ts`:
  - Delete `FASTAPI_RECONCILE_URL` const, `PRIVATE_HOSTNAME_PATTERNS`, `validateUpstreamUrl`, `upstreamUrlValid` and its check at the top of `POST` (the URL comes from platform/env config, not user input).
  - Replace per-file `MAX_FILE_SIZE` loop with a total check returning **413**:
    ```ts
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0)
    if (totalSize > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Total upload exceeds the 4 MB limit. Remove some AVAC files and try again.' },
        { status: 413, headers: securityHeaders },
      )
    }
    ```
  - `fetch(getUpstreamUrl(), …)`; raise timeout to `AbortSignal.timeout(60_000)` (cold start + pikepdf import).
  - Imports: `getUpstreamUrl` from `@/lib/upstream`, `MAX_TOTAL_UPLOAD_BYTES` from `@/lib/jobs`.

`lib/jobs.ts`:
  - `export const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024`
  - In `validatePdfFile`, per-file max becomes `MAX_TOTAL_UPLOAD_BYTES`, message `(max 4MB)`.
  - At the end of `validateFiles`, before `return null`:
    ```ts
    const total = [payslip, ...avacs].reduce((sum, f) => sum + f.size, 0)
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      return { field: 'avacs', message: 'Total upload is too large (max 4MB across all files)' }
    }
    ```
  - Delete `getReconcileEndpoint`; `fetch('/api/reconcile', …)` with `AbortSignal.timeout(60_000)`.

`app/(app)/check/new/page.tsx`: `MAX_FILE_SIZE = 4 * 1024 * 1024`; messages/copy `max 4MB`, `PDF only, max 4 MB`, chip `'PDF only · 4 MB total'`. Update the matching assertion in `page.test.tsx`.

`next.config.js`: delete the `fastApiOrigin` const and its `${fastApiOrigin ? … : ''}` interpolation in `connect-src`.

- [ ] **Step 4: Run** — `npm run test -- --run && npm run lint && npm run build`. Expected: all green, build succeeds.

- [ ] **Step 5: Commit** — `git commit -am "feat: route uploads same-origin through Next proxy to Vercel service backend"` (plus `git add` new files).

**GATE 2:** vitest, lint, `next build` all green.

---

### Task 3: Vercel Services config + docs

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`, `README.md`, `CLAUDE.md`, `TESTING.md`

- [ ] **Step 1: `vercel.json`**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"],
  "services": {
    "frontend": {
      "root": "./",
      "framework": "nextjs",
      "installCommand": "npm ci --legacy-peer-deps",
      "buildCommand": "npm run build",
      "bindings": [
        { "type": "service", "service": "backend", "format": "url", "env": "BACKEND_URL" }
      ]
    },
    "backend": {
      "root": "backend/",
      "framework": "fastapi",
      "entrypoint": "main:app"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```
(`env.NODE_ENV` removed: Vercel sets it for production builds already.)

- [ ] **Step 2: Docs** — `.env.example`: drop `NEXT_PUBLIC_RECONCILE_URL`; document `FASTAPI_RECONCILE_URL` as local-only fallback and `BACKEND_URL` as injected by the binding. `CLAUDE.md`/`TESTING.md`/`README.md`: 4 MB total limit; backend runs as a private Vercel Service; local dev = `vercel dev -L` (both services) or `npm run dev` + `cd backend && uv run --python 3.12 --with-requirements requirements.txt --with uvicorn uvicorn main:app --port 8000`.

- [ ] **Step 3: Local integration check** (GATE 3)
  - `npx vercel@latest dev -L --listen 3000` from repo root (needs `.vercel/` link — controller copies it in).
  - `curl -s -X POST localhost:3000/api/reconcile -F payslip=@README.md -F avacs=@README.md` → 400 "not a valid PDF" (Next route live).
  - Minimal fake PDF (`printf '%%PDF-1.4\n%%%%EOF' > /tmp/x.pdf`) posted as both fields → JSON 400 "Could not parse the payslip" **from FastAPI** (proves binding + backend + pdfplumber import).
  - If `vercel dev` can't run services locally, fall back to `npm run dev` + uvicorn and record that.

- [ ] **Step 4: Commit** — `git commit -am "chore: deploy FastAPI backend as a private Vercel Service"`

---

### Task 4 (controller): Preview deploy + project env cleanup

- [ ] Copy `.vercel/` link from main checkout; `npx vercel@latest env ls` → note `NEXT_PUBLIC_RECONCILE_URL` / `FASTAPI_RECONCILE_URL` (Railway leftovers). Removing them only affects future builds — do it with user awareness.
- [ ] `npx vercel@latest deploy` (preview). Expected: both services build; Python function bundles pdfplumber/pikepdf.
- [ ] GATE 4: repeat the Gate 3 curls against the preview URL (use `vercel curl` if Deployment Protection is on). Check `vercel logs` for backend cold start.
- [ ] Stop. Ask user before promoting to production / merging; real payslip+AVAC E2E needs user-supplied PDFs.
