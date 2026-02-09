# Checkpay — Backend Integration Specification

## Overview

Checkpay is a web app that helps Queensland Health doctors verify their overtime/recall payments by comparing AVAC claim forms against payslip adjustments.

**This document tells you how to integrate the existing, tested Python engine into the web app backend. DO NOT rewrite the parsing or reconciliation logic. Use the provided modules exactly as they are.**

---

## The 5 Core Modules (DO NOT MODIFY)

These files are the tested engine. They handle all PDF parsing, award rules, and reconciliation. Your job is to call them from API endpoints, not rewrite them.

| Module | Purpose | Key Function |
|--------|---------|-------------|
| `payslip_parser.py` | Parses Queensland Health payslip PDFs (XFA format) | `parse_payslip(pdf_path) → PayslipData` |
| `avac_parser.py` | Parses AVAC claim form PDFs (XFA format) | `parse_avac(pdf_path) → dict` |
| `rules_engine.py` | Applies Medical Officers Award rules to AVAC data | `calculate_expected(avac_data, base_hourly_rate) → RulesResult` |
| `reconciler.py` | Compares expected vs actual pay entries | `reconcile(expected, payslip_data) → ReconciliationReport` |
| `test_runner.py` | Batch testing harness (not needed for web app) | N/A |

### Dependencies

```
pikepdf          # XFA PDF extraction (AVAC parser)
pdfplumber       # Table extraction (payslip parser)
python 3.10+
```

---

## The Pipeline (how the modules connect)

```
User uploads: 1 payslip PDF + 1-N AVAC PDFs
                    │
                    ▼
┌─────────────────────────────────┐
│  1. payslip_parser.parse_payslip(payslip_path)         │
│     → PayslipData object                                │
│       .employee (name, pay_date, person_id)             │
│       .base_hourly_rate (float, e.g. 69.1842)          │
│       .adjustments (list of AdjustmentLine)             │
│       .adjustment_total (float)                         │
│       .is_overpayment_payslip (bool)                    │
│       .overpayment_amount (float)                       │
│       .current_fortnight (CurrentFortnight)             │
│       .adjustment_subtotal_older (float)                │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  2. For EACH AVAC file:                                 │
│     avac_data = avac_parser.parse_avac(avac_path)       │
│     → dict with keys: employee, workplace, shifts, summary │
│                                                          │
│     avac_data['shifts'] is a list of shift dicts:       │
│       .date, .date_iso, .rostered_start, .rostered_finish │
│       .actual_start, .actual_finish                      │
│       .variation_type (Overtime, Recall, Recall Offsite) │
│       .insufficient_break (bool)                         │
│       .overtime_minutes (int)                            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  3. rules_engine.calculate_expected(                    │
│         avac_data,                                       │
│         base_hourly_rate=payslip.base_hourly_rate       │
│     )                                                    │
│     → RulesResult                                        │
│       .days[] → DailyExpectation                         │
│         .date, .day_of_week, .day_type                  │
│         .lines[] → ExpectedPayLine                       │
│           .type (e.g. "Overtime_-_1.5")                 │
│           .units, .rate, .amount                         │
│       .warnings[]                                        │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  4. reconciler.reconcile(expected, payslip)             │
│     → ReconciliationReport                               │
│       .overall_status:                                   │
│         "ALL_MATCH" | "DISCREPANCIES_FOUND"             │
│         "OK_WITH_ANOMALIES" | "CORRECTION_PAYSLIP"      │
│       .days[] → DaySummary                               │
│         .matches[] → MatchResult                         │
│           .status: MATCH | UNDERPAID | OVERPAID          │
│                    MISSING | UNMATCHED | REVERSAL         │
│                    THRESHOLD_SPLIT | THRESHOLD_EXCESS     │
│                    INFO                                   │
│           .pay_type, .expected_amount, .actual_amount     │
│           .difference, .notes                             │
│       .match_count, .discrepancy_count                   │
│       .missing_count, .unmatched_count                   │
│       .total_expected, .total_actual, .total_difference  │
│       .is_overpayment_payslip                            │
│       .older_adjustments[] (> 4 pay periods back)        │
│       .older_adjustments_total                           │
│       .unmatched_payslip[] (dates not in any AVAC)       │
└─────────────────────────────────┘
```

---

## Architecture

The existing app is **Next.js**. Since the engine is Python, add a **FastAPI backend** that Next.js calls.

