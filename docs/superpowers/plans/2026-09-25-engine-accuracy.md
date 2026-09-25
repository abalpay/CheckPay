# Reconciliation Engine Accuracy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CheckPay's verdicts trustworthy on a real doctor's data: catch every real underpayment, raise no false alarms, and show one actionable dollar figure per report.

**Architecture:** The engine stays deterministic Python (`backend/`): `payslip_parser` → `rules_engine` (expected lines) → `reconciler` (match) → `main.report_to_frontend`. Six changes, each independently shippable: (1) page 1 of the payslip becomes dated actuals and tells the engine how much rostered OT payroll already paid; (2) fatigue detection sorts shifts chronologically, honours the doctor's "fatigue" comment, and pools shifts across AVACs; (3) the headline number counts only actionable lines and reversals get their own counter; (4) "unpaid" is decided from same-week evidence and payslip coverage, producing two neutral statuses instead of red false alarms; (5) two rules gaps closed (weekend meal break, regional show days); (6) a two-phase API (parse each PDF alone → one JSON reconcile call) so the server sees all AVACs and several payslips at once without breaching Vercel's body limit; plus a printed-AVAC fallback and clear errors.

**Tech Stack:** Python 3.12 (FastAPI, pdfplumber, pikepdf, holidays, pydantic v2), pytest; Next.js 15 App Router + Vitest for the small frontend contract changes.

**Spec:** Line-level review of the doctor's private dataset performed in-session on 2026-09-25 (scratchpad `fable-review.md`, not committed). Its findings are summarised, anonymised, in **Background** below; the plan argues from that summary. Real files, names, IDs and dollar figures never enter the repo.

---

## Background (anonymised findings the plan fixes)

Dataset: several months of fortnightly payslips and weekly AVACs, reviewed pair by pair where the payslip actually pays the AVAC. Today a clear minority of headlines are wrong (a missed real underpayment and several false alarms), and fewer than half could be taken at face value.

1. **Page-1 blindness.** Payroll pays rostered overtime (a 0.4h or 2.4h "long day" block per day, whole weekend rostered shifts, sometimes an entire AVAC week) on **page 1** of the fortnight's own payslip. The engine reads only page 2 (adjustments). Consequences: payments look missing, later page-2 corrections of page-1 amounts look like unexplained reversals, and the recall threshold split (`Recall_-` 0.6h then `Recall_-_T2.0`) has to be rescued by a heuristic instead of being computed exactly.
2. **Fatigue detection.** `_detect_insufficient_breaks` walks AVAC rows in **form order**, not date order, so a night recall listed on row 4 never counts as the "previous shift" of row 2. It also cannot see the previous week's last shift (each AVAC is processed alone). The documented rule (§5.1: a "*Fatigue pay*" comment marks the row) is not implemented — the code never reads `reason`. Net: false alarms and one missed underpayment.
3. **Headline number.** `total_difference` sums every line including INFO/THRESHOLD/REVERSAL — the very statuses the day status ignores. Users see an ALL_MATCH headline with a non-zero dollar difference and no explanation; one real issue is shown as three different amounts (line, day, report).
4. **Window heuristic.** "AVAC date inside min..max of page-2 dates but absent" ⇒ ISSUE_WITHIN_WINDOW. Page 2 is sparse, so uploading an adjacent payslip yields many confident false "issues". Evidence that payroll processed a week is a page-2 line **in that Mon–Sun week**, and absence can only be called "unpaid" when the payslip that could have paid it on page 1 is in evidence.
5. **Rules gaps.** Weekend OT branch does not deduct the 0.5h meal break for shifts > 5h (fatigue and meal code do; payroll does). `holidays.Australia(state='QLD')` has no regional show days (the doctor's locality has one) and includes the Brisbane Ekka, which is not a holiday there.
6. **Junk page-2 rows.** A leave/super table on a later page yields an "adjustment" with `date='For your leave balance,'`, which reaches the UI.
7. **Robustness.** A printed/flattened AVAC (no XFA) dies with "Could not process this AVAC file."; a dynamic XFA saved without data ("Please wait…") is indistinguishable from any other failure; `RulesResult.warnings` never reach the API.

Real pay problems in the dataset (all must be caught at the end): (A) a weekend rostered block paid nowhere; (B) a fatigue penalty claimed but not paid; (C) a public-holiday recall paid short; (D) several AVAC weeks with no payment visible on any later uploaded payslip.

## Design decisions

### D1 — Cross-AVAC and multi-payslip context: two-phase API (parse, then reconcile)

Constraint: the browser sends one request per AVAC (payslip + AVAC, ≈1 MB) because Vercel caps request bodies at 4.5 MB; AVACs are ~900 KB each, payslips 40–110 KB. PDFs are parsed server-side, so the client cannot build a "context" of neighbouring shifts itself.

Chosen design: **phase 1** `POST /api/parse` takes exactly one PDF (`kind=payslip|avac`) and returns its parsed JSON (a few KB); the client fans these out in parallel exactly as it fans out today (the progress panel keeps working per AVAC). **Phase 2** `POST /api/reconcile` with a JSON body `{payslips: [...], avacs: [{name, data}]}` runs the whole reconciliation in one call. Why this is the simplest design that works: it is the only shape in which the server sees every shift and every payslip in one deterministic call, each PDF crosses the wire exactly once, no request ever carries more than one PDF (the body limit stops mattering), and it needs no persistence. Alternatives rejected: attaching all payslips to each per-AVAC request (re-parses N×M PDFs, still cannot pool AVAC shifts); serialising per-AVAC requests and forwarding the previous week's last shift (slower, order-dependent, still single-payslip). The legacy multipart `/api/reconcile` stays as a thin wrapper over the same core until the frontend ships.

### D2 — Coverage model for page 1 (what "unpaid" may mean)

- **Covered date** = some uploaded payslip's fortnight (page-1 period) contains the date. Then page 1 is evidence: actuals = page-1 dated lines + page-2 lines, and the engine expects weekday OT from the standard finish (15:36) because page 1 carries the rostered extension. If the AVAC has no rostered row on a covered weekday but page 1 shows rostered OT, that OT is roster-driven: it seeds the 3h threshold and is shown as INFO, not UNMATCHED.
- **Uncovered date** = today's model (OT beyond the AVAC's rostered finish; the 0.4h gap assumed paid on the missing page 1). An uncovered day that is entirely unpaid on page 2, or carries a reversal, is **not verifiable** → neutral `NEEDS_FORTNIGHT_PAYSLIP` with the exact payslip to upload.
- **Processed week** = any page-2 line dated in the AVAC's Mon–Sun week, or a page-1 line that met an expected type. Unmet expectations in a week that is not processed → neutral `NOT_ON_THIS_PAYSLIP` (never red). An all-missing day in a processed week on a covered date → actionable `ISSUE_WITHIN_WINDOW`.

The principle: **CheckPay never declares a day unpaid unless the payslip that could have paid it is in evidence.** Single-payslip users get a neutral "upload payslip dated ≈DD.MM to verify" instead of a false alarm; multi-payslip users get exact verdicts.

### D3 — Statuses and contract

New line/day statuses: `NOT_ON_THIS_PAYSLIP`, `NEEDS_FORTNIGHT_PAYSLIP` (both "timing"/pending in the UI). Removed: `CHECK_PREVIOUS`, `CHECK_FUTURE` (legacy counters keep being populated so old sample data and types still work). New report fields (all additive): `reversal_count`, `informational_difference`, `pending_expected_total`, `not_on_this_payslip_count`, `needs_fortnight_payslip_count`, `warnings`; response gains `payslips[]` and `unpaid_weeks[]`. `total_difference` and `day.difference` become **actionable-only** amounts (this is a semantic change the UI wants: one number per issue).

## Product decisions needed (recommended default in bold)

| # | Decision | Default |
|---|---|---|
| P1 | Allow several payslips per run (Task 6–7)? | **Yes, 1–8 payslips.** Without the fortnight's own payslip, page-1 payments cannot be verified. |
| P2 | Uncovered day with no page-2 entry or a reversal: flag or stay neutral? | **Neutral (`NEEDS_FORTNIGHT_PAYSLIP`)** naming the payslip to upload. Never assert "unpaid" without the page that could have paid it. |
| P3 | When should "not on any uploaded payslip" escalate to an action? | **Never automatically.** Show the week, its expected amount and "payment usually appears 3–10 weeks after the AVAC week"; the doctor decides. |
| P4 | Regional show days: derive from the payslip locality? | **Yes**, with a hand-maintained table (only localities verified against real payslips are entered). |
| P5 | Correction-only payslips inside a multi-upload? | **Merge them** (their reversals net against later re-payments). Only an all-correction upload short-circuits to the correction screen. |
| P6 | Keep the legacy multipart `/api/reconcile`? | **Keep** until Task 7 ships; delete in a follow-up PR. |

## Global Constraints

- Deterministic code only — no AI/LLM anywhere in parsing or money math.
- Never commit real data: no real names, personnel/person IDs, filenames, dates-with-amounts or dollar figures from the private dataset. Synthetic tests use base rate `60.0`, March 2025 dates, and generic names.
- `CHECKPAY_REAL_DATA` (env var) points at the private folder; anything reading it must be skipped when unset. `backend/tests/*.local.json` is git-ignored.
- Vercel request body limit 4.5 MB → every request carries at most one PDF (≤ 4 MB) or a JSON body ≤ 3 MB.
- Max 10 AVAC files (unchanged). Max 8 payslips (new, `MAX_PAYSLIP_FILES`).
- `AnalysisJson` (`lib/jobs.ts`) changes are additive except the documented semantic change to `total_difference`/`day.difference`.
- Python: run tests with `backend/.venv/bin/python -m pytest backend/tests -q`; frontend with `npm run test -- --run`; lint with `npm run lint`.
- No new npm dependencies. New pip dev dependencies only: `pytest`, `httpx` (`backend/requirements-dev.txt`). `pydantic` already ships with FastAPI.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Gate after **every** task: python tests green, frontend tests green when touched, and the real-data scoreboard (`SCORE` line, Task 0) must not decrease in any of its three numbers.

## Review Focus

1. **Page-1 cell with a trailing minus** (`2.40-`, a negative correction on page 1): must become a negative dated line, not a positive one or a dropped cell. Test in Task 1 (`test_page1_negative_cell_is_negative`).
2. **Payslip layout with fewer than 14 date cells on page 1** (other employers/formats): page-1 lines and covered dates must be empty and the engine must fall back to the page-2-only model, not crash or half-cover a fortnight. Test in Task 1 (`test_page1_lines_empty_when_header_incomplete`).
3. **The same payslip uploaded twice** in a multi-upload: actuals must not double. Test in Task 6 (`test_merge_payslips_dedupes_same_pay_date`).
4. **Hostile or oversized JSON to the reconcile endpoint** (9 payslips, 201 shifts, non-object payslip): must answer 400/422, never 500. Tests in Task 6 (`test_reconcile_json_rejects_too_many_payslips`, `test_validate_avac_dict_limits`).
5. **An AVAC row of an unknown variation type**: today it is silently dropped; the user must see a warning naming the date. Test in Task 8 (`test_unknown_variation_type_warning_reaches_report`).

Known limit, out of scope (follow-up): a base-rate change between uploaded payslips (e.g. 1 July increase) — the merged model uses the latest payslip's rate; expected lines for older dates would be slightly high.

---

### Task 0: Regression harness (local real-data scoreboard + dev deps)

**Files:**
- Create: `backend/requirements-dev.txt`
- Create: `backend/scripts/real_data_regression.py`
- Modify: `.gitignore` (add `backend/tests/*.local.json`)
- Local only (never committed): `backend/tests/real_data_expectations.local.json` — already authored in the worktree from the review; schema below.

**Interfaces:**
- Consumes: today's `parse_payslip`, `parse_avac`, `calculate_expected`, `reconcile`, `main.report_to_frontend`; from Task 1 onward `main.run_reconciliation(payslips, avacs)` when present.
- Produces: a `SCORE single=a/b multi=c/d fp=e/f real_issues=g/4` line every later task gates on.

- [ ] **Step 1: Dev dependencies and ignore rule**

`backend/requirements-dev.txt`:
```
pytest>=8
httpx>=0.27
```
Append to `.gitignore`:
```
# local-only real-data regression expectations (never commit)
backend/tests/*.local.json
```
Run: `uv pip install --python backend/.venv/bin/python -r backend/requirements-dev.txt && backend/.venv/bin/python -m pytest backend/tests -q`
Expected: existing tests pass (7 tests).

- [ ] **Step 2: Expectations schema (local file, keep as is)**

The local file lists pairs. Every key is optional except `label`, `payslips`, `avac`:
```json
{"pairs": [
  {"label": "PSAxWB", "mode": "single", "payslips": ["Payslips A *.pdf"], "avac": "Week B *.pdf",
   "overall": "DISCREPANCIES_FOUND", "overall_any": ["ALL_MATCH", "OK_WITH_ANOMALIES"],
   "actionable_dates": ["dd.mm.yyyy"], "clean_dates": ["dd.mm.yyyy"], "actionable_dates_max": 1,
   "no_actionable": true, "total_difference_range": [-560, -545],
   "day_statuses": {"dd.mm.yyyy": "NEEDS_FORTNIGHT_PAYSLIP"}, "all_days_status": "NOT_ON_THIS_PAYSLIP",
   "unmatched_payslip_entries_max": 0, "unpaid_week": true, "real_issue_id": 1}
]}
```
`mode: "multi"` pairs list several payslip globs and are skipped (not failed) until `payslip_parser.merge_payslips` exists (Task 6). Labels starting with `FP:` are false-positive guards. `real_issue_id` 1–4 tags the four real problems (A–D in Background).

- [ ] **Step 3: Write the script** — `backend/scripts/real_data_regression.py`:

