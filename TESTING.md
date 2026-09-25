# CheckPay Testing Checklist

## Setup

Start both services with `npx vercel@latest dev -L`, or separately with `npm run dev` plus
`cd backend && uv run --python 3.12 --with-requirements requirements.txt --with uvicorn uvicorn main:app --port 8000`.

## Manual flow

1. Start the app and open `/`.
2. Click **Start Analysis** and confirm navigation to `/check/new`.
3. Upload one payslip PDF plus at least one AVAC PDF.
4. Click **Start analysis** and wait for the backend response.
5. Confirm redirect to `/check/report/{id}` and verify report sections render.

## Error checks

1. Upload a non-PDF file and verify validation error.
2. Drop a PNG and a non-payslip PDF with real files: both appear under "Skipped N files" with a reason and are never uploaded.
3. Drop 27 payslips: Analyse stays disabled with "Too many payslips (27 of 26). Remove some to continue."
4. Stop the backend and verify a connectivity error is shown.

## Persistence behavior

1. Load `/check/report/{id}` after completing an analysis and verify it renders.
2. Refresh `/check/report/{id}` and verify the report is no longer available.

## Year-of-files gate (before merging changes to upload, parse or the report)

    npx vercel@latest dev -L
    CHECKPAY_REAL_DATA="/path/to/private folder" uv run --with playwright==1.58.0 python e2e/year_of_files.py --expect-payslips 17 --expect-avacs 23 --min-skipped 16
    uv run --with playwright==1.58.0 python e2e/year_of_files.py --mock   # refreshes docs/design/screenshots/year-*.png

The real run uses the folder chooser on the whole private folder (subfolder, screenshots and duplicates
included) and must print PASS. Only the mock run's screenshots are committed.
