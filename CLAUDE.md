# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15.5.3 application called "CheckPay" - an MVP for overtime payment verification. It allows users to upload payslips and AVAC forms to analyze overtime payments through an n8n webhook integration.

## Commands

### Development
- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

### Testing
No automated tests are currently configured. Manual testing checklist available in TESTING.md.

## Architecture

### Tech Stack
- **Framework**: Next.js 15.5.3 with App Router
- **React**: Version 19.1.1
- **TypeScript**: Version 5.9.2
- **UI Components**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with tailwind-merge and class-variance-authority
- **Forms**: react-hook-form with zod validation
- **File Upload**: react-dropzone for PDF handling
- **Backend Integration**: n8n webhook for document analysis

### Key Application Flow
1. **Upload Page** (`/check/new`): Users upload payslip + AVAC PDFs
2. **n8n Analysis**: Files sent to webhook URL (configured in `.env`)
3. **Local Storage**: Analysis results stored with generated job ID
4. **Report Page** (`/check/report/[id]`): Display analysis from localStorage

### Environment Configuration
Required environment variables:
- `NEXT_PUBLIC_N8N_ANALYZE_URL`: n8n webhook endpoint for document analysis

### File Size Limits
- Maximum 5MB per PDF file (n8n workflow limitation)
- Maximum 10 AVAC files per submission

### Data Flow
- Analysis results use the `AnalysisJson` interface defined in `lib/jobs.ts`
- OT Coverage data structure supports the new n8n response format
- Results persist in browser localStorage (no backend database)

## Important Implementation Details

### Next.js 15 Migration Notes
- Dynamic route params are now Promises (async) in both server and client components
- Route params require awaiting: `const { id } = await params`
- Caching behavior changed: GET routes and client router cache are uncached by default
- React 19 compatibility with some peer dependency warnings (use --legacy-peer-deps when needed)

### TypeScript Configuration
- Strict mode enabled
- Path alias `@/*` maps to project root
- Components use `.tsx` extension

### Component Library
All UI components in `/components/ui/` are shadcn/ui implementations using Radix UI primitives. These are pre-configured and should be used for consistency.

### State Management
- Upload form uses `useReducer` for complex state management
- No global state management library (localStorage for persistence)

### Error Handling
- File validation happens client-side before upload
- HTTP utilities in `lib/http.ts` handle timeouts and retries
- Job errors include field-specific information for UI display

## MVP Limitations
- No authentication system
- Meal and fatigue lines not reconciled
- Results stored only in browser localStorage
- Analysis processing typically takes 5-20 seconds via n8n