```python
"""Local-only regression over the private real dataset.

  CHECKPAY_REAL_DATA="/path/to/folder" backend/.venv/bin/python backend/scripts/real_data_regression.py [--verbose]

Prints a scoreboard and a final SCORE line. Never prints names, IDs or file names — only the
labels from the expectations file. Exits 0 and prints SKIP when the env var or the
expectations file is absent, so CI never runs it.
"""
import glob
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main as backend_main  # noqa: E402
import payslip_parser  # noqa: E402
from avac_parser import parse_avac  # noqa: E402
from payslip_parser import parse_payslip  # noqa: E402
from reconciler import reconcile  # noqa: E402
from rules_engine import calculate_expected  # noqa: E402

EXPECTATIONS = BACKEND / "tests" / "real_data_expectations.local.json"
ACTIONABLE = {"UNDERPAID", "OVERPAID", "MISSING", "UNMATCHED", "ISSUE_WITHIN_WINDOW"}


def _resolve(root, pattern):
    hits = sorted(glob.glob(os.path.join(root, pattern)))
    if not hits:
        raise FileNotFoundError(f"no file for pattern {pattern!r}")
    return hits


def _run_pair(root, pair, cache):
    ps_paths = [p for pat in pair["payslips"] for p in _resolve(root, pat)]
    avac_path = _resolve(root, pair["avac"])[0]
    payslips = [cache.setdefault(p, parse_payslip(p)) for p in ps_paths]
    avac = parse_avac(avac_path)
    run = getattr(backend_main, "run_reconciliation", None)
    if run is not None:
        response = run(payslips, [("avac", avac)])
    else:  # engine before Task 1: single payslip, page-2 only
        ps = payslips[0]
        report = reconcile(calculate_expected(avac, ps.base_hourly_rate), ps)
        if report.overall_status == "CORRECTION_PAYSLIP":
            response = {"status": "correction_payslip", "avac_results": []}
        else:
            response = {"status": "ok", "avac_results": [{"avac_name": "avac", "report": backend_main.report_to_frontend(report)}]}
    results = response.get("avac_results") or []
    report = results[0].get("report") if results else None
    return response, report


def _check(pair, response, report):
    fails = []
    overall = "CORRECTION_PAYSLIP" if response.get("status") == "correction_payslip" else (report or {}).get("overall_status")
    if "overall" in pair and overall != pair["overall"]:
        fails.append(f"overall {overall} != {pair['overall']}")
    if "overall_any" in pair and overall not in pair["overall_any"]:
        fails.append(f"overall {overall} not in {pair['overall_any']}")
    if not report:
        return fails
    actionable = {i["date"] for i in report["actionable_items"] if i["status"] in ACTIONABLE}
    for d in pair.get("actionable_dates", []):
        if d not in actionable:
            fails.append(f"{d} not flagged")
    for d in pair.get("clean_dates", []):
        if d in actionable:
            fails.append(f"{d} falsely flagged")
    if pair.get("no_actionable") and actionable:
        fails.append(f"unexpected actionable {sorted(actionable)}")
    if "actionable_dates_max" in pair and len(actionable) > pair["actionable_dates_max"]:
        fails.append(f"{len(actionable)} actionable dates > {pair['actionable_dates_max']}")
    rng = pair.get("total_difference_range")
    if rng and not (rng[0] <= report["total_difference"] <= rng[1]):
        fails.append(f"total_difference {report['total_difference']:+.2f} outside {rng}")
    days = {d["date"]: d["status"] for d in report["days"]}
    for d, s in pair.get("day_statuses", {}).items():
        if days.get(d) != s:
            fails.append(f"{d} status {days.get(d)} != {s}")
    if "all_days_status" in pair:
        bad = {d: s for d, s in days.items() if s != pair["all_days_status"]}
        if bad:
            fails.append(f"days not {pair['all_days_status']}: {bad}")
    if "unmatched_payslip_entries_max" in pair and len(report["unmatched_payslip_entries"]) > pair["unmatched_payslip_entries_max"]:
        fails.append(f"{len(report['unmatched_payslip_entries'])} unmatched payslip entries")
    if pair.get("unpaid_week") and not response.get("unpaid_weeks"):
        fails.append("not listed in unpaid_weeks")
    return fails


def main():
    root = os.environ.get("CHECKPAY_REAL_DATA")
    if not root or not EXPECTATIONS.exists():
        print("SKIP real-data regression (CHECKPAY_REAL_DATA unset or expectations file missing)")
        return 0
    verbose = "--verbose" in sys.argv
    pairs = json.loads(EXPECTATIONS.read_text())["pairs"]
    multi_ok = hasattr(payslip_parser, "merge_payslips")
    cache = {}
    score = {"single": [0, 0], "multi": [0, 0], "fp": [0, 0]}
    issues_caught = set()
    for pair in pairs:
        mode = pair.get("mode", "single")
        bucket = "fp" if pair["label"].startswith("FP:") else mode
        if mode == "multi" and not multi_ok:
            print(f"SKIP  {pair['label']:<20} multi-payslip not implemented yet")
            continue
        try:
            response, report = _run_pair(root, pair, cache)
            fails = _check(pair, response, report)
        except Exception as e:  # a crash is a failure, not a skip
            fails = [f"{type(e).__name__}: {e}"]
            report = None
        score[bucket][1] += 1
        if not fails:
            score[bucket][0] += 1
            if "real_issue_id" in pair:
                issues_caught.add(pair["real_issue_id"])
        got = (report or {}).get("overall_status") or response.get("status") if report or response else "-"
        diff = f"{report['total_difference']:+.2f}" if report else "-"
        print(f"{'PASS' if not fails else 'FAIL'}  {pair['label']:<20} {str(got):<20} diff={diff:>10}  {'; '.join(fails)}")
        if verbose and report:
            for d in report["days"]:
                print(f"        {d['date']} {d['status']:<24} " + ", ".join(f"{i['pay_type']}:{i['status']}" for i in d["items"]))
    s, m, f = score["single"], score["multi"], score["fp"]
    print(f"SCORE single={s[0]}/{s[1]} multi={m[0]}/{m[1]} fp={f[0]}/{f[1]} real_issues={len(issues_caught)}/4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run it and record the baseline**

Run: `CHECKPAY_REAL_DATA="<private folder>" backend/.venv/bin/python backend/scripts/real_data_regression.py`
Expected: no crash; multi pairs print `SKIP`; a `SCORE` line. Baseline predicted from the review: `single≈6/18 fp≈1/5 real_issues=1/4`. Write the actual numbers into the **Gates** table at the end of this plan (the numbers, never file names).

- [ ] **Step 5: Commit**

```bash
git add .gitignore backend/requirements-dev.txt backend/scripts/real_data_regression.py docs/superpowers/plans/2026-09-25-engine-accuracy.md
git commit -m "test(engine): local real-data regression scoreboard and dev deps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
(`git status` must not list `backend/tests/real_data_expectations.local.json`.)

---

### Task 1: Page 1 as dated actuals

**Files:**
- Modify: `backend/payslip_parser.py` (dataclass fields, `parse_page1` locality, new helpers, `parse_payslip`)
- Modify: `backend/rules_engine.py:170-234` (`process_overtime_shift`) and `:377-495` (`calculate_expected`)
- Modify: `backend/reconciler.py:232-245` (actuals) and `:280-317` (status loop)
- Modify: `backend/main.py` (extract `run_reconciliation`)
- Create: `backend/tests/test_page1_actuals.py`

**Interfaces:**
- Produces: `PayslipData.page1_lines: list[AdjustmentLine]` (section `"current_fortnight"`, `type` normalised to page-2 spelling, `date` `dd.mm.yyyy`), `PayslipData.covered_dates: list[str]` (14 dates), `PayslipData.locality: str`, `PayslipData.fortnights: list[dict]` (`{"start","end","pay_date"}` in `dd.mm.yyyy`); `payslip_parser.normalize_page1_type(str) -> str`; `payslip_parser.page1_overtime_by_date(ps) -> dict[str, float]` (every covered date, value = page-1 Overtime hours); `calculate_expected(..., page1_ot_by_date: dict | None = None)`; `process_overtime_shift(..., ot_from_standard_finish: bool = False)`; `main.run_reconciliation(payslips: list[PayslipData], avacs: list[tuple[str, dict]]) -> dict` (single payslip until Task 6).

- [ ] **Step 1: Failing tests** — `backend/tests/test_page1_actuals.py`:

```python
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from payslip_parser import (AdjustmentLine, CurrentFortnight, CurrentFortnightLine,
                            normalize_page1_type, page1_dated_lines, page1_overtime_by_date)
from rules_engine import calculate_expected
from reconciler import reconcile

RATE = 60.0
DATES = ["03/03", "04/03", "05/03", "06/03", "07/03", "08/03", "09/03",
         "10/03", "11/03", "12/03", "13/03", "14/03", "15/03", "16/03"]


def fortnight(lines):
    return CurrentFortnight(period_start="03/03", period_end="16/03", weekday_dates=DATES, lines=lines)


def line(type_, cells, rate):
    daily = [""] * 14
    for idx, val in cells.items():
        daily[idx] = val
    return CurrentFortnightLine(type=type_, daily_values=daily, rate=rate)


def test_normalize_page1_type_matches_page2_spelling():
    assert normalize_page1_type("Overtime - 1.5") == "Overtime_-_1.5"
    assert normalize_page1_type("Recall - T2.0") == "Recall_-_T2.0"
    assert normalize_page1_type("Recall Guaranteed Hrs 2.0") == "Recall_Guaranteed_Hrs_2.0"
    assert normalize_page1_type("Shift-Sunday Loading-100%") == "Shift-Sunday_Loading-100%"


def test_page1_dated_lines_emits_one_line_per_filled_cell():
    ft = fortnight([
        line("Fortnightly Salary", {0: "7.60"}, 60.0),
        line("Overtime - 1.5", {2: "2.40"}, 90.0),
        line("Recall - T2.0", {5: "5.00"}, 120.0),
    ])
    lines, covered = page1_dated_lines(ft, "26.03.2025")
    assert covered[0] == "03.03.2025" and covered[-1] == "16.03.2025" and len(covered) == 14
    assert [(l.type, l.date, l.units, l.amount, l.section) for l in lines] == [
        ("Overtime_-_1.5", "05.03.2025", 2.4, 216.0, "current_fortnight"),
        ("Recall_-_T2.0", "08.03.2025", 5.0, 600.0, "current_fortnight"),
    ]


def test_page1_date_year_rolls_back_across_january():
    ft = CurrentFortnight(weekday_dates=["22/12", "23/12", "24/12", "25/12", "26/12", "27/12", "28/12",
                                         "29/12", "30/12", "31/12", "01/01", "02/01", "03/01", "04/01"],
                          lines=[line("Overtime - 1.5", {1: "1.00", 11: "1.00"}, 90.0)])
    lines, covered = page1_dated_lines(ft, "14.01.2026")
    assert covered[0] == "22.12.2025" and covered[-1] == "04.01.2026"
    assert [l.date for l in lines] == ["23.12.2025", "02.01.2026"]


def test_page1_negative_cell_is_negative():
    ft = fortnight([line("Overtime - 1.5", {2: "2.40-"}, 90.0)])
    lines, _ = page1_dated_lines(ft, "26.03.2025")
    assert lines[0].units == -2.4 and lines[0].amount == -216.0


def test_page1_lines_empty_when_header_incomplete():
    ft = CurrentFortnight(weekday_dates=DATES[:10], lines=[line("Overtime - 1.5", {2: "2.40"}, 90.0)])
    assert page1_dated_lines(ft, "26.03.2025") == ([], [])


def test_page1_overtime_by_date_covers_every_date():
    ps = SimpleNamespace(covered_dates=["05.03.2025", "06.03.2025"],
                         page1_lines=[AdjustmentLine(type="Overtime_-_1.5", date="05.03.2025", units=2.4),
                                      AdjustmentLine(type="Overtime_-_2.0", date="05.03.2025", units=1.0),
                                      AdjustmentLine(type="Meal_Allowance", date="06.03.2025", units=1.0)])
    assert page1_overtime_by_date(ps) == {"05.03.2025": 3.4, "06.03.2025": 0.0}


def avac(shifts):
    return {"employee": {"name": "Dr Test"}, "shifts": shifts}


def ot_row(date_iso, rostered_finish, actual_finish, line_no=1):
    return {"line": line_no, "date_iso": date_iso, "rostered_start": "07:30", "rostered_finish": rostered_finish,
            "actual_start": "07:30", "actual_finish": actual_finish, "variation_type": "Overtime", "insufficient_break": False}


def recall_row(date_iso, start, finish, line_no=2):
    return {"line": line_no, "date_iso": date_iso, "rostered_start": None, "rostered_finish": None,
            "actual_start": start, "actual_finish": finish, "variation_type": "Recall Onsite", "insufficient_break": False}


def lines_of(result, date):
    day = next(d for d in result.days if d.date == date)
    return {(l.type, l.units) for l in day.lines}


def test_covered_weekday_expects_ot_from_standard_finish():
    shifts = [ot_row("2025-03-05", "16:00", "17:00")]
    uncovered = calculate_expected(avac(shifts), RATE)
    covered = calculate_expected(avac(shifts), RATE, page1_ot_by_date={"05.03.2025": 1.4})
    assert lines_of(uncovered, "05.03.2025") == {("Overtime_-_1.5", 1.0)}
    assert lines_of(covered, "05.03.2025") == {("Overtime_-_1.5", 1.4)}


def test_covered_date_without_roster_row_seeds_threshold_from_page1():
    shifts = [recall_row("2025-03-05", "18:00", "20:00")]
    result = calculate_expected(avac(shifts), RATE, page1_ot_by_date={"05.03.2025": 2.4})
    assert lines_of(result, "05.03.2025") == {("Recall_-", 0.6), ("Recall_-_T2.0", 1.4)}


def build_payslip(page2=(), page1=(), covered=()):
    return SimpleNamespace(
        employee=SimpleNamespace(pay_date="26.03.2025"),
        current_fortnight=SimpleNamespace(period_start="03/03", period_end="16/03"),
        adjustments=list(page2), page1_lines=list(page1), covered_dates=list(covered), fortnights=[],
        is_overpayment_payslip=False, overpayment_amount=0.0, adjustment_total=0.0, adjustment_subtotal_older=0.0)


def test_reconcile_counts_page1_lines_as_actuals():
    expected = calculate_expected(avac([ot_row("2025-03-05", "16:00", "17:00")]), RATE, page1_ot_by_date={"05.03.2025": 1.4})
    ps = build_payslip(page1=[AdjustmentLine(type="Overtime_-_1.5", date="05.03.2025", units=1.4, rate=90.0, amount=126.0, section="current_fortnight")],
                       covered=["05.03.2025"])
    report = reconcile(expected, ps)
    assert report.overall_status == "ALL_MATCH"
    assert report.days[0].matches[0].status == "MATCH"


def test_page1_roster_ot_without_avac_roster_row_is_info():
    expected = calculate_expected(avac([recall_row("2025-03-05", "18:00", "20:00")]), RATE, page1_ot_by_date={"05.03.2025": 2.4})
    ps = build_payslip(
        page1=[AdjustmentLine(type="Overtime_-_1.5", date="05.03.2025", units=2.4, rate=90.0, amount=216.0, section="current_fortnight")],
        page2=[AdjustmentLine(type="Recall_-", date="05.03.2025", units=0.6, rate=90.0, amount=54.0, section="previous_4"),
               AdjustmentLine(type="Recall_-_T2.0", date="05.03.2025", units=1.4, rate=120.0, amount=168.0, section="previous_4")],
        covered=["05.03.2025"])
    report = reconcile(expected, ps)
    statuses = {m.pay_type: m.status for m in report.days[0].matches}
    assert statuses == {"Overtime_-_1.5": "INFO", "Recall_-": "MATCH", "Recall_-_T2.0": "MATCH"}
    assert report.overall_status == "ALL_MATCH"
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_page1_actuals.py -q`
Expected: ImportError on `normalize_page1_type` / `page1_dated_lines`.

- [ ] **Step 3: Parser** — in `backend/payslip_parser.py`:

