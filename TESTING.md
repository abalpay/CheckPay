# CheckPay Testing Checklist

## Manual flow

1. Start the app and open `/`.
2. Click **Start Analysis** and confirm navigation to `/check/new`.
3. Upload one payslip PDF plus at least one AVAC PDF.
4. Click **Start analysis** and wait for the backend response.
5. Confirm redirect to `/check/report/{id}` and verify report sections render.

## Error checks

1. Upload a non-PDF file and verify validation error.
2. Upload a PDF larger than 5MB and verify validation error.
3. Upload more than 10 AVAC files and verify limit error.
4. Stop the backend and verify a connectivity error is shown.

## Persistence behavior

1. Load `/check/report/{id}` after completing an analysis and verify it renders.
2. Refresh `/check/report/{id}` and verify the report is no longer available.