```
┌─────────────────────────────────────────────┐
│  Next.js (frontend + proxy)                 │
│                                             │
│  /app/page.tsx         ← Upload UI          │
│  /app/api/reconcile/   ← Proxy to FastAPI   │
│    route.ts              (or call directly)  │
└──────────────┬──────────────────────────────┘
               │ POST multipart/form-data
               ▼
┌─────────────────────────────────────────────┐
│  FastAPI (Python backend)                   │
│                                             │
│  /api/reconcile        ← Single endpoint    │
│                                             │
│  Uses these modules (DO NOT MODIFY):        │
│    payslip_parser.py                        │
│    avac_parser.py                           │
│    rules_engine.py                          │
│    reconciler.py                            │
└─────────────────────────────────────────────┘
```

### Project Structure

```
checkpay/
├── frontend/                    # Next.js app (existing)
│   ├── app/
│   │   ├── page.tsx             # Upload form + results display
│   │   └── api/reconcile/
│   │       └── route.ts         # Optional: proxy to FastAPI
│   ├── package.json
│   └── ...
│
├── backend/                     # NEW: FastAPI Python backend
│   ├── main.py                  # FastAPI app with /api/reconcile
│   ├── payslip_parser.py        # COPY EXACTLY — do not modify
│   ├── avac_parser.py           # COPY EXACTLY — do not modify
│   ├── rules_engine.py          # COPY EXACTLY — do not modify
│   ├── reconciler.py            # COPY EXACTLY — do not modify
│   └── requirements.txt         # pikepdf, pdfplumber, fastapi, uvicorn, python-multipart
│
├── docker-compose.yml           # Optional: run both together
└── README.md
```

### Option A: Proxy via Next.js API Route (recommended)

Next.js API route forwards the upload to FastAPI:

```typescript
// app/api/reconcile/route.ts
export async function POST(request: Request) {
  const formData = await request.formData();
  
  const response = await fetch('http://localhost:8000/api/reconcile', {
    method: 'POST',
    body: formData,
  });
  
  const data = await response.json();
  return Response.json(data);
}
```

This keeps the frontend calling its own origin (no CORS issues).

### Option B: Call FastAPI Directly from Frontend

Add CORS to FastAPI and call it directly from the browser. Simpler but needs CORS config.

---

## FastAPI Backend (main.py)

This is the ONLY new Python file needed. Everything else is copied as-is.