Add fields to `PayslipData` (after `is_overpayment_payslip`):
```python
    page1_lines: list = field(default_factory=list)     # AdjustmentLine, section="current_fortnight"
    covered_dates: list = field(default_factory=list)   # all 14 dd.mm.yyyy dates of the fortnight
    locality: str = ""                                  # e.g. "Townsville" from page-1 "Locality -Townsville (H)"
    fortnights: list = field(default_factory=list)      # [{"start","end","pay_date"}] dd.mm.yyyy
```
Add after `extract_classification`:
```python
PAGE1_DATED_PREFIXES = ("Overtime", "Recall", "Meal_Allowance", "Fatigue", "Public_Holiday", "Shift")
DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


def normalize_page1_type(type_val: str) -> str:
    """Page 1 prints 'Overtime - 1.5'; page 2 prints 'Overtime_-_1.5'. Whitespace -> underscore."""
    return re.sub(r"\s+", "_", type_val.strip())


def _page1_date(cell: str, pay_date: str) -> str:
    """'17/02' with pay date '12.03.2025' -> '17.02.2025'; a month after the pay month belongs to last year."""
    day, month = cell.strip().split("/")
    pay = datetime.strptime(pay_date, "%d.%m.%Y")
    year = pay.year - 1 if int(month) > pay.month else pay.year
    return f"{int(day):02d}.{int(month):02d}.{year}"


def page1_dated_lines(fortnight: CurrentFortnight, pay_date: str) -> tuple:
    """(dated AdjustmentLines from the per-day columns, covered dates). Empty when the header is not 14 dates."""
    cells = [c for c in fortnight.weekday_dates if c and "/" in c]
    if not pay_date or len(cells) != 14:
        return [], []
    try:
        dates = [_page1_date(c, pay_date) for c in cells]
    except ValueError:
        return [], []
    lines = []
    for line in fortnight.lines:
        ptype = normalize_page1_type(line.type)
        if not ptype.startswith(PAGE1_DATED_PREFIXES):
            continue
        for date, cell in zip(dates, line.daily_values):
            units = parse_units(cell)
            if units == 0:
                continue
            lines.append(AdjustmentLine(type=ptype, date=date, units=units, rate=line.rate,
                                        amount=round(units * line.rate, 2), section="current_fortnight"))
    return lines, dates


def page1_overtime_by_date(ps) -> dict:
    """{covered date: hours of rostered Overtime paid on page 1}. Presence in the dict == covered."""
    out = {d: 0.0 for d in getattr(ps, "covered_dates", []) or []}
    for line in getattr(ps, "page1_lines", []) or []:
        if line.type.startswith("Overtime") and line.date in out:
            out[line.date] = round(out[line.date] + line.units, 2)
    return out


def _extract_locality(text: str) -> str:
    m = re.search(r"Locality\s*-\s*([A-Za-z][A-Za-z ]*?)\s*(?:\(|\n|$)", text)
    return m.group(1).strip() if m else ""
```
In `parse_payslip`, after `result.net_income = net_income`:
```python
        with_text = pdf.pages[0].extract_text() or ""
        result.locality = _extract_locality(with_text)
        result.page1_lines, result.covered_dates = page1_dated_lines(fortnight, employee.pay_date)
        if result.covered_dates:
            result.fortnights = [{"start": result.covered_dates[0], "end": result.covered_dates[-1],
                                  "pay_date": employee.pay_date}]
```

- [ ] **Step 4: Rules engine** — `backend/rules_engine.py`:

Signature: `def process_overtime_shift(shift, base_rate, standard_finish_mins, cumulative_ot, day_type, ot_from_standard_finish=False):` and replace the weekday baseline block with:
```python
        rostered_finish = shift.get("rostered_finish")
        if ot_from_standard_finish or not rostered_finish:
            # Covered date: page 1 carries the rostered extension, so everything past 15:36 is expected.
            ot_baseline_mins = standard_finish_mins
        else:
            rf_mins = time_to_minutes(rostered_finish)
            ot_baseline_mins = rf_mins if rf_mins <= standard_finish_mins + 30 else standard_finish_mins
```
`calculate_expected` signature gains `page1_ot_by_date: dict = None`. Replace the pre-seed block (`if day_type == "weekday": for shift in day_shifts: ...`) with:
```python
        covered = page1_ot_by_date is not None and payslip_date in page1_ot_by_date
        if day_type == "weekday":
            has_roster_row = any(s.get("rostered_start") and s.get("rostered_finish") for s in day_shifts)
            if covered and not has_roster_row:
                # Roster-driven OT paid on page 1 consumed the threshold before any recall.
                cumulative_ot = page1_ot_by_date[payslip_date]
            elif not covered:
                for shift in day_shifts:
                    rf = shift.get("rostered_finish")
                    if rf and shift.get("rostered_start"):
                        rf_mins = time_to_minutes(rf)
                        if standard_finish_mins < rf_mins <= standard_finish_mins + 30:
                            cumulative_ot = minutes_to_hours(rf_mins - standard_finish_mins)
                        break
```
Pass `ot_from_standard_finish=covered` in both `process_overtime_shift(...)` calls.

- [ ] **Step 5: Reconciler** — `backend/reconciler.py`:

Replace the actuals loop with:
```python
    actual_by_date = {}
    all_adjustment_dates = []  # page-2 dates only: evidence payroll processed something
    page1_lines = list(getattr(payslip_data, "page1_lines", []) or [])
    for adj in list(payslip_data.adjustments) + page1_lines:
        if adj.section == "adjustment_only" or not adj.date:
            continue
        if adj.section != "current_fortnight":
            all_adjustment_dates.append(adj.date)
        if avac_dates_only and adj.date not in avac_dates:
            continue
        actual_by_date.setdefault(adj.date, {})
        key = normalize_type(adj.type)
        actual_by_date[adj.date].setdefault(key, {"units": 0, "amount": 0})
        actual_by_date[adj.date][key]["units"] += adj.units
        actual_by_date[adj.date][key]["amount"] += adj.amount
    covered_dates = set(getattr(payslip_data, "covered_dates", []) or [])
```
Inside the per-date loop, before `all_types = ...`:
```python
        roster_ot_is_info = (date in covered_dates and dtype == "weekday"
                             and not any(k.startswith("Overtime") for k in exp))
```
and make the first status branch:
```python
            if roster_ot_is_info and pay_type.startswith("Overtime") and e["amount"] == 0:
                m.status = "INFO"
                m.notes = "Rostered overtime paid on payslip page 1 (the AVAC has no rostered shift on this date)"
                report.match_count += 1
            elif pay_type in INFORMATIONAL_TYPES and e["amount"] == 0:
```

- [ ] **Step 6: main.py** — extract the core:

```python
from payslip_parser import parse_payslip, page1_overtime_by_date


def _has_positive_ot(ps) -> bool:
    return any(adj.amount > 0 and adj.date and any(kw in adj.type.lower() for kw in OT_KEYWORDS)
               for adj in ps.adjustments if adj.section != "adjustment_only")


def _correction_response(ps) -> dict:
    return {"status": "correction_payslip", "employee": ps.employee.name, "pay_date": ps.employee.pay_date,
            "pay_period_start": ps.current_fortnight.period_start, "pay_period_end": ps.current_fortnight.period_end,
            "message": "This payslip contains only corrections/reversals from previous pay periods. There are no new overtime or recall payments to verify against AVACs.",
            "adjustment_total": ps.adjustment_total, "overpayment_amount": ps.overpayment_amount, "avac_results": []}


def run_reconciliation(payslips: list, avacs: list) -> dict:
    """Deterministic core shared by every endpoint. avacs = [(display name, parse_avac() dict)]."""
    ps = payslips[0]  # Task 6 merges several
    if ps.is_overpayment_payslip and not _has_positive_ot(ps):
        return _correction_response(ps)
    page1_ot = page1_overtime_by_date(ps)
    results = []
    for name, avac_data in avacs:
        expected = calculate_expected(avac_data, ps.base_hourly_rate, page1_ot_by_date=page1_ot)
        results.append({"avac_name": name, "report": report_to_frontend(reconcile(expected, ps))})
    return {"status": "ok", "employee": ps.employee.name, "pay_date": ps.employee.pay_date,
            "pay_period_start": ps.current_fortnight.period_start, "pay_period_end": ps.current_fortnight.period_end,
            "base_rate": ps.base_hourly_rate, "is_overpayment_payslip": ps.is_overpayment_payslip,
            "adjustment_total": ps.adjustment_total, "avac_results": results,
            "older_adjustments_total": ps.adjustment_subtotal_older}
```
The endpoint body after parsing the payslip becomes: parse each AVAC into `parsed = [(filename, data)]`, collecting `errors = {index: message}`; call `response = run_reconciliation([ps], parsed)`; then rebuild `response["avac_results"]` in upload order, inserting `{"avac_name": name, "error": "Could not process this AVAC file."}` for failed indexes. Delete the now-duplicated correction block from the endpoint.

- [ ] **Step 7: Run tests and scoreboard**

Run: `backend/.venv/bin/python -m pytest backend/tests -q` → all pass. Run the Task 0 script → `single` must be ≥ baseline (the page-1-paid week pair should now pass).

- [ ] **Step 8: Commit**

```bash
git add backend/payslip_parser.py backend/rules_engine.py backend/reconciler.py backend/main.py backend/tests/test_page1_actuals.py
git commit -m "feat(engine): read payslip page 1 as dated actuals and threshold evidence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fatigue detection — chronological, marker-aware, pool-able

**Files:**
- Modify: `backend/avac_parser.py:213-332` (`_build_shifts`), `:425-498` (`_detect_insufficient_breaks`), add `detect_breaks_across`
- Modify: `docs/RECONCILIATION_RULES.md` §5.1 (one sentence)
- Create: `backend/tests/test_fatigue_detection.py`

**Interfaces:**
- Produces: `avac_parser.FATIGUE_MARKER` (compiled regex); `ShiftEntry.insufficient_break` set from the marker on rostered rows; `detect_breaks_across(shift_dicts: list[dict]) -> None` (mutates dicts in place; used by Task 6).

- [ ] **Step 1: Failing tests** — `backend/tests/test_fatigue_detection.py`:

```python
import sys
from dataclasses import asdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from avac_parser import ShiftEntry, _build_shifts, _detect_insufficient_breaks, detect_breaks_across
from rules_engine import calculate_expected


def entry(line, date, rs, rf, as_, af, vtype, reason=""):
    return ShiftEntry(line=line, date=date, date_iso=None, personnel_number=None, employee_name=None, pay_level=None,
                      rostered_start=rs, rostered_finish=rf, actual_start=as_, actual_finish=af,
                      variation_type=vtype, reason=reason, initials="")


def test_detector_uses_date_order_not_form_row_order():
    shifts = [
        entry(1, "10/03/2025", "07:30", "15:36", "07:30", "17:30", "Overtime"),
        entry(2, "12/03/2025", "07:30", "15:36", "07:30", "17:30", "Overtime"),
        entry(3, "13/03/2025", "07:30", "15:36", "07:30", "16:30", "Overtime"),
        entry(4, "11/03/2025", None, None, "20:30", "00:00", "Recall Onsite"),
    ]
    _detect_insufficient_breaks(shifts)
    flagged = {s.date: s.break_gap_hours for s in shifts if s.insufficient_break}
    assert flagged == {"12/03/2025": 7.5}


def _dataset_row(block, rs, rf, as_, af):
    fields = [("Date", "12/03/2025"), ("RosteredStart", rs), ("RosteredFinish", rf), ("ActualStart", as_), ("ActualFinish", af)]
    return {"block_name": block, "fields": [(k, v) for k, v in fields if v]}


def test_fatigue_marker_on_rostered_row_sets_flag():
    rows = [_dataset_row("Variation2", "07:30", "15:36", "07:30", "17:30"),
            _dataset_row("Variation3", None, None, "20:00", "22:00")]
    blocks = [{"block_name": "Variation2", "reason": "*Fatigue pay* ward cover", "dropdown_id": "1"},
              {"block_name": "Variation3", "reason": "*Fatigue pay* noted", "dropdown_id": "2"}]
    shifts = _build_shifts(rows, blocks, {"1": "0", "2": "2"})
    assert [s.insufficient_break for s in shifts] == [True, False]
    assert shifts[0].variation_type == "Overtime"  # still an OT row: pays OT *and* fatigue (Rule 5.4)


def test_engine_pays_ot_and_fatigue_for_marker_row():
    shift = {"line": 1, "date_iso": "2025-03-12", "rostered_start": "07:30", "rostered_finish": "15:36",
             "actual_start": "07:30", "actual_finish": "17:30", "variation_type": "Overtime", "insufficient_break": True}
    result = calculate_expected({"employee": {"name": "Dr Test"}, "shifts": [shift]}, 60.0)
    assert {(l.type, l.units) for l in result.days[0].lines} == {
        ("Overtime_-_1.5", 1.9), ("Fatigue_Penalty_@1.0", 7.6), ("Fatigue_Penalty_@1.5", 1.9)}


def test_detect_breaks_across_spans_files():
    week_a = [asdict(entry(1, "09/03/2025", None, None, "12:00", "00:00", "Recall Onsite"))]
    week_b = [asdict(entry(1, "10/03/2025", "07:30", "15:36", "07:30", "20:00", "Overtime"))]
    detect_breaks_across(week_a + week_b)
    assert week_b[0]["insufficient_break"] is True
    assert week_b[0]["break_gap_hours"] == 7.5
    assert week_a[0]["insufficient_break"] is False
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_fatigue_detection.py -q`
Expected: ImportError `detect_breaks_across`; first test fails (12/03 not flagged).

- [ ] **Step 3: Implement** — `backend/avac_parser.py`:

Module level (after `VARIATION_TYPE_MAP`):
```python
# docs/RECONCILIATION_RULES.md §5.1: a "*Fatigue pay*" comment on a rostered row marks it as fatigue.
FATIGUE_MARKER = re.compile(r"fatigue", re.IGNORECASE)
```
In `_build_shifts`, replace the `ShiftEntry(...)` construction's `insufficient_break` handling: before it add
```python
        marker_fatigue = bool(rostered_start and rostered_finish and FATIGUE_MARKER.search(reason_text))
```
and pass `insufficient_break=marker_fatigue,` to `ShiftEntry(...)`.

In `_detect_insufficient_breaks`, replace `for i in range(1, len(shifts)): prev = shifts[i - 1]; curr = shifts[i]` with:
```python
    def _sort_key(s):
        return (s.date_iso or _to_iso(s.date) or "", s.actual_start or "")

    ordered = sorted(shifts, key=_sort_key)  # form-row order is not chronological
    for i in range(1, len(ordered)):
        prev = ordered[i - 1]
        curr = ordered[i]
```
Add at module level (after `_detect_insufficient_breaks`):
```python
_SHIFT_FIELDS = tuple(ShiftEntry.__dataclass_fields__)


def detect_breaks_across(shift_dicts: list) -> None:
    """Run 10-hour-break detection over shifts from several AVAC files, writing flags back into the dicts."""
    entries = []
    for d in shift_dicts:
        e = ShiftEntry(**{k: d.get(k) for k in _SHIFT_FIELDS if k in d or k in ("line", "date", "date_iso", "personnel_number",
                                                                                 "employee_name", "pay_level", "rostered_start",
                                                                                 "rostered_finish", "actual_start", "actual_finish",
                                                                                 "variation_type", "reason", "initials")})
        e.variation_type = e.variation_type or ""
        e.reason = e.reason or ""
        e.initials = e.initials or ""
        entries.append((d, e))
    _detect_insufficient_breaks([e for _, e in entries])
    for d, e in entries:
        if e.insufficient_break:
            d["insufficient_break"] = True
            d["break_gap_hours"] = e.break_gap_hours
            d["previous_finish"] = e.previous_finish
        else:
            d.setdefault("insufficient_break", False)
```
Docs: in §5.1 change "or includes "*Fatigue pay*" in the comments." to "or includes the word "fatigue" (any case, e.g. "*Fatigue pay*") in the comments of a rostered row. Shifts are compared in date/time order across all uploaded AVACs, so a Monday after a Sunday-night recall is detected."

- [ ] **Step 4: Run tests + scoreboard**

Run: `backend/.venv/bin/python -m pytest backend/tests -q`; then the Task 0 script. Expected: the two fatigue pairs flip to PASS; nothing regresses.

- [ ] **Step 5: Commit**

```bash
git add backend/avac_parser.py backend/tests/test_fatigue_detection.py docs/RECONCILIATION_RULES.md
git commit -m "fix(avac): chronological 10h-break detection, honour fatigue comment, pool across files

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Headline = actionable amount; reversals counted apart; junk rows dropped

**Files:**
- Modify: `backend/reconciler.py` (`ReconciliationReport`, status loop, replace totals with `_finalize`)
- Modify: `backend/main.py:78-99` (`report_to_frontend`)
- Modify: `backend/payslip_parser.py:297-323` (`parse_page2` row filter)
- Modify: `lib/jobs.ts:37-58` (additive fields)
- Create: `backend/tests/test_headline_totals.py`

