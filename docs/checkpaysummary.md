# Checkpay — Project Summary & Frontend Debugging Guide

## What is Checkpay?

Checkpay is a payslip reconciliation tool for Queensland Health medical officers (junior doctors). Doctors submit AVAC forms (Attendance Variation and Allowance Claim) when they work overtime, get recalled to hospital, or claim fatigue leave. Payroll processes these AVACs and pays the doctor on their fortnightly payslip. Checkpay automates the verification of whether the payslip matches what the doctor is owed.

## How it works

1. **Doctor uploads** one payslip PDF + one or more AVAC PDFs
2. **AVAC Parser** (`avac_parser.py`) extracts shift data from each AVAC (dates, times, variation types)
3. **Rules Engine** (`rules_engine.py`) applies the Medical Officers QLD Award to calculate what the doctor *should* be paid (overtime rates, recall penalties, fatigue leave, etc.)
4. **Payslip Parser** (`payslip_parser.py`) extracts the Page 2 adjustment entries from the payslip (what was *actually* paid)
5. **Reconciler** (`reconciler.py`) compares expected vs actual, line by line, date by date
6. **Frontend** displays the reconciliation report showing matches, discrepancies, and items needing attention

## Award rules (simplified)

- **Ordinary hours**: 76h per fortnight, weekdays only (Mon-Fri)
- **Overtime rates**: T1.5 for first 3h, T2.0 thereafter (Mon-Sat). Sundays = T2.0 for all hours. Public holidays = T2.5 for all hours.
- **Weekend/PH rostered shifts**: Even if "rostered", Saturday/Sunday/PH shifts are overtime because ordinary hours are weekday-only
- **Recalls**: Minimum 2h guarantee. Rates follow the overtime ladder (T1.5 → T2.0 → T2.5) based on cumulative OT hours that day
- **Fatigue leave**: Penalty at 1.0× (weekday) or 1.5× (weekend) of base rate
- **Public holidays**: QLD public holidays are dynamically determined using the `holidays` Python library

## Data flow: Backend → Frontend

The API returns a JSON structure like this:

```json
{
  "status": "ok",
  "employee": "Emre Alpay",
  "pay_date": "21.05.2025",
  "base_rate": 69.1842,
  "is_overpayment_payslip": false,
  "adjustment_total": 8142.78,
  "older_adjustments_total": 0,
  "avac_results": [
    {
      "avac_name": "Week_10_AVAC_Emre.pdf",
      "report": { ... }  // ReconciliationReport for this AVAC
    }
  ]
}
```

Each `report` object contains:

```json
{
  // Counters
  "overall_status": "ALL_MATCH",        // see table below
  "match_count": 7,                     // verified correct lines
  "discrepancy_count": 0,               // real over/underpayments
  "missing_count": 0,                   // expected but not on payslip
  "unmatched_count": 0,                 // on payslip but not in AVAC
  "not_yet_paid_count": 3,             // AVAC dates with zero payslip entries (all 3 sub-statuses combined)
  "possibly_missed_count": 2,          // subset of above that fall WITHIN the adjustment window (needs follow-up)

  // Payslip adjustment window — the date range of adjustments on Page 2
  "earliest_adjustment_date": "10.03.2025",
  "latest_adjustment_date": "27.04.2025",

  // Dollar totals
  "total_expected": 1416.54,
  "total_actual": 1395.54,
  "total_difference": -21.00,

  // Day-level breakdown
  "days": [ ... ],                      // array of DaySummary objects

  // Actionable items (filtered subset — see KNOWN BUG below)
  "actionable_items": [ ... ],

  // Payslip entries that don't belong to this AVAC
  "unmatched_payslip_entries": [ ... ],

  // Old adjustments that can't be reconciled
  "older_adjustments": [],
  "older_adjustments_total": 0
}
```

### DaySummary object

```json
{
  "date": "12.04.2025",
  "day_of_week": "Sat",
  "day_type": "saturday",           // weekday | saturday | sunday | public_holiday
  "status": "OK",                   // day-level status (see table below)
  "expected_total": 1141.53,
  "actual_total": 1120.53,
  "difference": -21.00,
  "items": [ ... ]                  // array of MatchResult objects (the individual pay lines)
}
```