```python
"""
Checkpay — FastAPI Backend
Wraps the tested engine modules in a single API endpoint.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dataclasses import asdict
from typing import List
import tempfile, os

from payslip_parser import parse_payslip
from avac_parser import parse_avac
from rules_engine import calculate_expected
from reconciler import reconcile

app = FastAPI(title="Checkpay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production
    allow_methods=["POST"],
    allow_headers=["*"],
)

NON_ACTIONABLE = {"MATCH", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS", "INFO"}

OT_KEYWORDS = {"overtime", "recall", "fatigue", "public_holiday"}


def report_to_frontend(report) -> dict:
    """Convert ReconciliationReport to frontend-friendly dict."""
    days = []
    actionable_items = []
    
    for day in report.days:
        day_items = []
        for m in day.matches:
            item = {
                "date": m.date,
                "day_of_week": m.day_of_week,
                "pay_type": m.pay_type,
                "status": m.status,
                "expected_units": m.expected_units,
                "actual_units": m.actual_units,
                "expected_amount": m.expected_amount,
                "actual_amount": m.actual_amount,
                "difference": m.difference,
                "notes": m.notes,
            }
            day_items.append(item)
            if m.status not in NON_ACTIONABLE:
                actionable_items.append(item)
        
        days.append({
            "date": day.date,
            "day_of_week": day.day_of_week,
            "day_type": day.day_type,
            "status": day.status,
            "expected_total": day.expected_total,
            "actual_total": day.actual_total,
            "difference": day.difference,
            "items": day_items,
        })
    
    older = []
    for a in report.older_adjustments:
        older.append({
            "pay_type": a.pay_type,
            "amount": a.actual_amount,
            "notes": a.notes,
        })
    
    unmatched = []
    for u in report.unmatched_payslip:
        unmatched.append({
            "date": u.date,
            "pay_type": u.pay_type,
            "amount": u.actual_amount,
        })
    
    return {
        "overall_status": report.overall_status,
        "match_count": report.match_count,
        "discrepancy_count": report.discrepancy_count,
        "missing_count": report.missing_count,
        "unmatched_count": report.unmatched_count,
        "total_expected": report.total_expected,
        "total_actual": report.total_actual,
        "total_difference": report.total_difference,
        "days": days,
        "actionable_items": actionable_items,
        "older_adjustments": older,
        "older_adjustments_total": report.older_adjustments_total,
        "unmatched_payslip_entries": unmatched,
    }


@app.post("/api/reconcile")
async def reconcile_endpoint(
    payslip: UploadFile = File(...),
    avacs: List[UploadFile] = File(...),
):
    with tempfile.TemporaryDirectory() as tmpdir:
        # Save payslip
        ps_path = os.path.join(tmpdir, payslip.filename or "payslip.pdf")
        with open(ps_path, "wb") as f:
            f.write(await payslip.read())
        
        # Parse payslip
        try:
            ps = parse_payslip(ps_path)
        except Exception as e:
            raise HTTPException(400, f"Could not parse payslip: {e}")
        
        # Check for correction/overpayment payslip
        if ps.is_overpayment_payslip:
            has_positive_ot = any(
                adj.amount > 0 and adj.date
                and any(kw in adj.type.lower() for kw in OT_KEYWORDS)
                for adj in ps.adjustments
                if adj.section != "adjustment_only"
            )
            if not has_positive_ot:
                return {
                    "status": "correction_payslip",
                    "employee": ps.employee.name,
                    "pay_date": ps.employee.pay_date,
                    "message": "This payslip contains only corrections/reversals from previous pay periods. There are no new overtime or recall payments to verify against AVACs.",
                    "adjustment_total": ps.adjustment_total,
                    "overpayment_amount": ps.overpayment_amount,
                    "avac_results": [],
                }
        
        # Process each AVAC
        avac_results = []
        for avac_file in avacs:
            avac_path = os.path.join(tmpdir, avac_file.filename or "avac.pdf")
            with open(avac_path, "wb") as f:
                f.write(await avac_file.read())
            
            try:
                avac_data = parse_avac(avac_path)
                expected = calculate_expected(avac_data, ps.base_hourly_rate)
                report = reconcile(expected, ps)
                avac_results.append({
                    "avac_name": avac_file.filename,
                    "report": report_to_frontend(report),
                })
            except Exception as e:
                avac_results.append({
                    "avac_name": avac_file.filename,
                    "error": str(e),
                })
        
        return {
            "status": "ok",
            "employee": ps.employee.name,
            "pay_date": ps.employee.pay_date,
            "base_rate": ps.base_hourly_rate,
            "is_overpayment_payslip": ps.is_overpayment_payslip,
            "adjustment_total": ps.adjustment_total,
            "avac_results": avac_results,
            "older_adjustments_total": ps.adjustment_subtotal_older,
        }
```

### requirements.txt

```
fastapi>=0.104
uvicorn>=0.24
python-multipart>=0.0.6
pikepdf>=8.0
pdfplumber>=0.10
```

### Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```
```

---

## Status Codes Reference

The frontend should display these statuses with appropriate styling:

| Status | Icon | Meaning | Actionable? |
|--------|------|---------|-------------|
| `MATCH` | ✅ | Amounts match within $0.10 | No |
| `UNDERPAID` | 🔴 | Payslip pays less than AVAC claim | **YES** |
| `OVERPAID` | 🟡 | Payslip pays more than AVAC claim | Soft yes |
| `MISSING` | ❌ | AVAC predicts entry but nothing on payslip | **YES** |
| `UNMATCHED` | ❓ | On payslip but engine didn't predict it | Review |
| `REVERSAL` | 🔄 | Negative entry — payroll correction | No |
| `THRESHOLD_SPLIT` | 🔀 | OT rate split differs due to threshold sharing | No |
| `THRESHOLD_EXCESS` | ℹ️ | Net recall total (informational) | No |
| `INFO` | ℹ️ | Standard allowance (OCA, shift loading) | No |

**Overall status:**
| Status | Meaning |
|--------|---------|
| `ALL_MATCH` | Everything checks out |
| `DISCREPANCIES_FOUND` | Real mismatches found — user should investigate |
| `OK_WITH_ANOMALIES` | No $ discrepancies but unmatched/reversal entries exist |
| `CORRECTION_PAYSLIP` | Payslip is a clawback — nothing to verify |

---

## AVAC-to-Payslip Date Matching

**Critical:** The test_runner has logic to filter which AVACs are relevant to a given payslip. In the web app, users upload only the AVACs they want to check, so you don't need this filtering. But be aware:

- If an AVAC's dates don't appear on the payslip adjustments, every entry will show as MISSING
- This is expected — it means that AVAC hasn't been paid yet (will appear on a future payslip)
- The frontend should explain this clearly: "These AVAC entries haven't appeared on this payslip yet. They may be on a future payslip."

---

## File Dependencies

The parsers need these system packages:

```bash
pip install pikepdf pdfplumber
```

Both parsers need actual file paths (not file objects or byte streams), so uploads must be saved to temp files before parsing.

---

## What NOT to Do

1. **DO NOT rewrite the PDF parsing logic.** These are XFA-format PDFs unique to Queensland Health. The parsers handle edge cases (multi-page payslips, newline-delimited table cells, XFA XML extraction via pikepdf) that took many iterations to get right.

2. **DO NOT rewrite the rules engine.** It implements the Medical Officers (Queensland Health) Award — State 2015 with specific threshold logic, recall minimums, fatigue penalties, and meal allowances.

3. **DO NOT rewrite the reconciler.** It has threshold consolidation logic that handles the systematic mismatch between AVAC-only data and payslip adjustments.

4. **DO NOT add an ORM or database for the PDF data.** This is a stateless tool — upload, process, display results. No user accounts needed for v1.

5. **DO NOT try to parse the PDFs with generic PDF libraries like PyPDF2.** These are XFA forms that require pikepdf for XML extraction (AVAC) and pdfplumber for table extraction (payslip).

6. **DO NOT use Node.js PDF parsing.** The engine is Python — you need a Python backend process.

---

## What to REMOVE from the Existing Next.js App

The existing Next.js app has backend code that attempts PDF parsing and reconciliation. **Delete all of it.** Specifically:

- Any server-side PDF parsing logic (pdf-parse, pdf-lib, pdf2json, etc.)
- Any reconciliation/comparison logic in API routes or server actions
- Any award/rules calculation code
- Any Node.js dependencies related to PDF processing

**Keep:**
- The Next.js frontend UI (upload form, results display)
- Styling, layout, components
- Any authentication if present

The frontend should now just POST files to the FastAPI backend and display the JSON response.

---

## Frontend Response Shape

The frontend will receive this JSON from `/api/reconcile`:

```typescript
interface ReconcileResponse {
  status: "ok" | "correction_payslip";
  employee: string;
  pay_date: string;
  base_rate: number;
  is_overpayment_payslip: boolean;
  adjustment_total: number;
  older_adjustments_total: number;
  
  // Only when status === "correction_payslip"
  message?: string;
  overpayment_amount?: number;
  
  // Only when status === "ok"
  avac_results: AvacResult[];
}

interface AvacResult {
  avac_name: string;
  error?: string;        // Present if AVAC failed to parse
  report?: AvacReport;   // Present if successful
}

interface AvacReport {
  overall_status: "ALL_MATCH" | "DISCREPANCIES_FOUND" | "OK_WITH_ANOMALIES";
  match_count: number;
  discrepancy_count: number;
  missing_count: number;
  unmatched_count: number;
  total_expected: number;
  total_actual: number;
  total_difference: number;
  
  days: DayResult[];
  actionable_items: LineItem[];    // Items needing user attention
  older_adjustments: OlderAdj[];
  older_adjustments_total: number;
  unmatched_payslip_entries: UnmatchedEntry[];
}

interface DayResult {
  date: string;           // "31.05.2025"
  day_of_week: string;    // "Sat"
  day_type: string;       // "weekday" | "saturday" | "sunday" | "public_holiday"
  status: string;         // "OK" | "OVERPAID" | "UNDERPAID" | "ANOMALY"
  expected_total: number;
  actual_total: number;
  difference: number;
  items: LineItem[];
}

interface LineItem {
  date: string;
  day_of_week: string;
  pay_type: string;       // "Overtime_-_1.5", "Recall_-_T2.0", etc.
  status: string;         // See status codes table
  expected_units: number;
  actual_units: number;
  expected_amount: number;
  actual_amount: number;
  difference: number;
  notes: string;
}

interface OlderAdj {
  pay_type: string;
  amount: number;
  notes: string;
}

interface UnmatchedEntry {
  date: string;
  pay_type: string;
  amount: number;
}
```