**Interfaces:**
- Produces: `reconciler.ACTIONABLE_STATUSES`, `reconciler.NON_ACTIONABLE_STATUSES`, `reconciler.PENDING_STATUSES` (module level), `ReconciliationReport.reversal_count: int`, `.informational_difference: float`, `.pending_expected_total: float`; `reconciler._finalize(report)`; `day.difference` and `report.total_difference` are actionable-only.

- [ ] **Step 1: Failing tests** — `backend/tests/test_headline_totals.py`:

```python
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from payslip_parser import parse_page2
from reconciler import reconcile


def expected(lines_by_date):
    days = []
    for date, lines in lines_by_date.items():
        days.append(SimpleNamespace(date=date, day_of_week="Wed", day_type="weekday",
                                    lines=[SimpleNamespace(type=t, units=u, amount=a) for t, u, a in lines]))
    return SimpleNamespace(employee_name="Dr Test", base_hourly_rate=60.0, days=days)


def payslip(rows):
    return SimpleNamespace(
        employee=SimpleNamespace(pay_date="26.03.2025"),
        current_fortnight=SimpleNamespace(period_start="03/03", period_end="16/03"),
        adjustments=[SimpleNamespace(section="previous_4", date=d, type=t, units=u, amount=a) for d, t, u, a in rows],
        page1_lines=[], covered_dates=[], fortnights=[],
        is_overpayment_payslip=False, overpayment_amount=0.0, adjustment_total=0.0, adjustment_subtotal_older=0.0)


def test_total_difference_ignores_info_lines():
    exp = expected({"05.03.2025": [("Recall_-_T2.0", 2.0, 240.0)]})
    ps = payslip([("05.03.2025", "Recall_-_T2.0", 2.0, 240.0), ("05.03.2025", "OCA_-_RMO_-_Level_4_to_13", -4.0, -21.0)])
    report = reconcile(exp, ps)
    assert report.overall_status == "ALL_MATCH"
    assert report.total_difference == 0.0
    assert report.informational_difference == -21.0
    assert report.days[0].difference == 0.0


def test_reversal_has_its_own_counter():
    exp = expected({"05.03.2025": [("Overtime_-_1.5", 1.0, 90.0)]})
    ps = payslip([("05.03.2025", "Overtime_-_1.5", -1.0, -90.0)])
    report = reconcile(exp, ps)
    assert report.reversal_count == 1 and report.unmatched_count == 0
    assert report.overall_status == "OK_WITH_ANOMALIES"
    assert report.total_difference == 0.0


def test_one_amount_per_issue():
    exp = expected({"05.03.2025": [("Recall_-_T2.5", 5.0, 750.0)]})
    ps = payslip([("05.03.2025", "Recall_-_T2.5", 2.4, 360.0), ("05.03.2025", "Public_Holiday_-_50%", 4.0, 120.0)])
    report = reconcile(exp, ps)
    line = next(m for m in report.days[0].matches if m.pay_type == "Recall_-_T2.5")
    assert line.status == "UNDERPAID"
    assert line.difference == report.days[0].difference == report.total_difference == -390.0


class FakePage:
    def __init__(self, table):
        self._table = table

    def extract_tables(self):
        return [self._table]

    def extract_text(self):
        return ""


def test_parse_page2_drops_rows_without_a_date():
    table = [
        ["Adjustments From Previous 4 Pay Periods", None, None, None, None, None],
        ["Overtime_-_1.5\nQSUPER_ACCUM_PLAN 720.09", "05.03.2025\nFor your leave balance,", None, "1.00\n", "90.0000\n", "90.00\n720.09"],
    ]
    adjustments, *_ = parse_page2(FakePage(table))
    assert [(a.type, a.date, a.amount) for a in adjustments] == [("Overtime_-_1.5", "05.03.2025", 90.0)]
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_headline_totals.py -q`
Expected: `informational_difference`/`reversal_count` AttributeError; junk-row test returns two adjustments.

- [ ] **Step 3: Reconciler**

Module level, next to `INFORMATIONAL_TYPES`:
```python
ACTIONABLE_STATUSES = frozenset({"UNDERPAID", "OVERPAID", "MISSING", "UNMATCHED", "ISSUE_WITHIN_WINDOW"})
NON_ACTIONABLE_STATUSES = frozenset({"INFO", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS", "REVERSAL"})
PENDING_STATUSES = frozenset({"CHECK_PREVIOUS", "CHECK_FUTURE"})  # Task 4 replaces these
```
`ReconciliationReport` gains:
```python
    reversal_count: int = 0
    informational_difference: float = 0.0   # INFO + THRESHOLD_* + REVERSAL, shown but not owed
    pending_expected_total: float = 0.0     # expected $ on days whose payslip is not uploaded yet
```
In the status loop: `REVERSAL` branch → `report.reversal_count += 1` (not `unmatched_count`). Delete the local `NON_ACTIONABLE_STATUSES`/`actionable_diff` block and the `elif abs(actionable_diff) ... OVERPAID` chain (keep the `all_missing` block, which sets `day_summary.status`). Delete the totals/overall computation at the end and the duplicate re-evaluation after consolidation; end the function with:
```python
    _consolidate_recall_threshold_splits(report, expected_result.base_hourly_rate)
    _finalize(report)
    return report
```
Add:
```python
def _finalize(report):
    """Day statuses, one actionable amount per day, report totals, overall status."""
    for day in report.days:
        if day.status in PENDING_STATUSES:
            day.difference = round(day.actual_total - day.expected_total, 2)
            continue
        day.difference = round(sum(m.difference for m in day.matches if m.status not in NON_ACTIONABLE_STATUSES), 2)
        if day.status == "ISSUE_WITHIN_WINDOW":
            continue
        if abs(day.difference) <= ROUNDING_TOLERANCE:
            day.status = "OK"
        elif any(m.status == "REVERSAL" for m in day.matches):
            day.status = "ANOMALY"
        elif day.difference < 0:
            day.status = "UNDERPAID"
        else:
            day.status = "OVERPAID"

    report.total_expected = round(sum(d.expected_total for d in report.days), 2)
    report.total_actual = round(sum(d.actual_total for d in report.days), 2)
    report.total_difference = round(sum(d.difference for d in report.days if d.status not in PENDING_STATUSES), 2)
    report.informational_difference = round(sum(
        m.difference for d in report.days for m in d.matches if m.status in NON_ACTIONABLE_STATUSES), 2)
    report.pending_expected_total = round(sum(d.expected_total for d in report.days if d.status in PENDING_STATUSES), 2)
    report.not_yet_paid_count = report.check_future_count
    report.possibly_missed_count = report.within_window_issue_count

    if report.discrepancy_count or report.missing_count:
        report.overall_status = "DISCREPANCIES_FOUND"
    elif (report.unmatched_count or report.within_window_issue_count or report.reversal_count
          or report.check_previous_count or report.check_future_count):
        report.overall_status = "OK_WITH_ANOMALIES"
    else:
        report.overall_status = "ALL_MATCH"
```
`_consolidate_recall_threshold_splits` keeps adjusting the counters it already touches; `_finalize` recomputes `day.difference` afterwards so THRESHOLD_* lines fall out of the headline.

- [ ] **Step 4: Parser junk filter** — in `parse_page2`, right after `if "Adjustment" in type_val: ... continue`:
```python
            date_val = dates[i].strip() if i < len(dates) else ""
            if not DATE_RE.match(date_val):
                continue  # leave-balance / super tables never carry a dd.mm.yyyy date
```
(`DATE_RE` was added in Task 1.)

- [ ] **Step 5: API + types** — `main.report_to_frontend` adds `"reversal_count": report.reversal_count, "informational_difference": report.informational_difference, "pending_expected_total": report.pending_expected_total`. `lib/jobs.ts` `AvacReport` adds `reversal_count?: number`, `informational_difference?: number`, `pending_expected_total?: number` and a comment: `/** Actionable lines only (UNDERPAID/OVERPAID/MISSING/UNMATCHED/ISSUE_WITHIN_WINDOW). INFO, threshold and reversal lines are in informational_difference. */` above `total_difference`.

- [ ] **Step 6: Run tests + scoreboard**

Run: `backend/.venv/bin/python -m pytest backend/tests -q && npm run test -- --run`. Task 0 script: the four "ALL_MATCH with a non-zero diff" pairs and the three-amounts pair should flip to PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/reconciler.py backend/main.py backend/payslip_parser.py backend/tests/test_headline_totals.py lib/jobs.ts
git commit -m "fix(reconciler): headline counts actionable lines only; reversal counter; drop dateless page-2 rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Same-week evidence and payslip coverage replace the date window

**Files:**
- Modify: `backend/reconciler.py` (delete window classification, add `_classify_pending_days`, `_fortnight_hint`, counters)
- Modify: `backend/main.py` (`report_to_frontend` counters)
- Rewrite: `backend/tests/test_reconciler_pending_statuses.py`
- Modify: `lib/jobs.ts`, `app/(app)/check/report/[id]/report-formatters.ts`, `app/(app)/check/report/[id]/report-view-model.ts`, `lib/sample-report.ts` (+ its test if labels change)
- Modify: `docs/RECONCILIATION_RULES.md` §9

**Interfaces:**
- Consumes: `PayslipData.covered_dates`, `.fortnights` (Task 1); `_finalize`, `PENDING_STATUSES` (Task 3).
- Produces: statuses `NOT_ON_THIS_PAYSLIP`, `NEEDS_FORTNIGHT_PAYSLIP`; `ReconciliationReport.not_on_this_payslip_count`, `.needs_fortnight_payslip_count`; `reconciler.PENDING_STATUSES = {"NOT_ON_THIS_PAYSLIP", "NEEDS_FORTNIGHT_PAYSLIP"}`. `check_previous_count` is always 0; `check_future_count`/`not_yet_paid_count` mirror `not_on_this_payslip_count`.

- [ ] **Step 1: Rewrite the failing tests** — replace `backend/tests/test_reconciler_pending_statuses.py` with:

```python
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from reconciler import reconcile

FORTNIGHT = {"start": "03.03.2025", "end": "16.03.2025", "pay_date": "26.03.2025"}
COVERED = [f"{d:02d}.03.2025" for d in range(3, 17)]


def build_expected(*dates, pay_type="Overtime_-_1.5", units=1.0, amount=90.0):
    days = [SimpleNamespace(date=d, day_of_week="Wed", day_type="weekday",
                            lines=[SimpleNamespace(type=pay_type, units=units, amount=amount)]) for d in dates]
    return SimpleNamespace(employee_name="Dr Test", base_hourly_rate=60.0, days=days)


def adj(date, pay_type="Overtime_-_1.5", units=1.0, amount=90.0, section="previous_4"):
    return SimpleNamespace(section=section, date=date, type=pay_type, units=units, amount=amount)


def build_payslip(page2=(), page1=(), covered=COVERED, fortnights=(FORTNIGHT,)):
    return SimpleNamespace(
        employee=SimpleNamespace(pay_date="26.03.2025"),
        current_fortnight=SimpleNamespace(period_start="03/03", period_end="16/03"),
        adjustments=list(page2), page1_lines=list(page1), covered_dates=list(covered), fortnights=list(fortnights),
        is_overpayment_payslip=False, overpayment_amount=0.0,
        adjustment_total=0.0, adjustment_subtotal_older=0.0)


class PendingStatusTests(unittest.TestCase):
    def test_unprocessed_week_is_not_on_this_payslip(self):
        # AVAC Wed 19.03; payslip only has a page-2 line for the previous week.
        report = reconcile(build_expected("19.03.2025"), build_payslip(page2=[adj("12.03.2025")]))
        day = report.days[0]
        self.assertEqual(day.status, "NOT_ON_THIS_PAYSLIP")
        self.assertEqual(report.not_on_this_payslip_count, 1)
        self.assertEqual(report.missing_count, 0)
        self.assertEqual(report.total_difference, 0.0)
        self.assertEqual(report.pending_expected_total, 90.0)
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")
        self.assertIn("3–10 weeks", day.matches[0].notes)

    def test_processed_week_covered_date_all_missing_is_issue(self):
        # Payroll paid Tue 11.03 on page 2; Wed 12.03 (covered by this payslip's fortnight) has nothing.
        report = reconcile(build_expected("12.03.2025"), build_payslip(page2=[adj("11.03.2025")]))
        self.assertEqual(report.days[0].status, "ISSUE_WITHIN_WINDOW")
        self.assertEqual(report.within_window_issue_count, 1)
        self.assertEqual(report.total_difference, -90.0)

    def test_processed_week_uncovered_date_needs_fortnight_payslip(self):
        # Same as above but the AVAC date is two fortnights earlier: page 1 could have paid it.
        report = reconcile(build_expected("12.02.2025"), build_payslip(page2=[adj("11.02.2025")]))
        day = report.days[0]
        self.assertEqual(day.status, "NEEDS_FORTNIGHT_PAYSLIP")
        self.assertEqual(report.needs_fortnight_payslip_count, 1)
        self.assertEqual(report.total_difference, 0.0)
        self.assertIn("03.02.2025–16.02.2025", day.matches[0].notes)
        self.assertIn("26.02.2025", day.matches[0].notes)

    def test_uncovered_reversal_day_needs_fortnight_payslip(self):
        report = reconcile(build_expected("12.02.2025", units=1.4, amount=126.0),
                           build_payslip(page2=[adj("12.02.2025", units=-1.0, amount=-90.0)]))
        self.assertEqual(report.days[0].status, "NEEDS_FORTNIGHT_PAYSLIP")
        self.assertEqual(report.reversal_count, 0)
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")

    def test_covered_net_negative_reversal_stays_reversal(self):
        report = reconcile(build_expected("12.03.2025"), build_payslip(page2=[adj("12.03.2025", units=-1.0, amount=-90.0)]))
        self.assertEqual(report.days[0].matches[0].status, "REVERSAL")
        self.assertEqual(report.reversal_count, 1)

    def test_page1_match_counts_as_processed_evidence(self):
        # Mon 10.03 paid on page 1 (matches); Sat 15.03 recall missing -> real issue, not "not on this payslip".
        expected = build_expected("10.03.2025", "15.03.2025")
        payslip = build_payslip(page1=[adj("10.03.2025", section="current_fortnight")])
        report = reconcile(expected, payslip)
        statuses = {d.date: d.status for d in report.days}
        self.assertEqual(statuses, {"10.03.2025": "OK", "15.03.2025": "ISSUE_WITHIN_WINDOW"})

    def test_legacy_counters_mirror_new_ones(self):
        report = reconcile(build_expected("19.03.2025"), build_payslip(page2=[adj("12.03.2025")]))
        self.assertEqual(report.check_future_count, 1)
        self.assertEqual(report.not_yet_paid_count, 1)
        self.assertEqual(report.check_previous_count, 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_reconciler_pending_statuses.py -q`
Expected: statuses come back as CHECK_FUTURE/ISSUE_WITHIN_WINDOW; `not_on_this_payslip_count` AttributeError.

- [ ] **Step 3: Reconciler**