### MatchResult object (individual pay line)

```json
{
  "date": "12.04.2025",
  "day_of_week": "Sat",
  "pay_type": "Overtime_-_1.5",
  "status": "MATCH",                // item-level status (see table below)
  "expected_units": 3.0,
  "actual_units": 3.0,
  "expected_amount": 311.33,
  "actual_amount": 311.33,
  "difference": 0.0,
  "notes": ""
}
```

---

## Complete status reference

### Item-level statuses (on each pay line)

| Status | Meaning | Actionable? | Colour | Icon |
|--------|---------|-------------|--------|------|
| `MATCH` | Expected matches actual within $0.10 tolerance | No | Green | ✅ |
| `UNDERPAID` | Payslip pays less than expected | **Yes** | Red | 🔴 |
| `OVERPAID` | Payslip pays more than expected | **Yes** | Yellow/Red | 🟡 |
| `MISSING` | Expected from AVAC but not on payslip at all | **Yes** | Red | ❌ |
| `UNMATCHED` | On payslip but not predicted by AVAC engine | **Yes** | Gray | ❓ |
| `INFO` | Standard allowance/loading not predicted by engine (OCA, PH loading, stand-down leave, fortnightly salary) | No | Gray | ℹ️ |
| `REVERSAL` | Negative payslip entry — payroll correction | No | Blue | 🔄 |
| `THRESHOLD_SPLIT` | Recall rate split differently due to OT threshold cascade — NET total is correct | No | Blue | 🔀 |
| `THRESHOLD_EXCESS` | Summary line showing NET recall total with threshold explanation | No | Gray | ℹ️ |
| `NOT_YET_PAID` | AVAC date is AFTER the payslip's latest adjustment date — genuinely not processed yet | No | Gray | ⏳ |
| `POSSIBLY_MISSED` | AVAC date is WITHIN the payslip's adjustment window but has zero entries — payroll may have missed it | **Yes (pending)** | Amber | ⚠️ |
| `CHECK_PREVIOUS` | AVAC date is BEFORE the payslip's earliest adjustment date — may have been paid on an earlier payslip | **Yes (pending)** | Amber | 🔍 |

### Day-level statuses (on each date row)

| Status | Meaning | Colour |
|--------|---------|--------|
| `OK` | All actionable items match (INFO/threshold items excluded from calculation) | Green |
| `UNDERPAID` | Actionable items total shows underpayment | Red |
| `OVERPAID` | Actionable items total shows overpayment | Yellow |
| `ANOMALY` | Contains reversal entries | Blue |
| `NOT_YET_PAID` | Entire day not on payslip, date is after adjustment window | Gray |
| `POSSIBLY_MISSED` | Entire day not on payslip, date is within adjustment window | Amber |
| `CHECK_PREVIOUS` | Entire day not on payslip, date is before adjustment window | Amber |

**Important**: Day-level status is calculated using only actionable items. INFO, THRESHOLD_SPLIT, THRESHOLD_EXCESS, and REVERSAL items are excluded from the day-level status calculation. This means a day can show `OK` even if the raw difference is non-zero (e.g. -$21.00 from an OCA allowance).

### Overall statuses (per AVAC report)

| Status | Meaning | Card colour | Badge |
|--------|---------|-------------|-------|
| `ALL_MATCH` | All items verified correct, any pending items are genuinely future (NOT_YET_PAID only) | Green | "All match" (green) |
| `OK_WITH_PENDING` | All matched items are clean, but POSSIBLY_MISSED or CHECK_PREVIOUS items exist | Amber | Should show pending count (amber) |
| `OK_WITH_ANOMALIES` | Clean but has unmatched payslip entries | Gray | "All match" with note |
| `DISCREPANCIES_FOUND` | Real over/underpayments found | Red | "N actionable" (red) |
| `CORRECTION_PAYSLIP` | Overpayment clawback payslip — no reconciliation possible | Blue/Gray | "Correction" |

---

## Adjustment window logic

