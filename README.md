# CheckPay

Overtime payment verification for Queensland Health workers. Upload your payslip and AVAC (Award Variation Advice Certificate), and CheckPay reconciles every line item to flag underpayments, overpayments, and missing entitlements.

**Live at [checkpay.ai](https://checkpay.ai)**

## How It Works

```
Upload payslip PDF + AVAC PDFs
        ↓
FastAPI backend parses both documents
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
- **Interactive reports** — Expandable per-day breakdown with color-coded status indicators
- **No account required** — Upload, analyse, done. No signup, no data stored
- **Privacy-first** — All processing happens per-request. No database, no persistent storage

## Tech Stack

### Frontend
- **Framework** — Next.js 15, React 19, TypeScript
- **UI** — Tailwind CSS, shadcn/ui, Recharts
- **File handling** — react-dropzone with PDF validation

### Backend
- **API** — FastAPI (Python)
- **PDF parsing** — Custom regex-based parsers for payslip and AVAC formats
- **Reconciliation** — Rules engine with QH award interpretation
- **Rate limiting** — slowapi (backend) + custom middleware (frontend)

### Infrastructure
- **Hosting** — Vercel (frontend), Railway (backend)
- **Security** — CSP headers, CSRF protection, SSRF guards, origin validation

## Getting Started

```bash
# Frontend
npm install
cp .env.example .env.local
npm run dev

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Project Structure

```
app/                    # Next.js routes (marketing, check flow, guides)
components/             # React components + shadcn/ui
lib/                    # Client utilities, session reports, rate limiting
backend/
├── main.py             # FastAPI app with CORS + rate limiting
├── payslip_parser.py   # Payslip PDF extraction
├── avac_parser.py      # AVAC PDF extraction
├── rules_engine.py     # Expected pay calculation
├── reconciler.py       # Line-item matching + discrepancy detection
└── tests/              # Backend test suite
```

## License

[MIT](LICENSE)
