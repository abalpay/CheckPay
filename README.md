# CheckPay

Overtime payment verification for Queensland Health workers. Upload your payslips and AVACs (Attendance Variation and Allowance Claims), and CheckPay reconciles every line item to flag underpayments, overpayments, and missing entitlements.

**Live at [checkpay.ai](https://checkpay.ai)**

## How It Works

```
Upload payslip PDFs (1–8) + AVAC PDFs (1–10)
        ↓
Each PDF is parsed alone (/api/parse, one file per request)
        ↓
One reconcile call gets every parsed payslip and AVAC
        ↓
Rules engine calculates expected pay from AVAC roster data
        ↓
Reconciler matches expected vs actual line items
        ↓
Interactive report with flagged discrepancies
```

## Features

- **PDF parsing** — Extracts structured data from payslip and AVAC PDFs using regex-based parsers
- **Rules engine** — Calculates expected overtime, penalties, and loadings from AVAC roster data
- **Line-by-line reconciliation** — Matches expected entitlements against actual payslip items
- **Discrepancy detection** — Flags underpayments, overpayments, missing items, and threshold anomalies
- **Evidence-based verdicts** — Reads page 1 (rostered pay) and page 2 (adjustments) of every uploaded payslip. A claim is only called unpaid when the payslip that could have paid it is uploaded; otherwise it is shown as pending, with the fortnight payslip to upload
- **Printed AVAC fallback** — Flattened/printed AVACs are read from their text rows; an AVAC saved without its form data gets a clear fix-it message
- **Interactive reports** — Expandable per-day breakdown with color-coded status indicators
- **No account required** — Upload, analyse, done. No signup, no data stored
- **Privacy-first** — All processing happens per-request. No database, no persistent storage

## Tech Stack

### Frontend
- **Framework** — Next.js 16, React 19, TypeScript
- **UI** — Tailwind CSS, shadcn/ui, Recharts
- **File handling** — react-dropzone with PDF validation

### Backend
- **API** — FastAPI (Python)
- **PDF parsing** — Custom regex-based parsers for payslip and AVAC formats
- **Reconciliation** — Rules engine with QH award interpretation
- **Rate limiting** — per-IP, in-memory, in `proxy.ts` (frontend only; the backend has no rate limiting)

### Infrastructure
- **Hosting** — Vercel, as a single project: Next.js frontend + FastAPI backend deployed together as [Vercel Services](https://vercel.com/docs/services). The backend is a private service with no public URL; the frontend reaches it via a service binding (`BACKEND_URL`).
- **Security** — CSP headers, CSRF protection

## Getting Started

Preferred (runs both services with the `BACKEND_URL` binding wired up):

```bash
npm install
npx vercel@latest dev -L
```

Or run each service separately:

```bash
# Frontend
npm install
cp .env.example .env.local
npm run dev

# Backend
cd backend
uv run --python 3.12 --with-requirements requirements.txt --with uvicorn uvicorn main:app --port 8000
```

## Project Structure

```
app/                    # Next.js routes (marketing, check flow, guides)
components/             # React components + shadcn/ui
lib/                    # Client utilities, session reports
proxy.ts                # Next.js middleware: per-IP rate limiting, CSRF origin check
backend/
├── main.py             # FastAPI app (private Vercel Service, no CORS)
├── payslip_parser.py   # Payslip PDF extraction
├── avac_parser.py      # AVAC PDF extraction
├── rules_engine.py     # Expected pay calculation
├── reconciler.py       # Line-item matching + discrepancy detection
└── tests/              # Backend test suite
```

## License

[MIT](LICENSE)