The payslip's Page 2 contains adjustments for a range of dates (e.g. 10.03.2025 to 27.04.2025). When an AVAC date has zero payslip entries, the reconciler classifies it based on where it falls relative to this window:

- **After the window** (e.g. AVAC date 05.05 vs window ending 27.04) → `NOT_YET_PAID` — genuinely not processed yet, benign
- **Within the window** (e.g. AVAC date 22.04 vs window 10.03–27.04) → `POSSIBLY_MISSED` — payroll processed dates before and after but skipped this one, needs follow-up
- **Before the window** (e.g. AVAC date 01.02 vs window starting 10.03) → `CHECK_PREVIOUS` — too old for this payslip, check earlier one

The window dates are available in the report as `earliest_adjustment_date` and `latest_adjustment_date`.

---

## Known frontend bugs to fix

### Bug 1: POSSIBLY_MISSED items not treated as actionable

**Problem**: When a report has `POSSIBLY_MISSED` or `CHECK_PREVIOUS` items:
- Overall status correctly shows `OK_WITH_PENDING` (amber) ✅
- But the card badge says "0 actionable" ❌
- The card body says "No actionable items for this AVAC" ❌
- The top-of-page actionable items summary doesn't list them ❌

**Cause**: The frontend actionable items filter only includes `UNDERPAID`, `OVERPAID`, `MISSING`, `UNMATCHED`. The new pending statuses aren't in the filter.

**Fix**:
1. Add `POSSIBLY_MISSED` and `CHECK_PREVIOUS` to the actionable items filter
2. `NOT_YET_PAID` should NOT be actionable (it's benign)
3. Style pending items with amber badges, distinct from red discrepancy badges
4. If only pending items exist (no real discrepancies), use amber badge "N pending" instead of red "N actionable"
5. In the top-of-page summary, show pending items in a separate "PENDING ITEMS — FOLLOW UP WITH PAYROLL" section below the main actionable items
6. Replace the green "No actionable items" banner with an amber "No discrepancies found, but N items are pending — follow up with payroll" when pending items exist

### Bug 2: Day-level status showing UNDERPAID/OVERPAID for non-actionable differences

**Problem**: A day with all MATCH + INFO items shows as UNDERPAID because the raw day total includes INFO items like OCA (-$21.00).

**Status**: FIXED in backend. Day-level status now excludes INFO, THRESHOLD_SPLIT, THRESHOLD_EXCESS, and REVERSAL from the calculation. If you're still seeing this, the old backend is deployed.

### Improvement: Day-level summary view

**Problem**: Doctors see "15 matches" for a week with 4 shifts. They think in shifts/days, not pay line items. 15 rows of Recall_-_T2.0, Recall_Guaranteed_Hrs_2.0, THRESHOLD_SPLIT is confusing.

**Fix**: Show day-level summaries by default (4 rows for 4 days), with line-level detail as an expandable drill-down. Change summary counters from "15 matches" to "4 days verified". See separate spec for details.

---

## Backend files

| File | Purpose | Lines |
|------|---------|-------|
| `avac_parser.py` | Parses AVAC XFA PDF forms → shift data JSON | ~634 |
| `rules_engine.py` | Applies award rules to AVAC data → expected pay lines | ~539 |
| `payslip_parser.py` | Parses payslip PDF → employee info + Page 2 adjustments | ~523 |
| `reconciler.py` | Compares expected vs actual → reconciliation report | ~542 |

All 4 files need to be deployed together. The `holidays` Python library is a dependency for dynamic public holiday detection.

---

## How to debug frontend issues

When reporting a bug:

1. **Take a screenshot** of what the frontend is displaying
2. **Paste the raw JSON response** from the API (the full `report` object for the relevant AVAC)
3. **Identify the mismatch** — what the JSON says vs what the frontend shows

Common things to check:
- Is the frontend reading `overall_status` correctly?
- Is the actionable items filter including all relevant statuses?
- Is the day-level `status` field being used (not recalculated from raw difference)?
- Are the counter fields (`match_count`, `discrepancy_count`, `not_yet_paid_count`, `possibly_missed_count`) being displayed?
- Is the card badge/border colour mapped to the correct `overall_status`?