Imports: `from datetime import datetime, timedelta`. Replace `PENDING_STATUSES` with `frozenset({"NOT_ON_THIS_PAYSLIP", "NEEDS_FORTNIGHT_PAYSLIP"})`. Add to `ReconciliationReport`:
```python
    not_on_this_payslip_count: int = 0
    needs_fortnight_payslip_count: int = 0
```
In `reconcile()`: keep computing `earliest/latest_adjustment_date` (UI shows them) but delete `scope_end_dt` and the entire `if all_missing: ... day_summary.status = sub_status` block. After the per-date loop, before the `unmatched_payslip` loop, call:
```python
    _classify_pending_days(report, payslip_data, page2_dates=set(all_adjustment_dates), covered=covered_dates)
```
Add the helpers:
```python
def _week_start(dt):
    return dt - timedelta(days=dt.weekday())


def _parse_payslip_date(d):
    try:
        return datetime.strptime(d, "%d.%m.%Y")
    except (TypeError, ValueError):
        return None


def _fortnight_hint(payslip_data, date_dt):
    """(start, end, pay_date) of the fortnight containing date_dt, extrapolated from the uploaded payslip grid."""
    anchors = getattr(payslip_data, "fortnights", None) or []
    parsed = [(_parse_payslip_date(a["start"]), _parse_payslip_date(a["end"]), _parse_payslip_date(a["pay_date"])) for a in anchors]
    parsed = [p for p in parsed if all(p)]
    if not parsed:
        return None
    for s, e, p in parsed:
        if s <= date_dt <= e:
            return s, e, p
    s, e, p = parsed[0]
    k = (date_dt - s).days // 14
    return s + timedelta(days=14 * k), e + timedelta(days=14 * k), p + timedelta(days=14 * k)


_COUNTER_FOR = {"MISSING": "missing_count", "UNDERPAID": "discrepancy_count", "OVERPAID": "discrepancy_count",
                "UNMATCHED": "unmatched_count", "REVERSAL": "reversal_count"}
_PENDING_COUNTER = {"NOT_ON_THIS_PAYSLIP": "not_on_this_payslip_count",
                    "NEEDS_FORTNIGHT_PAYSLIP": "needs_fortnight_payslip_count",
                    "ISSUE_WITHIN_WINDOW": "within_window_issue_count"}


def _reclassify(report, day, matches, status, note):
    for m in matches:
        old = _COUNTER_FOR.get(m.status)
        if old:
            setattr(report, old, getattr(report, old) - 1)
        m.status = status
        m.notes = note
        setattr(report, _PENDING_COUNTER[status], getattr(report, _PENDING_COUNTER[status]) + 1)
    day.status = status


def _classify_pending_days(report, payslip_data, page2_dates, covered):
    """Rule 9: is an unmet expectation actionable?

    processed week = payroll produced something for the AVAC's Mon–Sun week (a page-2 line dated in
                     it, or a page-1 line that met an expected type).
    covered date   = an uploaded payslip's fortnight contains the date, so page 1 is in evidence.
    Never declare a day unpaid unless the payslip that could have paid it is in evidence.
    """
    processed = set()
    for d in page2_dates:
        dt = _parse_payslip_date(d)
        if dt:
            processed.add(_week_start(dt))
    for day in report.days:
        dt = _parse_payslip_date(day.date)
        if dt and any(m.status in ("MATCH", "UNDERPAID", "OVERPAID") for m in day.matches):
            processed.add(_week_start(dt))

    for day in report.days:
        dt = _parse_payslip_date(day.date)
        if not dt:
            continue
        unmet = [m for m in day.matches if m.status in ("MISSING", "UNDERPAID")]
        has_reversal = any(m.status == "REVERSAL" for m in day.matches)
        all_missing = bool(day.matches) and all(m.status == "MISSING" for m in day.matches)
        if _week_start(dt) not in processed:
            if unmet:
                _reclassify(report, day, unmet, "NOT_ON_THIS_PAYSLIP",
                            f"The week of {_week_start(dt):%d.%m.%Y} is not on the uploaded payslip(s). "
                            f"Payment usually appears on a payslip dated 3–10 weeks after the AVAC week.")
        elif day.date not in covered and (all_missing or has_reversal):
            hint = _fortnight_hint(payslip_data, dt)
            where = (f"the payslip for fortnight {hint[0]:%d.%m.%Y}–{hint[1]:%d.%m.%Y} (pay date about {hint[2]:%d.%m.%Y})"
                     if hint else "the payslip for the fortnight containing this date")
            targets = [m for m in day.matches if m.status not in ("MATCH", "INFO", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS")]
            _reclassify(report, day, targets, "NEEDS_FORTNIGHT_PAYSLIP",
                        f"Rostered pay for {day.date} would be on {where}, which is not uploaded. "
                        f"Upload it and re-run to verify this day.")
        elif all_missing:
            _reclassify(report, day, list(day.matches), "ISSUE_WITHIN_WINDOW",
                        f"Payroll processed other days of this week but nothing for {day.date}. "
                        f"Ask payroll why this date was not paid.")
```
In `_finalize`, replace the legacy mirror lines and the overall-status condition with:
```python
    report.check_future_count = report.not_on_this_payslip_count
    report.not_yet_paid_count = report.not_on_this_payslip_count
    report.possibly_missed_count = report.within_window_issue_count
    ...
    elif (report.unmatched_count or report.within_window_issue_count or report.reversal_count
          or report.not_on_this_payslip_count or report.needs_fortnight_payslip_count):
        report.overall_status = "OK_WITH_ANOMALIES"
```
Delete the old inline `_parse_payslip_date` closure (now module level) and the `STATUS_ICONS`/`print_report` entries for CHECK_PREVIOUS/CHECK_FUTURE; add `"NOT_ON_THIS_PAYSLIP": "⏭️", "NEEDS_FORTNIGHT_PAYSLIP": "📄"` and print branches mirroring the CHECK_FUTURE one.

`main.report_to_frontend` adds `"not_on_this_payslip_count"`, `"needs_fortnight_payslip_count"`.

- [ ] **Step 4: Frontend contract**

`lib/jobs.ts`: `DayResult.status` union add `'NOT_ON_THIS_PAYSLIP' | 'NEEDS_FORTNIGHT_PAYSLIP'`; `AvacReport` add `not_on_this_payslip_count?: number`, `needs_fortnight_payslip_count?: number`.

`report-formatters.ts`:
```ts
export const PENDING_CHECK_STATUSES = new Set([
  'NOT_ON_THIS_PAYSLIP',
  'NEEDS_FORTNIGHT_PAYSLIP',
  'CHECK_PREVIOUS',
  'CHECK_FUTURE',
  'NOT_YET_PAID',
  'FUTURE_PAY_PERIOD',
])
```
STATUS_LABELS add `['NOT_ON_THIS_PAYSLIP', 'Not on this payslip yet']`, `['NEEDS_FORTNIGHT_PAYSLIP', 'Needs the fortnight payslip']`. `getStatusTone`: both → `'timing'`. `getActionPriority`: `NEEDS_FORTNIGHT_PAYSLIP` → 5, `NOT_ON_THIS_PAYSLIP` → 6. `getRecommendedAction`: `NEEDS_FORTNIGHT_PAYSLIP` → `'Upload the payslip named in the note and re-run the check.'`; `NOT_ON_THIS_PAYSLIP` → `'Not paid on the uploaded payslip(s) yet. Re-run with a payslip dated 3–10 weeks after this AVAC week.'`. `DAY_STATUS_PRIORITY`: insert `'NEEDS_FORTNIGHT_PAYSLIP', 'NOT_ON_THIS_PAYSLIP'` after `'CHECK_FUTURE'`.

`report-view-model.ts` `buildNextSteps` (the `if (pendingCheckCount > 0)` block): replace with
```ts
  if (needsFortnightCount > 0) {
    steps.push(`Upload the fortnight payslip named in the report to verify ${formatCount(needsFortnightCount, 'claim', 'claims')} that payroll may have paid as rostered overtime.`)
  }
  if (notOnThisPayslipCount > 0) {
    steps.push(`${formatCount(notOnThisPayslipCount, 'claim is', 'claims are')} not on the uploaded payslip(s) yet. Payment usually appears 3–10 weeks after the AVAC week; if it is older than that, ask payroll whether the AVAC was received.`)
  }
```
where the two counts are summed from `report.needs_fortnight_payslip_count ?? 0` and `report.not_on_this_payslip_count ?? report.check_future_count ?? 0` next to the existing `checkFutureCount` reduce; thread them into `buildNextSteps`' params in place of `checkPreviousCount`/`futureCheckCount`.

`lib/sample-report.ts`: replace the six `CHECK_FUTURE` statuses with `NOT_ON_THIS_PAYSLIP` and their notes with the new wording; run `npm run test -- --run` and update any label assertion in `lib/sample-report.test.ts` / `report-view-model.test.ts` from 'Check next payslip' to 'Not on this payslip yet'.

- [ ] **Step 5: Docs** — replace §9 of `docs/RECONCILIATION_RULES.md` with:

```markdown
## 9. Matching AVAC dates to payslip dates

### Rule 9.1 — Evidence that payroll processed a week
A week (Mon–Sun) counts as processed when any uploaded payslip has a page-2 adjustment dated in that
week, or a page-1 line on an AVAC date that meets an expected pay type. Page 2 is sparse, so the
old "earliest..latest adjustment date" window is not used.

### Rule 9.2 — Coverage
A date is covered when an uploaded payslip's fortnight (page 1) contains it. Only then can CheckPay
see rostered pay that payroll put on page 1.

### Rule 9.3 — Classifying an unmet expectation
| Classification | Condition | Meaning |
|---|---|---|
| NOT_ON_THIS_PAYSLIP | week not processed | Neutral. Payment usually appears 3–10 weeks after the AVAC week. |
| NEEDS_FORTNIGHT_PAYSLIP | week processed, date not covered, and the day is entirely unpaid on page 2 or carries a reversal | Neutral. The note names the fortnight payslip (and approximate pay date) to upload. |
| ISSUE_WITHIN_WINDOW | week processed, date covered, day entirely unpaid | Actionable. Payroll skipped this day. |
| MISSING / UNDERPAID | partially paid day | Actionable line-level shortfall. |

CheckPay never declares a day unpaid unless the payslip that could have paid it is in evidence.
```

- [ ] **Step 6: Run everything**

Run: `backend/.venv/bin/python -m pytest backend/tests -q && npm run test -- --run && npm run lint`, then the Task 0 script. Expected: the false-positive guard pairs and the three neutral pairs flip to PASS; `real_issues` unchanged or up.

- [ ] **Step 7: Commit**

```bash
git add backend/reconciler.py backend/main.py backend/tests/test_reconciler_pending_statuses.py lib/jobs.ts lib/sample-report.ts lib/sample-report.test.ts "app/(app)/check/report/[id]/report-formatters.ts" "app/(app)/check/report/[id]/report-view-model.ts" "app/(app)/check/report/[id]/report-view-model.test.ts" docs/RECONCILIATION_RULES.md
git commit -m "feat(reconciler): same-week evidence and payslip coverage replace the date window

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rules gaps — weekend meal break, locality-aware public holidays

**Files:**
- Modify: `backend/rules_engine.py:39-45` (`get_qld_public_holidays`), `:200-203` (weekend OT), `calculate_expected` holiday derivation
- Modify: `backend/main.py` (`run_reconciliation` passes `public_holidays`)
- Modify: `docs/RECONCILIATION_RULES.md` §2.4, §3.4
- Create: `backend/tests/test_rules_gaps.py`

**Interfaces:**
- Produces: `get_qld_public_holidays(year: int, locality: str | None = None) -> set[str]`; `holidays_for(avac_data: dict, locality: str) -> set[str]`; `REGIONAL_SHOW_DAYS` table.

- [ ] **Step 1: Failing tests** — `backend/tests/test_rules_gaps.py`:

```python
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from rules_engine import calculate_expected, get_qld_public_holidays, holidays_for


def sat_ot(finish):
    return {"employee": {"name": "Dr Test"}, "shifts": [{
        "line": 1, "date_iso": "2025-03-08", "rostered_start": "08:00", "rostered_finish": "12:00",
        "actual_start": "08:00", "actual_finish": finish, "variation_type": "Overtime", "insufficient_break": False}]}


def units(result):
    return {(l.type, l.units) for l in result.days[0].lines}


def test_weekend_ot_deducts_meal_break_over_five_hours():
    assert units(calculate_expected(sat_ot("15:00"), 60.0)) == {("Overtime_-_1.5", 3.0), ("Overtime_-_2.0", 3.5)}


def test_weekend_ot_of_five_hours_or_less_keeps_full_span():
    assert units(calculate_expected(sat_ot("13:00"), 60.0)) == {("Overtime_-_1.5", 3.0), ("Overtime_-_2.0", 2.0)}


def test_townsville_gets_show_day_and_loses_ekka():
    days = get_qld_public_holidays(2025, "Townsville")
    assert "2025-07-07" in days and "2025-08-13" not in days and "2025-04-21" in days


def test_brisbane_and_unknown_locality_keep_state_list():
    assert "2025-08-13" in get_qld_public_holidays(2025, "Brisbane")
    assert "2025-08-13" in get_qld_public_holidays(2025, None)
    assert "2025-07-07" not in get_qld_public_holidays(2025, None)


def test_holidays_for_uses_avac_years_and_locality():
    avac = {"shifts": [{"date_iso": "2025-07-07"}, {"date_iso": "2026-01-02"}]}
    days = holidays_for(avac, "Townsville")
    assert "2025-07-07" in days and "2026-01-01" in days


def test_show_day_recall_is_paid_at_2_5x():
    avac = {"employee": {"name": "Dr Test"}, "shifts": [{
        "line": 1, "date_iso": "2025-07-07", "rostered_start": None, "rostered_finish": None,
        "actual_start": "13:00", "actual_finish": "18:00", "variation_type": "Recall Onsite", "insufficient_break": False}]}
    result = calculate_expected(avac, 60.0, public_holidays=holidays_for(avac, "Townsville"))
    assert units(result) == {("Recall_-_T2.5", 5.0)}
```

- [ ] **Step 2: Run to verify failure** — `backend/.venv/bin/python -m pytest backend/tests/test_rules_gaps.py -q` → ImportError `holidays_for`; meal test expects 3.5 but gets 4.0.

- [ ] **Step 3: Implement** — `backend/rules_engine.py`:

```python
EKKA_NAME = "The Royal Queensland Show"  # Brisbane-area holiday in the `holidays` library; not observed elsewhere

# ponytail: hand-maintained gazette table. Only localities verified against a real payslip are listed;
# add a line per (locality, year) from the QLD "show holidays" gazette when a new locality appears.
REGIONAL_SHOW_DAYS = {
    "townsville": {2025: "2025-07-07"},
    "brisbane": {2025: "2025-08-13"},
}


def get_qld_public_holidays(year: int, locality: str = None) -> set:
    """QLD public holidays as ISO strings, adjusted for the payslip locality's show day."""
    loc = (locality or "").strip().lower()
    qld = holidays_lib.Australia(state='QLD', years=year)
    days = {str(d) for d, name in qld.items() if not (loc and loc != "brisbane" and name == EKKA_NAME)}
    show = REGIONAL_SHOW_DAYS.get(loc, {}).get(year)
    if show:
        days.add(show)
    return days


def holidays_for(avac_data: dict, locality: str = "") -> set:
    years = {int(s["date_iso"][:4]) for s in avac_data.get("shifts", []) if s.get("date_iso")} or {2025}
    out = set()
    for y in years:
        out |= get_qld_public_holidays(y, locality)
    return out
```
Replace the `if public_holidays is None:` block in `calculate_expected` with `if public_holidays is None: public_holidays = holidays_for(avac_data)`. Weekend branch of `process_overtime_shift`:
```python
        ot_hours = total_shift_hours - MEAL_BREAK_HOURS if total_shift_hours > 5 else total_shift_hours
        ot_note = f"Full shift OT on {day_type} {shift['actual_start']}-{shift['actual_finish']} ({ot_hours:.2f}h after meal break, cum: {cumulative_ot:.2f}h)"
