# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15.5.3 application called "CheckPay" for overtime payment verification.

Current product flow:
1. Users land on the marketing page at `/`.
2. Users click **Start Analysis** to open `/check/new`.
3. Users upload one payslip PDF and one or more AVAC PDFs.
4. The app posts files to `/api/reconcile` (proxy to FastAPI) and renders `/check/report/[id]`.

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
- **Framework**: Next.js 15.5.3 with App Router
- **React**: Version 19.1.1
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
- Maximum 4MB per file; the browser sends one request per AVAC (payslip + that AVAC), so each request stays under Vercel's 4.5MB body limit. AVAC XFA PDFs are ~900KB each.
- Maximum 10 AVAC files per submission

### Data Flow
- Analysis results use the `AnalysisJson` interface in `/lib/jobs.ts`.
- Reports are stored in temporary in-memory state (`/lib/session-reports.ts`).
- Refreshing the page clears in-memory report data.

## Important Implementation Details

### Next.js 15 Migration Notes
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
- Meal and fatigue lines are not reconciled
