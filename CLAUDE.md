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
- `FASTAPI_RECONCILE_URL` (optional): override target URL for `/api/reconcile`.
- Default is `http://localhost:8000/api/reconcile`.

### File Size Limits
- Maximum 5MB per PDF file
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
