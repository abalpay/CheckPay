# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 16 application called "CheckPay" for overtime payment verification.

Current product flow:
1. Users land on the marketing page at `/`.
2. Users click **Start Analysis** to open `/check/new`.
3. Users drop any mix of payslip and AVAC PDFs (or a folder) into one dropzone; each file is classified and parsed as it lands (`/api/parse`, `kind=auto`).
4. The app parses each PDF via `/api/parse` (one file per request), then posts the parsed JSON to `/api/reconcile` (proxy to FastAPI `/api/reconcile/json`) and renders `/check/report/[id]`.

The app has no authentication and no database.

## Commands

### Development
- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

### Testing
- `npm run test -- --run` - Run Vitest once

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **React**: Version 19.2
- **TypeScript**: Version 5.9.2
- **UI Components**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with tailwind-merge and class-variance-authority
- **File Upload**: react-dropzone for PDF handling
- **Backend Integration**: FastAPI reconciliation service (proxied by Next.js)

### Environment Configuration
- The backend runs as a private Vercel Service (see `vercel.json`); it has no public URL and no CORS config.
- `BACKEND_URL`: injected automatically by the Vercel Services binding. `lib/upstream.ts` resolves it to `<BACKEND_URL>/api/reconcile`.
- `FASTAPI_RECONCILE_URL` (optional, local-only fallback): used by `/api/reconcile` when `BACKEND_URL` is unset, e.g. plain `npm run dev` + local uvicorn. Default is `http://localhost:8000/api/reconcile`.

### File Size Limits
- Maximum 4MB per file; every `/api/parse` request carries exactly one PDF and the reconcile request carries only parsed JSON (≤ 3MB), so each request stays under Vercel's 4.5MB body limit. AVAC XFA PDFs are ~900KB each.
- Maximum 26 payslips and 60 AVAC files per analysis (a year); 150 files per drop

### Data Flow
- Analysis results use the `AnalysisJson` interface in `/lib/jobs.ts`.
- The backend merges all uploaded payslips (one per pay date) and all AVACs in one deterministic call. Page 1 of a payslip is read as dated actuals for its fortnight.
- A claim is only called unpaid when the payslip that could have paid it is uploaded. Otherwise it gets a neutral status: `NOT_ON_THIS_PAYSLIP` (week not processed yet) or `NEEDS_FORTNIGHT_PAYSLIP` (upload the named fortnight's payslip). Pending amounts are outstanding amounts (expected minus any page-1 payment) and are not counted in the headline difference.
- AVACs: XFA forms are parsed from form data; a printed/flattened AVAC falls back to its text rows; an XFA saved without data ("Please wait…") gets a specific error.
- Reports are stored in temporary in-memory state (`/lib/session-reports.ts`).
- Refreshing the page clears in-memory report data.
- Rate limits are per analysis: 200 parses and 6 reconciles per 10 minutes per IP (proxy.ts, in-memory per instance).

## Important Implementation Details

### Next.js 15+ Notes (apply to 16)
- Dynamic route params are Promises in server and client components
- Route params require awaiting: `const { id } = await params`
- Caching behavior changed: GET routes and client router cache are uncached by default

### TypeScript Configuration
- Strict mode enabled
- Path alias `@/*` maps to project root
- Components use `.tsx` extension

### Component Library
All UI components in `/components/ui/` are shadcn/ui implementations using Radix UI primitives.

## MVP Limitations
- No authentication system
- No persistent report storage
- With several payslips, the latest base rate is used for every date (a mid-range rate increase makes older expected lines slightly high)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
