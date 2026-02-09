# CheckPay

This repository contains the CheckPay Next.js application. See `CLAUDE.md` for an extended project overview and development guidance.

## Product flow
- `/` is the marketing page.
- Users click **Start Analysis** and go to `/check/new`.
- Users upload one payslip PDF and one or more AVAC PDFs.
- The app calls `/api/reconcile`, then renders the report at `/check/report/{id}`.

## Authentication and data storage
- No authentication is required.
- No database is used.
- Report data is temporary in-memory state only and is lost on refresh.

## Upload and analysis configuration
- `FASTAPI_RECONCILE_URL` (optional) can override the default backend URL.
- Default backend URL: `http://localhost:8000/api/reconcile`.