```
`main.run_reconciliation`: `expected = calculate_expected(avac_data, ps.base_hourly_rate, public_holidays=holidays_for(avac_data, ps.locality), page1_ot_by_date=page1_ot)`.

Docs: §2.4 add "The 0.5h unpaid meal break is deducted from weekend/PH shifts longer than 5h (payroll does this; matches Rule 6.1)." §3.4 add "Regional show days are added from the payslip's Locality (e.g. Townsville Show Day) and the Brisbane Ekka is removed outside Brisbane."

- [ ] **Step 4: Run** — full python tests + Task 0 script (no regression; multi pairs still skipped).

- [ ] **Step 5: Commit**

```bash
git add backend/rules_engine.py backend/main.py backend/tests/test_rules_gaps.py docs/RECONCILIATION_RULES.md
git commit -m "fix(rules): weekend meal-break deduction and locality-aware show days

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Two-phase API, pooled fatigue detection, multi-payslip merge (backend)

**Files:**
- Modify: `backend/payslip_parser.py` (`payslip_from_dict`, `merge_payslips`)
- Modify: `backend/avac_parser.py` (`validate_avac_dict`)
- Modify: `backend/main.py` (`/api/parse`, `/api/reconcile/json`, `run_reconciliation` merge + pooling + `payslips` + `unpaid_weeks`)
- Modify: `lib/jobs.ts` (additive response types)
- Create: `backend/tests/test_two_phase_api.py`

**Interfaces:**
- Produces: `POST /api/parse` (multipart `file`, `kind=payslip|avac`) → `{"kind","name","data"}`; `POST /api/reconcile/json` (JSON `{"payslips":[PayslipData dict…], "avacs":[{"name","data"}…]}`) → same shape as `/api/reconcile` plus `payslips: [{pay_date, period_start, period_end}]` and `unpaid_weeks: [{week_start, avac_name, expected_total}]`; `payslip_parser.payslip_from_dict(d) -> PayslipData` (raises `ValueError`), `payslip_parser.merge_payslips(list) -> PayslipData`, `avac_parser.validate_avac_dict(d) -> dict` (raises `ValueError`); `main.MAX_PAYSLIP_FILES = 8`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_two_phase_api.py`:

```python
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi.testclient import TestClient

import main
from avac_parser import validate_avac_dict
from payslip_parser import AdjustmentLine, PayslipData, Employee, merge_payslips, payslip_from_dict, payslip_to_dict

client = TestClient(main.app)


def payslip_dict(pay_date="26.03.2025", covered_start=3, page1=(), page2=()):
    ps = PayslipData(employee=Employee(name="Dr Test", pay_date=pay_date))
    ps.base_hourly_rate = 60.0
    ps.covered_dates = [f"{d:02d}.03.2025" for d in range(covered_start, covered_start + 14)]
    ps.fortnights = [{"start": ps.covered_dates[0], "end": ps.covered_dates[-1], "pay_date": pay_date}]
    ps.page1_lines = [AdjustmentLine(**l) for l in page1]
    ps.adjustments = [AdjustmentLine(**l) for l in page2]
    return payslip_to_dict(ps)


OT_LINE = {"type": "Overtime_-_1.5", "date": "05.03.2025", "units": 1.4, "rate": 90.0, "amount": 126.0, "section": "current_fortnight"}


def avac_dict(shifts):
    return {"employee": {"name": "Dr Test"}, "workplace": {"location": ""}, "shifts": shifts}


def ot_shift(date_iso, finish, line=1):
    return {"line": line, "date": None, "date_iso": date_iso, "rostered_start": "07:30", "rostered_finish": "16:00",
            "actual_start": "07:30", "actual_finish": finish, "variation_type": "Overtime", "reason": "", "initials": ""}


def test_payslip_round_trips_through_dict():
    ps = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    assert ps.base_hourly_rate == 60.0 and ps.page1_lines[0].amount == 126.0 and len(ps.covered_dates) == 14


def test_payslip_from_dict_rejects_garbage():
    with pytest.raises(ValueError):
        payslip_from_dict(["not", "a", "payslip"])


def test_merge_payslips_dedupes_same_pay_date():
    a = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    b = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    merged = merge_payslips([a, b])
    assert len(merged.page1_lines) == 1 and len(merged.covered_dates) == 14


def test_merge_payslips_concatenates_and_keeps_latest_rate():
    a = payslip_from_dict(payslip_dict(pay_date="12.03.2025", covered_start=1))
    b = payslip_from_dict(payslip_dict(pay_date="26.03.2025", covered_start=15, page1=[OT_LINE]))
    b.base_hourly_rate = 61.0
    merged = merge_payslips([b, a])
    assert merged.employee.pay_date == "26.03.2025" and merged.base_hourly_rate == 61.0
    assert len(merged.covered_dates) == 28 and len(merged.fortnights) == 2


def test_validate_avac_dict_limits():
    with pytest.raises(ValueError):
        validate_avac_dict({"shifts": [ot_shift("2025-03-05", "17:00")] * 201})
    with pytest.raises(ValueError):
        validate_avac_dict({"shifts": [{**ot_shift("2025-03-05", "17:00"), "actual_finish": "5pm"}]})
    assert validate_avac_dict({"shifts": []})["shifts"] == []


def test_reconcile_json_happy_path():
    body = {"payslips": [payslip_dict(page1=[OT_LINE])],
            "avacs": [{"name": "week.pdf", "data": avac_dict([ot_shift("2025-03-05", "17:00")])}]}
    r = client.post("/api/reconcile/json", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"
    assert data["avac_results"][0]["report"]["overall_status"] == "ALL_MATCH"
    assert data["payslips"] == [{"pay_date": "26.03.2025", "period_start": "", "period_end": ""}]


def test_reconcile_json_rejects_too_many_payslips():
    body = {"payslips": [payslip_dict()] * 9, "avacs": [{"name": "w.pdf", "data": avac_dict([])}]}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


def test_reconcile_json_lists_unpaid_weeks():
    body = {"payslips": [payslip_dict()],
            "avacs": [{"name": "week.pdf", "data": avac_dict([ot_shift("2025-04-02", "18:00")])}]}
    data = client.post("/api/reconcile/json", json=body).json()
    assert data["unpaid_weeks"] == [{"week_start": "31.03.2025", "avac_name": "week.pdf", "expected_total": 216.0}]


def test_run_reconciliation_pools_breaks_across_avacs():
    sunday_recall = {"line": 1, "date": None, "date_iso": "2025-03-09", "rostered_start": None, "rostered_finish": None,
                     "actual_start": "12:00", "actual_finish": "00:00", "variation_type": "Recall Onsite", "reason": "", "initials": ""}
    monday = ot_shift("2025-03-10", "20:00")
    response = main.run_reconciliation([payslip_from_dict(payslip_dict())],
                                       [("a.pdf", avac_dict([sunday_recall])), ("b.pdf", avac_dict([monday]))])
    monday_report = response["avac_results"][1]["report"]
    types = {i["pay_type"] for d in monday_report["days"] for i in d["items"]}
    assert "Fatigue_Penalty_@1.0" in types


def test_parse_endpoint_rejects_bad_kind():
    r = client.post("/api/parse", files={"file": ("x.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "photo"})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify failure** — `backend/.venv/bin/python -m pytest backend/tests/test_two_phase_api.py -q` → ImportErrors.

- [ ] **Step 3: payslip_parser** — add:

```python
import dataclasses


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _line_from(d: dict) -> AdjustmentLine:
    if not isinstance(d, dict):
        raise ValueError("line must be an object")
    return AdjustmentLine(type=str(d.get("type", ""))[:80], date=str(d.get("date", ""))[:10], units=_num(d.get("units")),
                          rate=_num(d.get("rate")), amount=_num(d.get("amount")), section=str(d.get("section", ""))[:20])


def payslip_from_dict(d: dict) -> PayslipData:
    """Rebuild a PayslipData from payslip_to_dict() output (client-supplied: validate shape and sizes)."""
    if not isinstance(d, dict):
        raise ValueError("payslip must be an object")
    emp = d.get("employee") or {}
    if not isinstance(emp, dict):
        raise ValueError("employee must be an object")
    ps = PayslipData()
    ps.employee = Employee(**{f.name: str(emp.get(f.name, ""))[:120] for f in dataclasses.fields(Employee)})
    cf = d.get("current_fortnight") or {}
    ps.current_fortnight = CurrentFortnight(period_start=str(cf.get("period_start", ""))[:10],
                                            period_end=str(cf.get("period_end", ""))[:10])
    adjustments = d.get("adjustments") or []
    page1 = d.get("page1_lines") or []
    if not isinstance(adjustments, list) or not isinstance(page1, list) or len(adjustments) > 500 or len(page1) > 200:
        raise ValueError("too many lines")
    ps.adjustments = [_line_from(a) for a in adjustments]
    ps.page1_lines = [_line_from(a) for a in page1]
    ps.covered_dates = [s for s in (d.get("covered_dates") or [])[:14] if isinstance(s, str) and DATE_RE.match(s)]
    ps.fortnights = [{"start": str(f.get("start", "")), "end": str(f.get("end", "")), "pay_date": str(f.get("pay_date", ""))}
                     for f in (d.get("fortnights") or [])[:1] if isinstance(f, dict)]
    for name in ("adjustment_subtotal_prev4", "adjustment_subtotal_older", "adjustment_total", "total_gross",
                 "net_income", "base_hourly_rate", "fortnightly_salary", "overpayment_amount"):
        setattr(ps, name, _num(d.get(name)))
    ps.is_overpayment_payslip = bool(d.get("is_overpayment_payslip"))
    ps.locality = str(d.get("locality", ""))[:40]
    return ps


def merge_payslips(payslips: list) -> PayslipData:
    """One actuals view over several uploaded payslips (deduped by pay date, ordered by pay date)."""
    def _dt(p):
        try:
            return datetime.strptime(p.employee.pay_date, "%d.%m.%Y")
        except ValueError:
            return datetime.min
    seen, ordered = set(), []
    for p in sorted(payslips, key=_dt):
        if p.employee.pay_date in seen:
            continue
        seen.add(p.employee.pay_date)
        ordered.append(p)
    latest = ordered[-1]
    merged = PayslipData(employee=latest.employee, current_fortnight=latest.current_fortnight)
    merged.locality = latest.locality
    merged.base_hourly_rate = next((p.base_hourly_rate for p in reversed(ordered) if p.base_hourly_rate), 0.0)
    merged.fortnightly_salary = latest.fortnightly_salary
    merged.is_overpayment_payslip = all(p.is_overpayment_payslip for p in ordered)
    for p in ordered:
        merged.adjustments += p.adjustments
        merged.page1_lines += p.page1_lines
        merged.covered_dates += p.covered_dates
        merged.fortnights += p.fortnights
        merged.adjustment_total += p.adjustment_total
        merged.adjustment_subtotal_prev4 += p.adjustment_subtotal_prev4
        merged.adjustment_subtotal_older += p.adjustment_subtotal_older
        merged.overpayment_amount += p.overpayment_amount
    return merged
```

- [ ] **Step 4: avac_parser** — add:

```python
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")
_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_SHIFTS = 200


def validate_avac_dict(d: dict) -> dict:
    """Shape-check a client-supplied parse_avac() dict. Money math never trusts anything else in it."""
    if not isinstance(d, dict) or not isinstance(d.get("shifts"), list):
        raise ValueError("avac must be an object with a shifts list")
    if len(d["shifts"]) > MAX_SHIFTS:
        raise ValueError(f"more than {MAX_SHIFTS} shifts")
    for s in d["shifts"]:
        if not isinstance(s, dict):
            raise ValueError("shift must be an object")
        for key in ("rostered_start", "rostered_finish", "actual_start", "actual_finish"):
            if s.get(key) not in (None, "") and not _TIME_RE.match(str(s[key])):
                raise ValueError(f"bad time in {key}")
        if s.get("date_iso") not in (None, "") and not _ISO_RE.match(str(s["date_iso"])):
            raise ValueError("bad date_iso")
        s["variation_type"] = str(s.get("variation_type") or "")[:40]
        s["reason"] = str(s.get("reason") or "")[:500]
        s.setdefault("insufficient_break", False)
    d.setdefault("employee", {})
    d.setdefault("workplace", {})
    return d
```

- [ ] **Step 5: main.py**

```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from payslip_parser import parse_payslip, page1_overtime_by_date, payslip_to_dict, payslip_from_dict, merge_payslips
from avac_parser import parse_avac, detect_breaks_across, validate_avac_dict
from rules_engine import calculate_expected, holidays_for

MAX_PAYSLIP_FILES = 8


class ParsedAvacIn(BaseModel):
    name: str = Field(max_length=200)
    data: dict


class ReconcileJsonIn(BaseModel):
    payslips: list = Field(min_length=1, max_length=MAX_PAYSLIP_FILES)
    avacs: list[ParsedAvacIn] = Field(min_length=1, max_length=MAX_AVAC_FILES)


def _unpaid_weeks(results: list) -> list:
    out = {}
    for r in results:
        report = r.get("report")
        if not report:
            continue
        for day in report["days"]:
            if day["status"] != "NOT_ON_THIS_PAYSLIP":
                continue
            dt = datetime.strptime(day["date"], "%d.%m.%Y")
            week = (dt - timedelta(days=dt.weekday())).strftime("%d.%m.%Y")
            key = (week, r["avac_name"])
            out[key] = round(out.get(key, 0.0) + day["expected_total"], 2)
    return [{"week_start": w, "avac_name": n, "expected_total": t} for (w, n), t in sorted(out.items())]


def run_reconciliation(payslips: list, avacs: list) -> dict:
    """Deterministic core shared by every endpoint. avacs = [(display name, parse_avac() dict)]."""
    if all(ps.is_overpayment_payslip and not _has_positive_ot(ps) for ps in payslips):
        return _correction_response(merge_payslips(payslips))
    ps = merge_payslips(payslips)
    detect_breaks_across([s for _, a in avacs for s in a.get("shifts", [])])
    page1_ot = page1_overtime_by_date(ps)
    results = []
    for name, avac_data in avacs:
        expected = calculate_expected(avac_data, ps.base_hourly_rate,
                                      public_holidays=holidays_for(avac_data, ps.locality), page1_ot_by_date=page1_ot)
        results.append({"avac_name": name, "report": report_to_frontend(reconcile(expected, ps))})
    return {"status": "ok", "employee": ps.employee.name, "pay_date": ps.employee.pay_date,
            "pay_period_start": ps.current_fortnight.period_start, "pay_period_end": ps.current_fortnight.period_end,
            "base_rate": ps.base_hourly_rate, "is_overpayment_payslip": ps.is_overpayment_payslip,
            "adjustment_total": ps.adjustment_total, "avac_results": results,
            "older_adjustments_total": ps.adjustment_subtotal_older,
            "payslips": [{"pay_date": p.employee.pay_date, "period_start": p.current_fortnight.period_start,
                          "period_end": p.current_fortnight.period_end} for p in payslips],
            "unpaid_weeks": _unpaid_weeks(results)}


@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...), kind: str = Form(...)):
    if kind not in ("payslip", "avac"):
        raise HTTPException(400, "kind must be 'payslip' or 'avac'.")
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds the 4 MB size limit.")
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "upload.pdf")
        with open(path, "wb") as f:
            f.write(await file.read())
        try:
            data = payslip_to_dict(parse_payslip(path)) if kind == "payslip" else parse_avac(path)
        except Exception as e:
            print(f"{kind} parse error: {e}")
            raise HTTPException(400, "Could not parse the payslip. Please check the file and try again."
                                if kind == "payslip" else "Could not process this AVAC file.")
    return {"kind": kind, "name": file.filename, "data": data}


@app.post("/api/reconcile/json")
async def reconcile_json_endpoint(body: ReconcileJsonIn):
    try:
        payslips = [payslip_from_dict(p) for p in body.payslips]
        avacs = [(a.name, validate_avac_dict(a.data)) for a in body.avacs]
    except ValueError as e:
        raise HTTPException(400, f"Invalid parsed data: {e}")
    return run_reconciliation(payslips, avacs)
```
The multipart endpoint keeps calling `run_reconciliation([ps], parsed)`.

`lib/jobs.ts`: `ReconcileResponseBase` adds `payslips?: { pay_date: string; period_start?: string; period_end?: string }[]` and `unpaid_weeks?: { week_start: string; avac_name: string; expected_total: number }[]`.

- [ ] **Step 6: Run** — all python tests; Task 0 script now runs the `multi` pairs: expected `multi` ≥ 10/13 and `real_issues=4/4`. Investigate any multi failure with `--verbose` before moving on (do not weaken the expectation; fix the engine or document a genuine data quirk in the local file's `note`).

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/payslip_parser.py backend/avac_parser.py backend/tests/test_two_phase_api.py lib/jobs.ts
git commit -m "feat(api): two-phase parse/reconcile, multi-payslip merge, pooled break detection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — parse-then-reconcile flow and multiple payslips

**Files:**
- Modify: `lib/upstream.ts`, `lib/upstream.test.ts`
- Create: `app/api/parse/route.ts`, `app/api/parse/route.test.ts`
- Modify: `app/api/reconcile/route.ts`, `app/api/reconcile/route.test.ts`
- Modify: `lib/jobs.ts`, `lib/jobs.test.ts`
- Modify: `app/(app)/check/new/page.tsx`, `app/(app)/check/new/page.test.tsx`, `app/(app)/check/new/AnalysisProgress.tsx`
- Modify: `app/(app)/check/report/[id]/report-view-model.ts` (unpaid-weeks step)
- Modify: `CLAUDE.md` product flow (3 lines)

**Interfaces:**
- Consumes: `/api/parse`, `/api/reconcile/json` (Task 6).
- Produces: `getUpstreamUrl(path?: UpstreamPath, env?)`; `startAnalyzeJob({ payslips: File[]; avacs: File[]; onProgress? })`; `MAX_PAYSLIP_FILES = 8`.

- [ ] **Step 1: Failing tests**

`lib/upstream.test.ts` add:
```ts
it('builds sibling backend paths from BACKEND_URL', () => {
  expect(getUpstreamUrl('api/parse', { BACKEND_URL: 'http://backend/' })).toBe('http://backend/api/parse')
  expect(getUpstreamUrl('api/reconcile/json', { FASTAPI_RECONCILE_URL: 'http://localhost:8000/api/reconcile' }))
    .toBe('http://localhost:8000/api/reconcile/json')
})
```
`lib/jobs.test.ts` — replace the request-flow tests with:
```ts
function mockBackend(handlers: { parse?: (kind: string, name: string) => Response; reconcile?: (body: unknown) => Response }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/parse') {
      const fd = init.body as FormData
      const file = fd.get('file') as File
      return handlers.parse?.(String(fd.get('kind')), file.name)
        ?? new Response(JSON.stringify({ kind: fd.get('kind'), name: file.name, data: { shifts: [] } }), { status: 200 })
    }
    if (url === '/api/reconcile') {
      const body = JSON.parse(String(init.body))
      return handlers.reconcile?.(body)
        ?? new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, base_rate: 60, is_overpayment_payslip: false, older_adjustments_total: 0,
            avac_results: body.avacs.map((a: { name: string }) => ({ avac_name: a.name, report: {} })) }), { status: 200 })
    }
    throw new Error(`unexpected url ${url}`)
  }))
}

it('parses every file once, then reconciles with all parsed JSON', async () => {
  mockBackend({})
  const result = await startAnalyzeJob({ payslips: [pdf('p1.pdf', 10), pdf('p2.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)] })
  const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
  expect(calls.filter((u) => u === '/api/parse')).toHaveLength(4)
  expect(calls.filter((u) => u === '/api/reconcile')).toHaveLength(1)
  expect(result.avac_results.map((r) => r.avac_name)).toEqual(['a.pdf', 'b.pdf'])
})

it('keeps a failed AVAC as an error entry and reports progress per AVAC', async () => {
  mockBackend({ parse: (kind, name) => name === 'b.pdf' ? new Response(JSON.stringify({ error: 'Could not process this AVAC file.' }), { status: 400 }) : undefined as unknown as Response })
  const events: string[] = []
  const result = await startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10), pdf('b.pdf', 10)], onProgress: (e) => events.push(`${e.avacName}:${e.state}`) })
  expect(events.sort()).toEqual(['a.pdf:done', 'b.pdf:error'])
  expect(result.avac_results).toEqual([{ avac_name: 'a.pdf', report: {} }, { avac_name: 'b.pdf', error: 'Could not process this AVAC file.' }])
})

it('throws the payslip parse error before reconciling', async () => {
  mockBackend({ parse: (kind) => kind === 'payslip' ? new Response(JSON.stringify({ error: 'Could not parse the payslip.' }), { status: 400 }) : undefined as unknown as Response })
  await expect(startAnalyzeJob({ payslips: [pdf('p.pdf', 10)], avacs: [pdf('a.pdf', 10)] })).rejects.toMatchObject({ message: 'Could not parse the payslip.' })
})

it('rejects more than 8 payslips before calling fetch', async () => {
  mockBackend({})
  await expect(startAnalyzeJob({ payslips: Array.from({ length: 9 }, (_, i) => pdf(`p${i}.pdf`, 10)), avacs: [pdf('a.pdf', 10)] }))
    .rejects.toMatchObject({ field: 'payslips' })
  expect(fetch).not.toHaveBeenCalled()
})
```
(Keep the existing `pdf()` helper and the `normalizeAnalysisJson` tests; delete the "payslip + AVAC pair over the request limit" test — pairs no longer travel together.)

`app/api/parse/route.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from './route'

function pdfFile(name = 'a.pdf', body = '%PDF-1.4 fake') {
  return new File([body], name, { type: 'application/pdf' })
}

describe('POST /api/parse', () => {
  it('rejects a non-PDF and a bad kind before contacting the backend', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const fd = new FormData()
    fd.append('file', new File(['nope'], 'a.pdf', { type: 'application/pdf' }))
    fd.append('kind', 'avac')
    expect((await POST(new Request('http://x/api/parse', { method: 'POST', body: fd }))).status).toBe(400)
    const fd2 = new FormData()
    fd2.append('file', pdfFile())
    fd2.append('kind', 'photo')
    expect((await POST(new Request('http://x/api/parse', { method: 'POST', body: fd2 }))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards to the backend and returns its JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'avac', name: 'a.pdf', data: { shifts: [] } }), { status: 200 })))
    const fd = new FormData()
    fd.append('file', pdfFile())
    fd.append('kind', 'avac')
    const res = await POST(new Request('http://x/api/parse', { method: 'POST', body: fd }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'avac', name: 'a.pdf', data: { shifts: [] } })
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/parse$/)
  })
})
```
`app/api/reconcile/route.test.ts` add:
```ts
it('forwards a JSON body to the json backend endpoint', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, avac_results: [] }), { status: 200 })))
  const res = await POST(new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payslips: [{}], avacs: [{ name: 'a.pdf', data: { shifts: [] } }] }) }))
  expect(res.status).toBe(200)
  expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/reconcile\/json$/)
})

it('rejects a JSON body over 3 MB or with too many payslips', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const big = new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(3 * 1024 * 1024 + 1) })
  expect((await POST(big)).status).toBe(413)
  const many = new Request('http://x/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payslips: Array(9).fill({}), avacs: [{ name: 'a', data: {} }] }) })
  expect((await POST(many)).status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- --run` → new tests fail (missing route file, signature mismatch).

- [ ] **Step 3: Implement**

`lib/upstream.ts`:
```ts
export type UpstreamPath = 'api/reconcile' | 'api/reconcile/json' | 'api/parse'

// BACKEND_URL is injected by the Vercel Services binding (see vercel.json).
export function getUpstreamUrl(path: UpstreamPath = 'api/reconcile', env: Record<string, string | undefined> = process.env): string {
  if (env.BACKEND_URL) {
    return new URL(path, env.BACKEND_URL.replace(/\/?$/, '/')).toString()
  }
  const legacy = env.FASTAPI_RECONCILE_URL ?? 'http://localhost:8000/api/reconcile'
  return new URL(path, legacy.replace(/api\/reconcile\/?$/, '')).toString()
}
```

`app/api/parse/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { MAX_REQUEST_BYTES } from '@/lib/jobs'
import { logger } from '@/lib/logger'
import { getUpstreamUrl } from '@/lib/upstream'

const securityHeaders = { 'X-Content-Type-Options': 'nosniff' }
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: securityHeaders })

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const kind = formData.get('kind')
    if (!(file instanceof File)) return bad('Missing file upload')
    if (kind !== 'payslip' && kind !== 'avac') return bad('kind must be payslip or avac')
    if (file.size > MAX_REQUEST_BYTES) return bad('File exceeds the 4 MB request limit.', 413)
    if ((await file.slice(0, 5).text()) !== '%PDF-') return bad(`File "${file.name}" is not a valid PDF.`)

    const outgoing = new FormData()
    outgoing.append('file', file)
    outgoing.append('kind', kind)
    const response = await fetch(getUpstreamUrl('api/parse'), { method: 'POST', body: outgoing, signal: AbortSignal.timeout(55_000) })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = (body as { detail?: unknown } | null)?.detail
      return bad(typeof detail === 'string' ? detail : 'Backend processing failed.', response.status === 400 ? 400 : 502)
    }
    const parsed = body as { kind?: unknown; name?: unknown; data?: unknown } | null
    if (!parsed || parsed.kind !== kind || typeof parsed.data !== 'object' || parsed.data === null) {
      return bad('Invalid response from analysis service.', 502)
    }
    return NextResponse.json({ kind, name: file.name, data: parsed.data }, { status: 200, headers: securityHeaders })
  } catch (error) {
    logger.error('[parse] Upstream error', { error: error instanceof Error ? error.message : String(error) })
    return bad('Analysis failed. Please try again.', 500)
  }
}
```

`app/api/reconcile/route.ts` — at the top of `POST`, before `request.formData()`:
```ts
    if (request.headers.get('content-type')?.includes('application/json')) {
      const text = await request.text()
      if (text.length > MAX_JSON_BYTES) {
        return NextResponse.json({ error: 'Parsed data exceeds the 3 MB request limit.' }, { status: 413, headers: securityHeaders })
      }
      let body: { payslips?: unknown; avacs?: unknown }
      try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: securityHeaders }) }
      if (!Array.isArray(body.payslips) || body.payslips.length === 0 || body.payslips.length > MAX_PAYSLIP_FILES
        || !Array.isArray(body.avacs) || body.avacs.length === 0 || body.avacs.length > MAX_AVAC_FILES) {
        return NextResponse.json({ error: `Send 1–${MAX_PAYSLIP_FILES} payslips and 1–${MAX_AVAC_FILES} AVACs.` }, { status: 400, headers: securityHeaders })
      }
      const response = await fetch(getUpstreamUrl('api/reconcile/json'), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: text, signal: AbortSignal.timeout(55_000),
      })
      return await relayUpstream(response)
    }
```
with `const MAX_JSON_BYTES = 3 * 1024 * 1024` and `import { MAX_PAYSLIP_FILES, MAX_REQUEST_BYTES, normalizeAnalysisJson } from '@/lib/jobs'`. Extract the existing "Upstream response validation" section (from `if (!response.ok)` to the final `NextResponse.json(validated…)`) into `async function relayUpstream(response: Response)` and call it from both branches.

`lib/jobs.ts`:
```ts
export const MAX_PAYSLIP_FILES = 8
export const MAX_AVAC_FILES = 10

interface ParsedUpload { kind: 'payslip' | 'avac'; name: string; data: unknown }

interface StartAnalyzeJobParams {
  payslips: File[]
  avacs: File[]
  /** Called once per AVAC as its parse settles, in completion order. */
  onProgress?: (event: AnalyzeProgressEvent) => void
}

function validateFiles(payslips: File[], avacs: File[]): JobError | null {
  if (payslips.length === 0) return { field: 'payslips', message: 'At least one payslip is required' }
  if (payslips.length > MAX_PAYSLIP_FILES) return { field: 'payslips', message: `Maximum ${MAX_PAYSLIP_FILES} payslips allowed` }
  if (avacs.length === 0) return { field: 'avacs', message: 'At least one AVAC form is required' }
  if (avacs.length > MAX_AVAC_FILES) return { field: 'avacs', message: `Maximum ${MAX_AVAC_FILES} AVAC forms allowed` }
  for (const [i, file] of payslips.entries()) {
    const err = validatePdfFile(file, `payslip-${i + 1}`)
    if (err) return err
  }
  for (const [i, file] of avacs.entries()) {
    const err = validatePdfFile(file, `avac-${i + 1}`)
    if (err) return err
  }
  return null
}

async function postAndParse(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw { message: 'Failed to reach the analysis service. Please try again later.' } satisfies JobError
  }
  const payload = parseJsonSafely(await response.text())
  if (!response.ok) throw { message: getErrorMessage(payload, 'Failed to analyze documents.') } satisfies JobError
  return payload
}

async function parseOne(file: File, kind: 'payslip' | 'avac'): Promise<ParsedUpload> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', kind)
  const payload = await postAndParse('/api/parse', { method: 'POST', body: formData })
  if (!isRecord(payload) || payload.kind !== kind || !isRecord(payload.data)) {
    throw { message: 'Backend returned an invalid response format.' } satisfies JobError
  }
  return { kind, name: file.name, data: payload.data }
}

// Phase 1 parses each PDF alone (one PDF per request keeps us under Vercel's body limit);
// phase 2 reconciles all parsed JSON in one call so fatigue breaks and page-1 payments are seen across files.
export async function startAnalyzeJob(params: StartAnalyzeJobParams): Promise<AnalysisJson> {
  const validationError = validateFiles(params.payslips, params.avacs)
  if (validationError) throw validationError

  const total = params.avacs.length
  let completed = 0
  const report = (avac: File, index: number, state: 'done' | 'error', message?: string) => {
    completed += 1
    try { params.onProgress?.({ avacName: avac.name, index, state, message, completed, total }) } catch { /* never fail the analysis */ }
  }

  const [payslips, avacOutcomes] = await Promise.all([
    Promise.all(params.payslips.map((file) => parseOne(file, 'payslip'))),
    Promise.all(params.avacs.map((avac, index) => parseOne(avac, 'avac').then(
      (parsed) => { report(avac, index, 'done'); return { avac, parsed, error: null } },
      (error: JobError) => { report(avac, index, 'error', error.message); return { avac, parsed: null, error } },
    ))),
  ])

  const parsedAvacs = avacOutcomes.filter((o) => o.parsed)
  if (parsedAvacs.length === 0) throw avacOutcomes[0].error

  const payload = await postAndParse('/api/reconcile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payslips: payslips.map((p) => p.data), avacs: parsedAvacs.map((o) => ({ name: o.avac.name, data: o.parsed!.data })) }),
  })
  const normalized = normalizeAnalysisJson(payload)
  if (!normalized) throw { message: 'Backend returned an invalid response format.' } satisfies JobError
  if (normalized.status === 'correction_payslip') return normalized

  const byName = new Map(normalized.avac_results.map((r) => [r.avac_name, r]))
  return {
    ...normalized,
    avac_results: avacOutcomes.map((o) => o.parsed
      ? (byName.get(o.avac.name) ?? { avac_name: o.avac.name, error: 'No report returned.' })
      : { avac_name: o.avac.name, error: o.error.message }),
  }
}
```
Delete `reconcileOne` and the pair-size check.

`app/(app)/check/new/page.tsx`: state `payslipFile: File | null` → `payslipFiles: File[]`; action `set_payslips: { files: File[] }`; the payslip dropzone gets `multiple: true, maxFiles: MAX_PAYSLIP_FILES` and `onDrop` dispatches `set_payslips` with `[...state.payslipFiles, ...accepted].slice(0, MAX_PAYSLIP_FILES)`; `canAnalyze = payslipFiles.length > 0 && avacFiles.length > 0`; `handleAnalyze` passes `payslips: state.payslipFiles`; card copy: title "Payslips", hint "Upload the payslip that paid your adjustments **and** the payslip for the fortnight the AVAC covers — page 1 of that one shows rostered overtime.", helper "PDF · 1–8 files"; `fileLabel` = one name or `${n} payslips`; phase message "Upload at least 1 payslip and 1 AVAC to continue."; pass `payslipName={payslipLabel}` to `AnalysisProgress` (no change needed inside it). Update `page.test.tsx` expectations for the new copy.

`report-view-model.ts` `buildNextSteps`: after the NOT_ON_THIS_PAYSLIP step add
```ts
  if (unpaidWeeks.length > 0) {
    const total = unpaidWeeks.reduce((sum, w) => sum + toSafeNumber(w.expected_total), 0)
    steps.push(`${formatCount(unpaidWeeks.length, 'AVAC week is', 'AVAC weeks are')} not on any uploaded payslip (about ${formatCurrency(total)} expected). If a week is older than 10 weeks, ask payroll whether that AVAC was received.`)
  }
```
threading `analysis.unpaid_weeks ?? []` in.

`CLAUDE.md` product flow: step 3 "Users upload one or more payslip PDFs (1–8) and one or more AVAC PDFs (1–10)."; step 4 "The app parses each PDF via `/api/parse` (one file per request), then posts the parsed JSON to `/api/reconcile` and renders `/check/report/[id]`."

- [ ] **Step 4: Run** — `npm run test -- --run && npm run lint`; start `backend/.venv/bin/uvicorn main:app --app-dir backend --port 8000` and `npm run dev`, upload a synthetic or real pair locally, confirm the report renders and the progress panel still ticks per AVAC.

- [ ] **Step 5: Commit**

```bash
git add lib/upstream.ts lib/upstream.test.ts lib/jobs.ts lib/jobs.test.ts app/api/parse app/api/reconcile "app/(app)/check/new" "app/(app)/check/report/[id]/report-view-model.ts" CLAUDE.md
git commit -m "feat(check): parse-then-reconcile upload flow with several payslips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Non-XFA AVACs, specific errors, surfaced warnings

**Files:**
- Modify: `backend/avac_parser.py` (`AvacFormatError`, `_has_xfa`, `_parse_printed_avac`, `_assemble_result`, `parse_avac`)
- Modify: `backend/main.py` (error mapping in both endpoints; `report_to_frontend(report, warnings)`)
- Modify: `lib/jobs.ts` (`AvacReport.warnings?: string[]`), `app/(app)/check/report/[id]/_components/ReportPerAvacDetails.tsx` (render warnings)
- Create: `backend/tests/test_avac_fallbacks.py`

**Interfaces:**
- Produces: `avac_parser.AvacFormatError(ValueError)` with `.user_message`; `FLATTENED_MSG`, `UNREADABLE_MSG`; `parse_avac` returns the same dict shape for printed AVACs (`source_block == "printed"`); `report_to_frontend(report, warnings: list[str] = ())` adds `"warnings"`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_avac_fallbacks.py`:

```python
import sys
from pathlib import Path

import pikepdf
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from avac_parser import AvacFormatError, FLATTENED_MSG, parse_avac
from payslip_parser import PayslipData, Employee

HELVETICA = pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica)


def text_pdf(path, lines):
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=HELVETICA))
    body = " ".join(f"({l}) Tj T*" for l in lines)
    page.Contents = pdf.make_stream(f"BT /F1 9 Tf 12 TL 30 800 Td {body} ET".encode("latin-1"))
    pdf.save(path)
    return pdf


def test_printed_static_avac_is_parsed(tmp_path):
    path = tmp_path / "printed.pdf"
    text_pdf(path, [
        "Attendance Variation and Allowance Claim",
        "1 Alex Sample L6 10/03/2025 07:30 15:36 07:30 18:30 Overtime ward round AS",
        "2 Alex Sample L6 11/03/2025 20:30 00:00 Recall Onsite deteriorating patient AS",
        "3 Alex Sample L6 12/03/2025 07:30 15:36 07:30 17:00 Overtime *Fatigue pay* AS",
    ])
    result = parse_avac(str(path))
    s = result["shifts"]
    assert [(x["date_iso"], x["rostered_start"], x["actual_start"], x["actual_finish"], x["variation_type"]) for x in s] == [
        ("2025-03-10", "07:30", "07:30", "18:30", "Overtime"),
        ("2025-03-11", None, "20:30", "00:00", "Recall Onsite"),
        ("2025-03-12", "07:30", "07:30", "17:00", "Overtime")]
    assert s[2]["insufficient_break"] is True and s[2]["initials"] == "AS" and "Fatigue" in s[2]["reason"]
    assert result["summary"]["shift_count"] == 3


def test_flattened_dynamic_xfa_gives_specific_error(tmp_path):
    path = tmp_path / "flat.pdf"
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=HELVETICA))
    page.Contents = pdf.make_stream(b"BT /F1 12 Tf 30 800 Td (Please wait... If this message is not eventually replaced) Tj ET")
    pdf.Root.AcroForm = pikepdf.Dictionary(Fields=pikepdf.Array(), XFA=pikepdf.Array([
        pikepdf.String("datasets"), pdf.make_stream(b"<xfa:datasets><xfa:data/></xfa:datasets>"),
        pikepdf.String("form"), pdf.make_stream(b"<subform/>")]))
    pdf.save(path)
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert exc.value.user_message == FLATTENED_MSG


def test_unrelated_pdf_gives_unreadable_error(tmp_path):
    path = tmp_path / "other.pdf"
    text_pdf(path, ["Just a letter"])
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert "does not look like an AVAC" in exc.value.user_message


def test_unknown_variation_type_warning_reaches_report():
    ps = PayslipData(employee=Employee(name="Dr", pay_date="26.03.2025"))
    ps.base_hourly_rate = 60.0
    avac = {"employee": {}, "workplace": {}, "shifts": [{"line": 1, "date_iso": "2025-03-05", "rostered_start": None, "rostered_finish": None,
             "actual_start": "18:00", "actual_finish": "20:00", "variation_type": "Unknown", "reason": "", "initials": ""}]}
    response = main.run_reconciliation([ps], [("a.pdf", avac)])
    assert response["avac_results"][0]["report"]["warnings"] == ["Unknown type on 05.03.2025: Unknown"]
```

- [ ] **Step 2: Run to verify failure** — `backend/.venv/bin/python -m pytest backend/tests/test_avac_fallbacks.py -q` → ImportError `AvacFormatError`.

- [ ] **Step 3: avac_parser**

```python
class AvacFormatError(ValueError):
    """A recognisable AVAC problem with a message safe to show the user."""
    def __init__(self, user_message: str):
        super().__init__(user_message)
        self.user_message = user_message


FLATTENED_MSG = ("This AVAC was saved without its form data (it only shows a 'Please wait…' page). "
                 "Open it in Adobe Acrobat or Reader, use File > Save As, and upload that copy.")
UNREADABLE_MSG = ("This file does not look like an AVAC form. Upload the AVAC PDF downloaded from the QH form "
                  "(not a photo or scan).")

_PRINTED_ROW = re.compile(
    r"^(?P<line>\d{1,2})\s+(?P<name>[A-Za-z][A-Za-z .'\-]+?)\s+(?P<level>L\d+)\s+(?P<date>\d{2}/\d{2}/\d{4})\s+"
    r"(?P<times>(?:\d{2}:\d{2}\s+){2,4})"
    r"(?P<type>Overtime|Recall Onsite|Recall Offsite|On Call|Shift Change)\b\s*(?P<rest>.*)$")


def _has_xfa(pdf_path: str) -> bool:
    with pikepdf.open(pdf_path) as pdf:
        af = pdf.Root.get("/AcroForm")
        return af is not None and "/XFA" in af


def _parse_printed_avac(pdf_path: str) -> list:
    """Static AVAC printed to PDF: one text line per row —
    'N <name> L6 dd/mm/yyyy [rs rf] as af <Type> <comment> <initials>'; wrapped comments follow on the next line."""
    import pdfplumber
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            last_row_idx = -2
            for idx, raw in enumerate((page.extract_text() or "").splitlines()):
                text = raw.strip()
                m = _PRINTED_ROW.match(text)
                if not m:
                    if rows and idx == last_row_idx + 1 and text and not text[0].isdigit():
                        rows[-1].reason = f"{rows[-1].reason} {text}".strip()
                        last_row_idx = idx
                    continue
                last_row_idx = idx
                times = m.group("times").split()
                rs, rf = (times[0], times[1]) if len(times) == 4 else (None, None)
                as_, af = times[-2], times[-1]
                rest = m.group("rest").strip()
                initials = ""
                mi = re.search(r"(?:^|\s)([A-Z]{1,3})$", rest)
                if mi:
                    initials = mi.group(1)
                    rest = rest[: mi.start()].strip()
                date_str = m.group("date")
                vtype = m.group("type")
                rows.append(ShiftEntry(
                    line=int(m.group("line")), date=date_str, date_iso=_to_iso(date_str), personnel_number=None,
                    employee_name=m.group("name").strip(), pay_level=m.group("level"),
                    rostered_start=rs, rostered_finish=rf, actual_start=as_, actual_finish=af,
                    variation_type=vtype, reason=rest, initials=initials,
                    overtime_minutes=_calc_overtime(rs, rf, as_, af, vtype), source_block="printed"))
    for r in rows:
        if r.rostered_start and r.rostered_finish and FATIGUE_MARKER.search(r.reason):
            r.insufficient_break = True
    _detect_insufficient_breaks(rows)
    return rows
```
Move steps 7–8 of today's `parse_avac` (employee info + summaries + result dict) into `_assemble_result(shifts, emp_name, emp_num, emp_level, location, department, org_unit, service_line) -> dict`. New `parse_avac`:
```python
def parse_avac(pdf_path: str) -> dict:
    if not _has_xfa(pdf_path):
        shifts = _parse_printed_avac(pdf_path)
        if not shifts:
            raise AvacFormatError(UNREADABLE_MSG)
        first = shifts[0]
        return _assemble_result(shifts, first.employee_name or "", "", first.pay_level or "", "", "", "", "")
    parts = _extract_xfa_parts(pdf_path)
    if "datasets" not in parts or "form" not in parts:
        raise AvacFormatError(UNREADABLE_MSG)
    ... (steps 2–6 unchanged) ...
    if not shifts:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            first_text = (pdf.pages[0].extract_text() or "").lower()
        raise AvacFormatError(FLATTENED_MSG if "please wait" in first_text else UNREADABLE_MSG)
    return _assemble_result(shifts, emp_name, emp_num, emp_level, location, department, org_unit, service_line)
```

- [ ] **Step 4: main.py** — both AVAC `except` sites:
```python
            except AvacFormatError as e:
                error = e.user_message
            except Exception as e:
                print(f"AVAC parse error: {e}")
                error = "Could not process this AVAC file."
```
(`/api/parse` raises `HTTPException(400, error)`; the multipart endpoint stores it in the error entry.) `report_to_frontend(report, warnings=())` adds `"warnings": list(warnings)`; `run_reconciliation` passes `warnings=expected.warnings`.

Frontend: `AvacReport.warnings?: string[]`; in `ReportPerAvacDetails.tsx`, under the AVAC header, when `summary.report?.warnings?.length`:
```tsx
<ul className="mt-2 space-y-1 text-xs text-amber-800" aria-label="Parsing warnings">
  {summary.report.warnings.map((w) => <li key={w}>Skipped: {w}</li>)}
</ul>
```

- [ ] **Step 5: Run** — all python tests, `npm run test -- --run`, Task 0 script (no change expected in scores).

- [ ] **Step 6: Commit**

```bash
git add backend/avac_parser.py backend/main.py backend/tests/test_avac_fallbacks.py lib/jobs.ts "app/(app)/check/report/[id]/_components/ReportPerAvacDetails.tsx"
git commit -m "feat(avac): printed-AVAC fallback, specific flattened-form error, surfaced engine warnings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Gates and target scoreboard

Run after every task (numbers only go in this table — never file names or amounts):

| After task | python tests | vitest | `single` | `multi` | `fp` | `real_issues` |
|---|---|---|---|---|---|---|
| 0 (baseline) | green | green | 6/18 | skip | 1/5 | 0/4 |
| 1 page 1 | green | green | ≥ +1 | skip | ≥ | ≥ |
| 2 fatigue | green | green | ≥ +2 | skip | ≥ | 2/4 |
| 3 headline | green | green | ≥ +5 | skip | ≥ | 3/4 |
| 4 evidence | green | green | 18/18 | skip | 5/5 | 3/4 |
| 5 rules | green | green | 18/18 | skip | 5/5 | 3/4 |
| 6 two-phase | green | green | 18/18 | ≥ 12/13 | 5/5 | **4/4** |
| 7 frontend | green | green | 18/18 | ≥ 12/13 | 5/5 | 4/4 |
| 8 fallbacks | green | green | 18/18 | 13/13 | 5/5 | 4/4 |

A task that lowers any number is not done. Target end state, stated as numbers on the doctor's data:

- **Single-payslip mode:** 18/18 pairs match their expected verdict — 14 exact headlines and 4 neutral days (`NEEDS_FORTNIGHT_PAYSLIP`) where the truth is "paid on a payslip not uploaded"; **0 false positives** (no actionable line on a day the review verified as correctly paid; all 5 false-positive guard pairs pass).
- **All-payslips mode:** 13/13 multi pairs pass, i.e. every previously wrong headline is exactly right, the week paid entirely on page 1 is ALL_MATCH, and all 4 real pay problems (A–D) are surfaced with one amount each; the unpaid weeks are listed in `unpaid_weeks`.
- Every `ALL_MATCH` report shows `total_difference == 0.00`; informational excess appears only in `informational_difference`.

## Self-review notes

- Spec coverage: findings 1–7 map to Tasks 1, 2, 3(+6 junk rows), 4, 5, 3, 8; real problems A–D are covered by the expectations file and the `real_issues` counter; recommendation 5(c) (lone offsite recall rescue) is deliberately skipped — the existing consolidation already fires when the payslip pays offsite as onsite + guarantee (three mismatches on the day), and no dataset case exercises the remaining gap.
- Type consistency: `run_reconciliation(payslips: list, avacs: list[tuple[str, dict]])` is introduced in Task 1 and only extended later; `page1_ot_by_date` is a `dict[str, float]` keyed `dd.mm.yyyy` everywhere; `PENDING_STATUSES` is defined in Task 3 and redefined in Task 4; `report_to_frontend(report, warnings=())` gains its second parameter only in Task 8.
- Semantic change to `total_difference`/`day.difference` is documented in `lib/jobs.ts` (Task 3) and consumed unchanged by `ReportActionQueue` (already sums row-level differences).
