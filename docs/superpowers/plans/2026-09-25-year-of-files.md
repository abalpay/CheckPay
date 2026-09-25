# A Year of Files in One Go — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doctor drops a whole year of pay documents (26 payslips + up to 60 AVACs, or the folder they live in, junk included) into one dropzone and gets one readable report, without tripping the rate limiter or the request-size limits.

**Architecture:** Five independently shippable changes on the existing two-phase flow. (1) Backend caps rise to a year and `/api/parse` learns `kind=auto`: it classifies the PDF from signals the parsers already use (XFA AcroForm ⇒ AVAC; SAP header cells ⇒ payslip; printed-AVAC text ⇒ AVAC) and answers `kind: "unknown"` for anything else. (2) Rate limiting counts analyses, not requests: `proxy.ts` gets per-path buckets (`/api/parse` 200 per 10 min, `/api/reconcile` 6 per 10 min, everything else 60/min) and the browser sends parses through a 6-wide pool. (3) The upload page becomes one dropzone plus a folder chooser; every dropped file is digested (SHA-256, to skip byte-identical re-uploads), classified and parsed **as it is dropped**, so the file list shows live kind badges, counts against the limits, and calm skip notes; "Analyse" is then a single reconcile call. (4) The report groups by calendar month wherever a year would otherwise be one endless list. (5) A Playwright gate drops the entire private folder through the real UI and records counts and time; committed screenshots come from a mocked synthetic year only.

**Tech Stack:** Next.js 16 App Router + React 19 + Vitest/RTL (frontend); FastAPI + pdfplumber + pikepdf + pytest (backend, private Vercel Service); Python Playwright 1.58 via `uv run --with playwright` for the gate (already installed globally with Chromium; not an npm dependency).

**Spec:** The owner-approved scope in the dispatch message (four items + constraints), reproduced in **Background** below with the measurements that size every number. No separate spec file exists; this plan is the spec's home.

---

## Background (what the numbers are built on)

Measured on the owner's private data (never committed): parsed AVAC JSON ≈ 3 KB (max 5 KB) vs ≈ 890 KB PDF (largest 941 KB); parsed payslip JSON ≈ 4 KB (max 10 KB); a full year's reconcile body (26 + 52) ≈ 490 KB; backend work ≈ 0.2 s per parse. The private folder holds 16 payslips + 23 AVACs at top level, plus a subfolder with 8 byte-identical AVAC copies (one under a different name), 1 extra payslip, 8 PNG screenshots and 2 `.DS_Store` files: 48 PDFs, 58 files.

Classifier probe (read-only, run 2026-09-25 with the exact rules in Task 1): 48/48 correct. Every payslip's first page contains `Pay Date`, `Employee Name`, `Person ID` and `PAN`; every AVAC is an XFA form (22 dynamic ones whose text layer is only "Please wait…", 9 static ones whose text contains "Attendance Variation" and, for 8 of them, a printed shift row).

Today's flow (`lib/jobs.ts` `startAnalyzeJob`): all parses fire at once at Analyse time; `proxy.ts` allows 60 requests/min per IP, so a year (≤ 87 requests) is refused after the 60th parse.

## Design decisions

### D1 — Classify and parse on drop, reconcile on Analyse

The scope wants per-file kind badges and per-kind counts in the file list *before* Analyse. The kind is only knowable server-side (dynamic AVACs have no usable text layer), and the only request that can tell us is `/api/parse`. Sending a file twice (once to classify, once to parse) would double the year's upload (≈ 45 MB) for nothing, so each file is parsed once, **as it is dropped**, through a 6-wide pool; its parsed JSON (a few KB) is kept in page state. "Analyse" then sends the one JSON reconcile call. Honest progress is preserved: each row flips from "Reading…" to its kind as its own request settles, and the analysis panel shows the single compare step as indeterminate (which it is).

Consequences: a file that fails to parse is shown with its message in the list at drop time and excluded from the run (the old "it will be noted in your report" path goes away for this flow; the report's `error` entries remain for engine-side failures). Payslip parse failures no longer abort the run.

### D2 — Rate-limit analyses, not requests

One year = 26 + 60 = 86 parses + 1 reconcile. Buckets per IP, sliding window:

| Path | Limit | Why |
|---|---|---|
| `/api/parse` | 200 / 10 min | Two full years (a page reload re-parses). Abuse ceiling 200 × 4 MB = 800 MB per 10 min, **below today's** 60/min × 4 MB = 2.4 GB per 10 min. |
| `/api/reconcile` | 6 / 10 min | The expensive call (≈ 0.2 s × 60 AVACs of engine time). Six lets a doctor add a forgotten payslip and re-run several times. |
| other `/api/*` | 60 / min | Unchanged default for anything added later. |

Client pool of 6: a browser's per-host HTTP/1.1 connection budget, and at most ≈ 6 × 0.2 s of backend time in flight per user. 86 files at ≈ 1 s each (upload-bound on a home connection) finish in ≈ 15 s wall time.

State stays in memory per instance (scope requirement). The ceiling is stated in a `ponytail:` comment with the upgrade path (Vercel Firewall rate-limit rule).

### D3 — Classification signals (all deterministic, all already in the parsers)

Order matters: XFA first, because a dynamic AVAC's text is only the placeholder.

1. `has_xfa(pdf)` (pikepdf: `/AcroForm` with `/XFA`) ⇒ **avac**.
2. First-page text contains `Pay Date` **and** (`Employee Name` **or** `Person ID`) ⇒ **payslip** (the same cells `parse_page1` reads).
3. First-page text contains `attendance variation`, or `please wait` (a flattened dynamic AVAC — still an AVAC, so `parse_avac` can say how to fix it), or a line matching `_PRINTED_ROW` ⇒ **avac**.
4. Otherwise ⇒ **unknown** (HTTP 200, `{"kind": "unknown", "data": null}`; the client shows "Skipped — not a payslip or AVAC"). A PDF that is not even openable is also unknown.

### D4 — Month grouping in the report

One helper, `groupByMonth(items, dateOf)`, buckets by the calendar month of a `dd.mm.yyyy` date, oldest month first, undated last. Used by "Raise with payroll" (rows by AVAC date; month subtotal), "Check your other payslips" (unpaid weeks by week start; dates to verify by date), "By AVAC file" (each AVAC by its first day; unreadable files in a trailing group) and the print summary (a month header row per group). Headings appear only when there is more than one group, so single-fortnight reports look exactly as they do today.

### D5 — The gate

Python Playwright (already installed at `/opt/homebrew/bin/playwright`, Chromium cached; run through `uv run --with playwright==1.58.0` so nothing is added to `package.json`). Folder drag-and-drop cannot be synthesised from real files, so the gate uses the page's folder chooser (`<input webkitdirectory>`), which Playwright can point at a directory and which traverses subfolders exactly as a dropped folder does. Real mode asserts counts and prints timings only; mock mode routes `/api/parse` and `/api/reconcile` to a synthetic 26-payslip / 52-AVAC year and writes the committed screenshots.

## Product decisions (recommended default in bold)

| # | Decision | Default |
|---|---|---|
| P1 | Parse on drop (D1) vs parse on Analyse with a separate classify request? | **Parse on drop.** One upload per file; badges and counts are live before Analyse. |
| P2 | Byte-identical duplicates (the private folder has 8)? | **Skip the later copy** with "Skipped — same file as X"; removing the first lets the copy be re-added. |
| P3 | More payslips/AVACs than the cap after classification? | **Analyse disabled** with "Too many payslips (27 of 26). Remove some to continue." — nothing is silently dropped. |
| P4 | Files that could not be read? | **Listed with the message and excluded**; the status line says how many. No report section needed. |
| P5 | Per-drop ceiling? | **150 files per drop** (a year is ≈ 80 valid files; more is a home folder by mistake). Non-PDFs never leave the browser. |
| P6 | Show all 52 AVAC accordions? | **Yes, grouped by month.** A "files with issues only" filter is a follow-up. |

Follow-ups noted, not done: client-side XFA extraction with pdf-lib (would remove the upload of 900 KB per AVAC); Vercel Firewall rate-limit rule; "issues only" filter in the breakdown.

## Global Constraints

- Deterministic engine; **no change to money math**. After every task that touches `backend/`: `CHECKPAY_REAL_DATA="/Users/ahmet/Desktop/Desktop/CheckPay (payslips + AVAC)" backend/.venv/bin/python backend/scripts/real_data_regression.py` must print `single=18/18 multi=13/13 fp=5/5 real_issues=4/4` (private data, local only; prints SKIP when the env var is unset).
- Caps: `MAX_PAYSLIP_FILES = 26`, `MAX_AVAC_FILES = 60` in **both** `backend/main.py` and `lib/jobs.ts`; every piece of copy that says 8 or 10 changes with them (`grep -rn "Up to 10\|10 AVAC\|8 payslip\|1–8\|1–10" --include='*.ts' --include='*.tsx' --include='*.md' .` must come back empty outside `docs/superpowers/plans`).
- Every request carries ≤ 1 PDF (≤ 4 MB, `MAX_REQUEST_BYTES`) or JSON ≤ 3 MB (`MAX_JSON_BYTES` / `MAX_JSON_BODY`). Worst-case year body is 26 × 10 KB + 60 × 5 KB = 560 KB, ≈ 5× under the cap, so the cap does not move. Shift caps stay: 200 shifts per AVAC (`MAX_SHIFTS`), 500 adjustments / 200 page-1 lines per payslip; worst case 12 000 shifts per run is well within the engine's cost.
- No new npm dependencies. No new pip runtime dependencies. Playwright runs from the global install via `uv run --with playwright==1.58.0`.
- Design language: `--cp-*` tokens, `cp-display` (DM Serif) headings, status = icon **and** label, never colour alone; layouts must work at 390 px; print summary stays coherent.
- Accessibility: file list and every remove button keyboard-reachable; status changes announced through the existing `aria-live="polite"` status message; focus management on the analysis panel and error alert kept.
- Never commit real data: no real names, IDs, filenames, dates-with-amounts or dollar figures. Committed screenshots come from the mocked synthetic year only.
- Commands: frontend `npm run test -- --run`, `npm run lint`, `npx tsc --noEmit`; backend `backend/.venv/bin/python -m pytest backend/tests -q`.
- A cleanup PR (removes the legacy multipart reconcile endpoint, moves lint to `eslint.config.mjs`) is in flight on `main`. **Rebase onto `main` after it merges before starting Task 1.** This plan targets the two-phase flow only; if `backend/main.py` still has a multipart `/api/reconcile` when you start, stop and rebase.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **A folder full of photos** (hundreds of PNGs, `.DS_Store`, one PDF): non-PDFs must be skipped in the browser with no network request and no freeze; more than 150 files must refuse the whole drop with a clear message. Pinned in Task 3 (`skips non-PDFs locally without a parse request`, `refuses a drop of more than 150 files`).
2. **The same PDF under two names** (8 in the real folder): the second copy must be skipped, never uploaded, and become addable again once the first is removed. Pinned in Task 3 (`skips a byte-identical file and frees it when the original is removed`).
3. **A flattened "Please wait…" AVAC**: must show as "Couldn't read" with the fix-it message, not as "not a payslip or AVAC". Pinned in Task 1 (`test_looks_like_printed_avac_signals`, `test_parse_auto_reports_an_unreadable_avac_instead_of_skipping_it`).
4. **A 429 in the middle of a folder**: that file shows the error, every other file keeps reading, and Analyse stays available with the readable ones. Pinned in Task 3 (`keeps reading the other files when one parse fails`).
5. **Same month, different years** (Dec 2024 and Dec 2025) in one report: must be two groups, oldest first. Pinned in Task 4 (`groupByMonth` ordering test).

---

## File structure

| File | Responsibility |
|---|---|
| `backend/main.py` | caps; `detect_kind`; `/api/parse` accepts `kind=auto` |
| `backend/avac_parser.py` | `has_xfa` (public), `looks_like_printed_avac` |
| `backend/payslip_parser.py` | `looks_like_payslip` |
| `backend/tests/test_two_phase_api.py` | cap and classification tests |
| `lib/rate-limit.ts` (new) | sliding-window counter, in-memory, with the `ponytail:` ceiling note |
| `proxy.ts` | per-path buckets using `lib/rate-limit` |
| `proxy.test.ts` (new), `lib/rate-limit.test.ts` (new) | limit behaviour |
| `app/api/parse/route.ts` | relays `kind=auto` and the detected kind |
| `lib/jobs.ts` | caps; `parseUpload`, `withParseSlot`, `fileDigest`; `startAnalyzeJob` over parsed uploads |
| `app/(app)/check/new/upload-state.ts` (new) | reducer, item types, local skip rules, counts, status copy, `canAnalyze` |
| `app/(app)/check/new/FileList.tsx` (new) | accessible file list with kind badges and remove buttons |
| `app/(app)/check/new/AnalysisProgress.tsx` | one-step compare panel (indeterminate) |
| `app/(app)/check/new/page.tsx` | one dropzone + folder chooser, wiring |
| `app/(app)/check/report/[id]/report-formatters.ts` | `isoDateOf`, `formatMonthLabel`, `groupByMonth` |
| `app/(app)/check/report/[id]/_components/ReportActionQueue.tsx`, `ReportPerAvacDetails.tsx`, `PrintSummaryDocument.tsx` | month grouping |
| `app/globals.css` | print month-row style |
| `e2e/year_of_files.py` (new) | the gate (real folder) and the screenshot run (mock) |
| `TESTING.md`, `CLAUDE.md`, `README.md`, `lib/faq-data.ts` | copy and commands |

---

### Task 1: Backend — caps to a year and `kind=auto` classification

**Files:**
- Modify: `backend/main.py:20-23` (caps), `:200-222` (`/api/parse`), add `detect_kind`
- Modify: `backend/avac_parser.py:124-127` (`_has_xfa` → `has_xfa`, two call sites at `:721` and inside `_extract_xfa_parts` callers), add `looks_like_printed_avac` after `_flattened_or_unreadable`
- Modify: `backend/payslip_parser.py` add `looks_like_payslip` before `parse_payslip`
- Test: `backend/tests/test_two_phase_api.py`

**Interfaces:**
- Consumes: `avac_parser._has_xfa`, `avac_parser._PRINTED_ROW`, `parse_payslip`, `parse_avac` (unchanged).
- Produces:
  - `MAX_PAYSLIP_FILES = 26`, `MAX_AVAC_FILES = 60` (module constants in `backend/main.py`).
  - `avac_parser.has_xfa(pdf_path: str) -> bool`; `avac_parser.looks_like_printed_avac(first_page_text: str) -> bool`.
  - `payslip_parser.looks_like_payslip(first_page_text: str) -> bool`.
  - `main.detect_kind(pdf_path: str) -> str | None` returning `"payslip" | "avac" | None`.
  - `POST /api/parse` form field `kind` ∈ `payslip | avac | auto` (default `auto`). With `auto`, the response is `{"kind": "payslip"|"avac", "name", "data": {...}}` or `{"kind": "unknown", "name", "data": null}` (HTTP 200). Parse failures of a recognised kind stay HTTP 400 with the existing `detail` messages.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_two_phase_api.py` (imports at the top: add `from avac_parser import looks_like_printed_avac` and `from payslip_parser import looks_like_payslip`; `main` is already imported):

```python
def test_reconcile_json_accepts_a_full_year():
    body = {"payslips": [payslip_dict()] * main.MAX_PAYSLIP_FILES,
            "avacs": [{"name": f"w{i}.pdf", "data": avac_dict([])} for i in range(main.MAX_AVAC_FILES)]}
    assert main.MAX_PAYSLIP_FILES == 26 and main.MAX_AVAC_FILES == 60
    assert client.post("/api/reconcile/json", json=body).status_code == 200


def test_looks_like_payslip_needs_the_sap_header_cells():
    assert looks_like_payslip("Employer Name Queensland Health\nPay Date 26.03.2025\nEmployee Name Dr Test\nPerson ID 1")
    assert looks_like_payslip("Pay Date 26.03.2025 Person ID 1")
    assert not looks_like_payslip("Pay Date 26.03.2025")  # a date alone is not a payslip
    assert not looks_like_payslip("Attendance Variation and Allowance Claim\nEmployee Name Dr Test")


def test_looks_like_printed_avac_signals():
    assert looks_like_printed_avac("Attendance Variation and Allowance Claim (AVAC)")
    assert looks_like_printed_avac("1 Dr Test L6 05/03/2025 07:30 16:00 07:30 18:00 Overtime late finish DT")
    assert looks_like_printed_avac("Please wait... If this message is not eventually replaced by the proper contents")
    assert not looks_like_printed_avac("Pay Date 26.03.2025 Employee Name Dr Test")
    assert not looks_like_printed_avac("")


def test_detect_kind_returns_none_for_a_file_that_is_not_a_pdf(tmp_path):
    p = tmp_path / "x.pdf"
    p.write_bytes(b"%PDF-1.4 fake")
    assert main.detect_kind(str(p)) is None


def test_parse_auto_answers_unknown_for_an_unrecognised_pdf():
    r = client.post("/api/parse", files={"file": ("x.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "auto"})
    assert r.status_code == 200
    assert r.json() == {"kind": "unknown", "name": "x.pdf", "data": None}


def test_parse_auto_is_the_default_kind():
    r = client.post("/api/parse", files={"file": ("x.pdf", b"%PDF-1.4 fake", "application/pdf")})
    assert r.status_code == 200 and r.json()["kind"] == "unknown"


def test_parse_auto_parses_with_the_detected_kind(monkeypatch):
    monkeypatch.setattr(main, "detect_kind", lambda path: "payslip")
    monkeypatch.setattr(main, "parse_payslip", lambda path: payslip_from_dict(payslip_dict()))
    r = client.post("/api/parse", files={"file": ("p.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "auto"})
    assert r.status_code == 200
    assert r.json()["kind"] == "payslip" and r.json()["data"]["base_hourly_rate"] == 60.0


def test_parse_auto_reports_an_unreadable_avac_instead_of_skipping_it(monkeypatch):
    monkeypatch.setattr(main, "detect_kind", lambda path: "avac")  # a flattened "Please wait…" AVAC is still an AVAC
    r = client.post("/api/parse", files={"file": ("a.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "auto"})
    assert r.status_code == 400 and "AVAC" in r.json()["detail"]


def test_parse_explicit_kind_still_skips_detection(monkeypatch):
    monkeypatch.setattr(main, "detect_kind", lambda path: pytest.fail("detect_kind must not run for an explicit kind"))
    monkeypatch.setattr(main, "parse_avac", lambda path: {"shifts": []})
    r = client.post("/api/parse", files={"file": ("a.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "avac"})
    assert r.status_code == 200 and r.json()["kind"] == "avac"
```

Also update the two existing cap tests so they stay one over the new caps:

```python
def test_reconcile_json_rejects_too_many_payslips():
    body = {"payslips": [payslip_dict()] * (main.MAX_PAYSLIP_FILES + 1), "avacs": [{"name": "w.pdf", "data": avac_dict([])}]}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


def test_reconcile_json_rejects_too_many_avacs():
    body = {"payslips": [payslip_dict()], "avacs": [{"name": "w.pdf", "data": avac_dict([])}] * (main.MAX_AVAC_FILES + 1)}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_two_phase_api.py -q`
Expected: ImportError on `looks_like_printed_avac` / `looks_like_payslip` (collection fails). Comment the two imports out for a moment if you want to see the individual failures: `test_reconcile_json_accepts_a_full_year` fails on `MAX_PAYSLIP_FILES == 26`, the `auto` tests get HTTP 400 "kind must be 'payslip' or 'avac'."

- [ ] **Step 3: Implement**

`backend/payslip_parser.py` (just above `def parse_payslip`):

```python
def looks_like_payslip(first_page_text: str) -> bool:
    """The SAP payslip header cells parse_page1 reads. Cheap and deterministic; used to classify a dropped PDF."""
    return "Pay Date" in first_page_text and ("Employee Name" in first_page_text or "Person ID" in first_page_text)
```

`backend/avac_parser.py`: rename `_has_xfa` to `has_xfa` (definition at `:124` and the call in `parse_avac`), then add after `_flattened_or_unreadable`:

```python
def looks_like_printed_avac(first_page_text: str) -> bool:
    """Text signals for an AVAC with no XFA: a static AVAC printed to PDF (form title or a shift row) or a
    dynamic one saved without its data (the 'Please wait…' placeholder — still an AVAC, so parse_avac can
    tell the user how to fix it instead of the file being skipped as unrecognised)."""
    text = first_page_text.lower()
    return ("attendance variation" in text or "please wait" in text
            or any(_PRINTED_ROW.match(line.strip()) for line in first_page_text.splitlines()))
```

`backend/main.py`:

```python
import pdfplumber  # add to imports

from payslip_parser import (parse_payslip, page1_overtime_by_date, payslip_to_dict, payslip_from_dict,
                            merge_payslips, unique_payslips, looks_like_payslip)
from avac_parser import (parse_avac, detect_breaks_across, validate_avac_dict, AvacFormatError,
                         has_xfa, looks_like_printed_avac)

MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB (Vercel body limit is 4.5 MB)
MAX_AVAC_FILES = 60      # a year of weekly AVACs, with slack
MAX_PAYSLIP_FILES = 26   # a year of fortnightly payslips
# Parsed JSON is ≤ 10 KB per payslip and ≤ 5 KB per AVAC (measured), so a full year is ≤ 560 KB: ~5× headroom.
MAX_JSON_BODY = 3 * 1024 * 1024  # keeps every request under the Vercel limit


def detect_kind(pdf_path: str) -> str | None:
    """'payslip' | 'avac' | None, from signals the parsers already rely on. XFA is checked first because a
    dynamic AVAC's text layer is only the 'Please wait…' placeholder. Anything unreadable is None."""
    try:
        if has_xfa(pdf_path):
            return "avac"
        with pdfplumber.open(pdf_path) as pdf:
            text = (pdf.pages[0].extract_text() or "") if pdf.pages else ""
    except Exception:
        return None
    if looks_like_payslip(text):
        return "payslip"
    if looks_like_printed_avac(text):
        return "avac"
    return None
```

and the endpoint:

```python
@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...), kind: str = Form("auto")):
    """Phase 1: one PDF in, its parsed JSON out. kind=auto classifies first and answers kind='unknown'
    (HTTP 200, data=None) for a PDF that is neither a payslip nor an AVAC."""
    if kind not in ("payslip", "avac", "auto"):
        raise HTTPException(400, "kind must be 'payslip', 'avac' or 'auto'.")
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds the 4 MB size limit.")
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "upload.pdf")
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, "File exceeds the 4 MB size limit.")
        with open(path, "wb") as f:
            f.write(content)
        if kind == "auto":
            kind = detect_kind(path)
            if kind is None:
                return {"kind": "unknown", "name": file.filename, "data": None}
        try:
            data = payslip_to_dict(parse_payslip(path)) if kind == "payslip" else parse_avac(path)
        except AvacFormatError as e:
            raise HTTPException(400, e.user_message)
        except Exception as e:
            print(f"{kind} parse error: {e}")
            raise HTTPException(400, "Could not parse the payslip. Please check the file and try again."
                                if kind == "payslip" else "Could not process this AVAC file.")
    return {"kind": kind, "name": file.filename, "data": data}
```

Update the module docstring's first lines to mention `kind=auto`.

- [ ] **Step 4: Run the backend suite and the scoreboard**

Run: `backend/.venv/bin/python -m pytest backend/tests -q`
Expected: all pass.

Run: `CHECKPAY_REAL_DATA="/Users/ahmet/Desktop/Desktop/CheckPay (payslips + AVAC)" backend/.venv/bin/python backend/scripts/real_data_regression.py`
Expected: `single=18/18 multi=13/13 fp=5/5 real_issues=4/4` (unchanged: no engine code was touched).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/avac_parser.py backend/payslip_parser.py backend/tests/test_two_phase_api.py
git commit -m "feat(backend): year-sized caps and kind=auto classification on /api/parse

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**GATE 1:** backend tests green; scoreboard unchanged.

---

### Task 2: Request plumbing — per-analysis rate limits, `auto` relay, parse pool

**Files:**
- Create: `lib/rate-limit.ts`, `lib/rate-limit.test.ts`, `proxy.test.ts`
- Modify: `proxy.ts:3-31, 67-90`
- Modify: `app/api/parse/route.ts`, `app/api/parse/route.test.ts`
- Modify: `lib/jobs.ts:135-165, 174-209, 284-374`, `lib/jobs.test.ts`
- Modify: `app/api/reconcile/route.test.ts` only if it hard-codes 9/11 (it uses the constants; check with `grep -n "9\|11" app/api/reconcile/route.test.ts`)

**Interfaces:**
- Consumes: backend `kind=auto` contract from Task 1.
- Produces (used by Task 3):
  - `lib/rate-limit.ts`: `export interface RateBucket { limit: number; windowMs: number }`, `export function isRateLimited(key: string, bucket: RateBucket, now?: number): boolean`, `export function resetRateLimits(): void`.
  - `lib/jobs.ts`: `MAX_PAYSLIP_FILES = 26`, `MAX_AVAC_FILES = 60`, `PARSE_CONCURRENCY = 6`, `MAX_REQUEST_BYTES` (unchanged); `export type UploadKind = 'payslip' | 'avac'`; `export interface ParsedUpload { kind: UploadKind; name: string; data: unknown }`; `export type ClassifiedUpload = ParsedUpload | { kind: 'unknown'; name: string }`; `export function parseUpload(file: File): Promise<ClassifiedUpload>` (throws `JobError`); `export function withParseSlot<T>(fn: () => Promise<T>): Promise<T>`; `export function fileDigest(file: File): Promise<string>`; `export function validateCounts(payslips: number, avacs: number): JobError | null`; `export function startAnalyzeJob(params: { payslips: ParsedUpload[]; avacs: ParsedUpload[] }): Promise<AnalysisJson>`.
  - Removed from `lib/jobs.ts`: `AnalyzeProgressEvent`, `onProgress`, `onPayslipRead`, `parseOne`, `validateFiles`, `validatePdfFile` (the page no longer imports them after Task 3; Task 3 must land before `npx tsc --noEmit` is green again — or keep the page compiling by finishing Task 3 in the same branch before merging. Recommended: Tasks 2 and 3 in one PR).

- [ ] **Step 1: Failing tests for the rate limiter** — `lib/rate-limit.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { isRateLimited, resetRateLimits } from './rate-limit'

beforeEach(() => resetRateLimits())

describe('isRateLimited', () => {
  it('allows `limit` hits inside the window and refuses the next one without recording it', () => {
    const b = { limit: 2, windowMs: 1000 }
    expect(isRateLimited('k', b, 0)).toBe(false)
    expect(isRateLimited('k', b, 1)).toBe(false)
    expect(isRateLimited('k', b, 2)).toBe(true)
    expect(isRateLimited('k', b, 3)).toBe(true)
  })

  it('forgets hits older than the window (sliding)', () => {
    const b = { limit: 2, windowMs: 1000 }
    isRateLimited('k', b, 0)
    isRateLimited('k', b, 500)
    expect(isRateLimited('k', b, 999)).toBe(true)
    expect(isRateLimited('k', b, 1000)).toBe(false) // the hit at 0 has aged out
  })

  it('keeps keys apart', () => {
    const b = { limit: 1, windowMs: 1000 }
    expect(isRateLimited('a', b, 0)).toBe(false)
    expect(isRateLimited('b', b, 0)).toBe(false)
    expect(isRateLimited('a', b, 1)).toBe(true)
  })
})
```

`proxy.test.ts` (repo root, next to `proxy.ts`):

```ts
// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetRateLimits } from '@/lib/rate-limit'
import { proxy } from './proxy'

const post = (path: string, ip = '203.0.113.7') =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, host: 'localhost:3000', origin: 'http://localhost:3000' },
  })

beforeEach(() => resetRateLimits())

describe('proxy rate limits', () => {
  it('lets one whole year through: 86 parses and then a reconcile', () => {
    for (let i = 0; i < 86; i++) expect(proxy(post('/api/parse')).status).toBe(200)
    expect(proxy(post('/api/reconcile')).status).toBe(200)
  })

  it('caps parses at 200 per 10 minutes per IP', () => {
    for (let i = 0; i < 200; i++) expect(proxy(post('/api/parse')).status).toBe(200)
    expect(proxy(post('/api/parse')).status).toBe(429)
    expect(proxy(post('/api/parse', '198.51.100.1')).status).toBe(200)
  })

  it('caps analyses at 6 per 10 minutes and keeps the two budgets apart', () => {
    for (let i = 0; i < 6; i++) expect(proxy(post('/api/reconcile')).status).toBe(200)
    expect(proxy(post('/api/reconcile')).status).toBe(429)
    expect(proxy(post('/api/parse')).status).toBe(200)
  })

  it('still refuses a cross-site POST', () => {
    const evil = new NextRequest('http://localhost:3000/api/parse', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7', host: 'localhost:3000', origin: 'https://evil.example' },
    })
    expect(proxy(evil).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test -- --run lib/rate-limit.test.ts proxy.test.ts`
Expected: FAIL — `./rate-limit` cannot be resolved; `proxy.test.ts` fails on the 61st parse (429 today).

- [ ] **Step 3: Implement the limiter** — `lib/rate-limit.ts`:

```ts
export interface RateBucket {
  limit: number
  windowMs: number
}

// ponytail: in-memory, per process. On Vercel every proxy instance counts alone, so the real ceiling is
// limit × instances — enough to stop a script, not a botnet. Upgrade path: a Vercel Firewall rate-limit
// rule (WAF custom rule on /api/parse and /api/reconcile, action "Rate limit"), then delete this file.
const hits = new Map<string, number[]>()
const LONGEST_WINDOW_MS = 10 * 60_000

// Evict idle keys so memory stays bounded between bursts.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, stamps] of hits) {
    const live = stamps.filter((t) => now - t < LONGEST_WINDOW_MS)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
}, 60_000)
;(sweeper as { unref?: () => void }).unref?.()

/** Sliding window. True when `key` already has `limit` hits inside the window; a refused hit is not recorded. */
export function isRateLimited(key: string, { limit, windowMs }: RateBucket, now = Date.now()): boolean {
  const live = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  const limited = live.length >= limit
  if (!limited) live.push(now)
  hits.set(key, live)
  return limited
}

export function resetRateLimits(): void {
  hits.clear()
}
```

`proxy.ts`: delete lines 3–31 (the old state and sweeper) and replace section 1 of `proxy()`:

```ts
import { NextResponse, type NextRequest } from 'next/server'

import { isRateLimited, type RateBucket } from '@/lib/rate-limit'

// Limits are per analysis, not per request. One analysis is ≤ 86 parses (26 payslips + 60 AVACs) and one
// reconcile. Parse gets a burst that covers a year twice (a reload re-parses); reconcile — the expensive
// engine call — is capped per analysis; anything else under /api keeps 60/min.
const TEN_MINUTES = 10 * 60_000
const BUCKETS: Array<{ prefix: string } & RateBucket> = [
  { prefix: '/api/parse', limit: 200, windowMs: TEN_MINUTES },
  { prefix: '/api/reconcile', limit: 6, windowMs: TEN_MINUTES },
]
const DEFAULT_BUCKET: { prefix: string } & RateBucket = { prefix: '/api', limit: 60, windowMs: 60_000 }

function bucketFor(pathname: string) {
  return BUCKETS.find((b) => pathname.startsWith(b.prefix)) ?? DEFAULT_BUCKET
}
```

```ts
  // 1. IP-based rate limiting (API routes only), one budget per path family
  if (isApiRoute) {
    const bucket = bucketFor(pathname)
    if (isRateLimited(`${bucket.prefix}:${getClientIp(request)}`, bucket)) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429)
    }
  }
```

Keep `getClientIp`, `jsonResponse`, the CSRF block, the session cookie and `config` exactly as they are.

- [ ] **Step 4: Run the limiter tests**

Run: `npm run test -- --run lib/rate-limit.test.ts proxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Failing tests for the `auto` relay** — append to `app/api/parse/route.test.ts`:

```ts
  it('relays kind=auto and the kind the backend detected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.body as FormData).get('kind')).toBe('auto')
      return new Response(JSON.stringify({ kind: 'payslip', name: 'p.pdf', data: { base_hourly_rate: 60 } }), { status: 200 })
    }))
    const res = await POST(req(pdfFile('p.pdf'), 'auto'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'payslip', name: 'p.pdf', data: { base_hourly_rate: 60 } })
  })

  it('relays an unknown classification as a 200 with null data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', name: 'x.pdf', data: null }), { status: 200 })))
    const res = await POST(req(pdfFile('x.pdf'), 'auto'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'unknown', name: 'x.pdf', data: null })
  })

  it('rejects unknown for an explicit kind and a nonsense kind for auto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', data: null }), { status: 200 })))
    expect((await POST(req(pdfFile(), 'avac'))).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'photo', data: {} }), { status: 200 })))
    expect((await POST(req(pdfFile(), 'auto'))).status).toBe(502)
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `npm run test -- --run app/api/parse/route.test.ts`
Expected: the first two new tests get 400 (`kind must be payslip or avac`).

- [ ] **Step 7: Implement the relay** — `app/api/parse/route.ts`:

```ts
const KINDS = new Set(['payslip', 'avac', 'auto'])
const DETECTED = new Set(['payslip', 'avac', 'unknown'])
```

```ts
    if (typeof kind !== 'string' || !KINDS.has(kind)) return bad('kind must be payslip, avac or auto')
```

and replace the response validation:

```ts
    const parsed = body as { kind?: unknown; data?: unknown } | null
    const detected = parsed?.kind
    const kindOk = kind === 'auto' ? typeof detected === 'string' && DETECTED.has(detected) : detected === kind
    const dataOk = detected === 'unknown' ? parsed?.data === null : typeof parsed?.data === 'object' && parsed?.data !== null
    if (!parsed || !kindOk || !dataOk) return bad('Invalid response from analysis service.', 502)
    return NextResponse.json({ kind: detected, name: file.name, data: parsed.data }, { status: 200, headers: securityHeaders })
```

Update the header comment: "Phase 1 of an analysis: exactly one PDF in; with kind=auto the backend classifies it first."

- [ ] **Step 8: Run the route tests**

Run: `npm run test -- --run app/api/parse/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Failing tests for `lib/jobs.ts`** — replace the `describe('startAnalyzeJob', …)` block in `lib/jobs.test.ts` with the following (keep the `normalizeAnalysisJson` and `getOverallStatusMeta` blocks). Add `// @vitest-environment node` as the first line of the file (Node 22 has `File`, `FormData`, `crypto.subtle`; jsdom's `Blob.arrayBuffer` is not reliable):

```ts
import { fileDigest, MAX_AVAC_FILES, MAX_PAYSLIP_FILES, PARSE_CONCURRENCY, parseUpload, startAnalyzeJob, validateCounts, withParseSlot, type ParsedUpload } from './jobs'

const pdf = (name: string, body: string | Uint8Array = '%PDF-1.4 fake') => new File([body], name, { type: 'application/pdf' })
const parsed = (kind: 'payslip' | 'avac', name: string, data: unknown = { shifts: [] }): ParsedUpload => ({ kind, name, data })
const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls

afterEach(() => vi.unstubAllGlobals())

describe('parseUpload', () => {
  it('posts one file with kind=auto and returns the detected kind and data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify({ kind: 'avac', name: 'a.pdf', data: { shifts: [1] } }), { status: 200 })))
    expect(await parseUpload(pdf('a.pdf'))).toEqual({ kind: 'avac', name: 'a.pdf', data: { shifts: [1] } })
    const [url, init] = calls()[0]
    expect(url).toBe('/api/parse')
    const fd = init.body as FormData
    expect(fd.get('kind')).toBe('auto')
    expect(fd.getAll('file')).toHaveLength(1)
  })

  it('returns kind unknown without data for an unrecognised PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'unknown', name: 'x.pdf', data: null }), { status: 200 })))
    expect(await parseUpload(pdf('x.pdf'))).toEqual({ kind: 'unknown', name: 'x.pdf' })
  })

  it('throws the backend message on a 400 and a generic one on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Could not process this AVAC file.' }), { status: 400 })))
    await expect(parseUpload(pdf('a.pdf'))).rejects.toMatchObject({ message: 'Could not process this AVAC file.' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(parseUpload(pdf('a.pdf'))).rejects.toMatchObject({ message: 'Failed to reach the analysis service. Please try again later.' })
  })
})

describe('withParseSlot', () => {
  it(`never runs more than ${PARSE_CONCURRENCY} tasks at once and runs them all`, async () => {
    let active = 0
    let peak = 0
    const tasks = Array.from({ length: 20 }, (_, i) => withParseSlot(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return i
    }))
    expect(await Promise.all(tasks)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(peak).toBe(PARSE_CONCURRENCY)
  })

  it('frees the slot when a task throws', async () => {
    await expect(withParseSlot(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await withParseSlot(async () => 'ok')).toBe('ok')
  })
})

describe('fileDigest', () => {
  it('is the same for identical bytes under different names and differs otherwise', async () => {
    const a = await fileDigest(pdf('Week 19.pdf', 'same bytes'))
    const b = await fileDigest(pdf('Week 19 - copy.pdf', 'same bytes'))
    const c = await fileDigest(pdf('Week 20.pdf', 'other bytes'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('validateCounts', () => {
  it('needs at least one of each and no more than a year of each', () => {
    expect(validateCounts(0, 1)).toMatchObject({ field: 'payslips' })
    expect(validateCounts(1, 0)).toMatchObject({ field: 'avacs' })
    expect(validateCounts(MAX_PAYSLIP_FILES + 1, 1)).toMatchObject({ field: 'payslips', message: 'Maximum 26 payslips allowed' })
    expect(validateCounts(1, MAX_AVAC_FILES + 1)).toMatchObject({ field: 'avacs', message: 'Maximum 60 AVAC forms allowed' })
    expect(validateCounts(MAX_PAYSLIP_FILES, MAX_AVAC_FILES)).toBeNull()
  })
})

describe('startAnalyzeJob', () => {
  const okResponse = (avacs: { name: string }[]) => new Response(JSON.stringify({
    status: 'ok', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: 0, base_rate: 60, is_overpayment_payslip: false,
    older_adjustments_total: 0, avac_results: avacs.map((a, i) => ({ avac_name: a.name, report: { n: i } })),
  }), { status: 200 })

  it('sends every parsed payslip and AVAC in one JSON call and returns results in order', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => okResponse(JSON.parse(String(init.body)).avacs)))
    const result = await startAnalyzeJob({
      payslips: [parsed('payslip', 'p1.pdf', { a: 1 }), parsed('payslip', 'p2.pdf', { a: 2 })],
      avacs: [parsed('avac', 'same.pdf'), parsed('avac', 'same.pdf')],
    })
    expect(calls()).toHaveLength(1)
    const [url, init] = calls()[0]
    expect(url).toBe('/api/reconcile')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({
      payslips: [{ a: 1 }, { a: 2 }],
      avacs: [{ name: 'same.pdf', data: { shifts: [] } }, { name: 'same.pdf', data: { shifts: [] } }],
    })
    expect(result.avac_results).toEqual([{ avac_name: 'same.pdf', report: { n: 0 } }, { avac_name: 'same.pdf', report: { n: 1 } }])
  })

  it('rejects a year plus one before calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(startAnalyzeJob({ payslips: Array.from({ length: 27 }, (_, i) => parsed('payslip', `p${i}.pdf`)), avacs: [parsed('avac', 'a.pdf')] }))
      .rejects.toMatchObject({ field: 'payslips' })
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [] })).rejects.toMatchObject({ field: 'avacs' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a correction payslip response as is', async () => {
    const correction = { status: 'correction_payslip', employee: 'Dr', pay_date: '26.03.2025', adjustment_total: -5, avac_results: [], message: 'm' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(correction), { status: 200 })))
    expect(await startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf')] })).toEqual(correction)
  })

  it('throws a clear error when the backend returns a different number of results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ name: 'a.pdf' }])))
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf'), parsed('avac', 'b.pdf')] }))
      .rejects.toMatchObject({ message: expect.stringMatching(/returned 1 AVAC results for 2 files/) })
  })

  it('surfaces the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Parsed data exceeds the 3 MB request limit.' }), { status: 413 })))
    await expect(startAnalyzeJob({ payslips: [parsed('payslip', 'p.pdf')], avacs: [parsed('avac', 'a.pdf')] }))
      .rejects.toMatchObject({ message: 'Parsed data exceeds the 3 MB request limit.' })
  })
})
```

- [ ] **Step 10: Run to verify failure**

Run: `npm run test -- --run lib/jobs.test.ts`
Expected: FAIL — `parseUpload`, `withParseSlot`, `fileDigest`, `validateCounts`, `PARSE_CONCURRENCY` are not exported; `startAnalyzeJob` rejects `ParsedUpload` inputs.

- [ ] **Step 11: Implement in `lib/jobs.ts`** — replace lines 135–164 and 174–209 and 284–374 with:

```ts
// Each request carries at most one PDF and must stay under Vercel's 4.5 MB body limit.
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024
export const MAX_PAYSLIP_FILES = 26 // a year of fortnightly payslips
export const MAX_AVAC_FILES = 60 // a year of weekly AVACs, with slack
/** Parallel /api/parse requests per browser: a browser's per-host connection budget, and at most ~6 × 0.2 s
 *  of backend work in flight per user. 86 files (a year) finish in ~15 s on a home connection. */
export const PARSE_CONCURRENCY = 6

export type UploadKind = 'payslip' | 'avac'

export interface ParsedUpload {
  kind: UploadKind
  name: string
  data: unknown
}

export type ClassifiedUpload = ParsedUpload | { kind: 'unknown'; name: string }

interface StartAnalyzeJobParams {
  payslips: ParsedUpload[]
  avacs: ParsedUpload[]
}
```

```ts
export function validateCounts(payslips: number, avacs: number): JobError | null {
  if (payslips === 0) return { field: 'payslips', message: 'At least one payslip is required' }
  if (payslips > MAX_PAYSLIP_FILES) return { field: 'payslips', message: `Maximum ${MAX_PAYSLIP_FILES} payslips allowed` }
  if (avacs === 0) return { field: 'avacs', message: 'At least one AVAC form is required' }
  if (avacs > MAX_AVAC_FILES) return { field: 'avacs', message: `Maximum ${MAX_AVAC_FILES} AVAC forms allowed` }
  return null
}
```

```ts
const invalidResponse = (): JobError => ({ message: 'Backend returned an invalid response format.' })

/** Phase 1 for one file: the backend classifies it (kind=auto) and, for a payslip or AVAC, parses it. */
export async function parseUpload(file: File): Promise<ClassifiedUpload> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', 'auto')
  const payload = await postAndParse('/api/parse', { method: 'POST', body: formData })
  if (!isRecord(payload)) throw invalidResponse()
  if (payload.kind === 'unknown') return { kind: 'unknown', name: file.name }
  if ((payload.kind !== 'payslip' && payload.kind !== 'avac') || !isRecord(payload.data)) throw invalidResponse()
  return { kind: payload.kind, name: file.name, data: payload.data }
}

let activeParses = 0
const parseWaiters: Array<() => void> = []

/** Runs fn once fewer than PARSE_CONCURRENCY parses are in flight; waiters run first come, first served. */
export async function withParseSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeParses >= PARSE_CONCURRENCY) await new Promise<void>((resolve) => parseWaiters.push(resolve))
  activeParses += 1
  try {
    return await fn()
  } finally {
    activeParses -= 1
    parseWaiters.shift()?.()
  }
}

/** SHA-256 hex of the bytes, so a re-upload of the same PDF under another name can be skipped. */
export async function fileDigest(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Phase 2: every parsed payslip and AVAC in one JSON call, so fatigue breaks and page-1 payments are seen
// across the whole year. Phase 1 (parseUpload) already ran per file as it was dropped.
export async function startAnalyzeJob(params: StartAnalyzeJobParams): Promise<AnalysisJson> {
  const validationError = validateCounts(params.payslips.length, params.avacs.length)
  if (validationError) throw validationError

  const payload = await postAndParse('/api/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payslips: params.payslips.map((p) => p.data),
      avacs: params.avacs.map((a) => ({ name: a.name, data: a.data })),
    }),
  })
  const normalized = normalizeAnalysisJson(payload)
  if (!normalized) throw invalidResponse()
  if (normalized.status === 'correction_payslip') return normalized

  // The backend answers in the order it was sent; positions, not names, keep duplicate file names distinct.
  if (normalized.avac_results.length !== params.avacs.length) {
    throw {
      message: `The analysis service returned ${normalized.avac_results.length} AVAC results for ${params.avacs.length} files. Please try again.`,
    } satisfies JobError
  }
  return normalized
}
```

Delete `AnalyzeProgressEvent`, `parseOne`, `validateFiles`, `validatePdfFile`. Keep `postAndParse`, `getErrorMessage`, `parseJsonSafely`, `normalizeAnalysisJson`, `getOverallStatusMeta`, `isRecord`, `isReconcileStatus`.

- [ ] **Step 12: Run the tests**

Run: `npm run test -- --run lib/jobs.test.ts app/api/reconcile/route.test.ts`
Expected: PASS. (`page.tsx` will not compile until Task 3; `vitest` transpiles per file, so these pass. `npx tsc --noEmit` is checked at the end of Task 3.)

- [ ] **Step 13: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts proxy.ts proxy.test.ts app/api/parse/route.ts app/api/parse/route.test.ts lib/jobs.ts lib/jobs.test.ts
git commit -m "feat(api): rate-limit per analysis, relay kind=auto, parse pool of 6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**GATE 2:** `npm run test -- --run` green except `app/(app)/check/new/page.test.tsx` (rewritten in Task 3).

---

### Task 3: Upload page — one dropzone, folder chooser, live file list

**Files:**
- Create: `app/(app)/check/new/upload-state.ts`, `app/(app)/check/new/upload-state.test.ts`, `app/(app)/check/new/FileList.tsx`
- Rewrite: `app/(app)/check/new/AnalysisProgress.tsx`, `app/(app)/check/new/page.tsx`, `app/(app)/check/new/page.test.tsx`
- Modify: `lib/faq-data.ts:20` (copy)

**Interfaces:**
- Consumes from Task 2: `parseUpload`, `withParseSlot`, `fileDigest`, `startAnalyzeJob`, `validateCounts`, `MAX_PAYSLIP_FILES`, `MAX_AVAC_FILES`, `MAX_REQUEST_BYTES`, `ParsedUpload`, `UploadKind`.
- Produces (used by Task 5's gate): `data-testid="folder-input"` on the `webkitdirectory` input; `data-testid="file-counts"` whose text is `"{p}/26 payslips · {a}/60 AVACs"` plus `" · {n} skipped"` when n > 0; `data-testid="analysis-status-message"` whose text starts with `Ready:` when the run can start; the `Analyse Files` button; per-row badges with the visible labels `Reading…`, `Payslip`, `AVAC`, `Couldn't read`; a `<details>` whose summary reads `Skipped {n} file(s)`.

`upload-state.ts` API:

```ts
export const MAX_FILES_PER_DROP = 150
export type UploadStatus =
  | { state: 'reading' }
  | { state: 'ready'; kind: UploadKind; data: unknown }
  | { state: 'skipped'; reason: string }
  | { state: 'error'; message: string }
export interface UploadItem { id: string; file: File; status: UploadStatus }
export type Phase = 'idle' | 'analyzing' | 'done'
export interface State { items: UploadItem[]; phase: Phase; error: string | null }
export type Action =
  | { type: 'add_files'; items: UploadItem[] }
  | { type: 'settle'; id: string; status: UploadStatus }
  | { type: 'remove'; id: string }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_phase'; value: Phase }
  | { type: 'reset' }
export const SKIP_NOT_PDF = 'Skipped — not a PDF'
export const SKIP_TOO_LARGE = 'Skipped — larger than 4 MB'
export const SKIP_NOT_RECOGNISED = 'Skipped — not a payslip or AVAC'
export function skipDuplicateOf(name: string): string          // `Skipped — same file as ${name}`
export function localSkipReason(file: File): string | null
export function newItem(file: File): UploadItem                 // ids are 'u1', 'u2', … (a counter; no crypto in jsdom)
export function reducer(state: State, action: Action): State
export interface Counts { payslips: number; avacs: number; reading: number; skipped: number; errors: number; total: number }
export function countItems(items: UploadItem[]): Counts
export function readyUploads(items: UploadItem[], kind: UploadKind): ParsedUpload[]
export function canAnalyze(state: State): boolean
export function statusMessage(state: State): string
```

- [ ] **Step 1: Failing tests for the pure state** — `app/(app)/check/new/upload-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { MAX_REQUEST_BYTES } from '@/lib/jobs'

import {
  canAnalyze, countItems, initialState, localSkipReason, newItem, readyUploads, reducer, SKIP_NOT_PDF,
  SKIP_TOO_LARGE, statusMessage, type State, type UploadItem,
} from './upload-state'

const file = (name: string, type = 'application/pdf', size = 2048) => new File([new Uint8Array(size)], name, { type })
const ready = (name: string, kind: 'payslip' | 'avac'): UploadItem => ({ ...newItem(file(name)), status: { state: 'ready', kind, data: { name } } })
const withItems = (items: UploadItem[]): State => ({ ...initialState, items })

describe('localSkipReason', () => {
  it('skips anything that is not a PDF, in the browser', () => {
    expect(localSkipReason(file('Screenshot.png', 'image/png'))).toBe(SKIP_NOT_PDF)
    expect(localSkipReason(file('.DS_Store', ''))).toBe(SKIP_NOT_PDF)
    expect(localSkipReason(file('payslip.PDF', ''))).toBeNull() // folder inputs sometimes give no MIME type
    expect(localSkipReason(file('payslip.pdf'))).toBeNull()
  })

  it('skips a PDF that would not fit in one request', () => {
    expect(localSkipReason(file('big.pdf', 'application/pdf', MAX_REQUEST_BYTES + 1))).toBe(SKIP_TOO_LARGE)
  })
})

describe('reducer', () => {
  it('adds files as reading or skipped, settles by id, removes by id', () => {
    const a = newItem(file('a.pdf'))
    const png = newItem(file('p.png', 'image/png'))
    let state = reducer(initialState, { type: 'add_files', items: [a, png] })
    expect(state.items.map((i) => i.status.state)).toEqual(['reading', 'skipped'])
    state = reducer(state, { type: 'settle', id: a.id, status: { state: 'ready', kind: 'avac', data: {} } })
    expect(state.items[0].status).toEqual({ state: 'ready', kind: 'avac', data: {} })
    state = reducer(state, { type: 'settle', id: 'missing', status: { state: 'error', message: 'x' } }) // a removed file's late result is a no-op
    expect(state.items).toHaveLength(2)
    state = reducer(state, { type: 'remove', id: a.id })
    expect(state.items.map((i) => i.file.name)).toEqual(['p.png'])
  })
})

describe('countItems / readyUploads', () => {
  it('counts per kind and state and returns parsed data per kind in drop order', () => {
    const items = [ready('p1.pdf', 'payslip'), ready('w1.pdf', 'avac'), ready('w2.pdf', 'avac'), newItem(file('x.png', 'image/png')), newItem(file('r.pdf')),
      { ...newItem(file('e.pdf')), status: { state: 'error' as const, message: 'nope' } }]
    expect(countItems(items)).toEqual({ payslips: 1, avacs: 2, reading: 1, skipped: 1, errors: 1, total: 6 })
    expect(readyUploads(items, 'avac')).toEqual([{ kind: 'avac', name: 'w1.pdf', data: { name: 'w1.pdf' } }, { kind: 'avac', name: 'w2.pdf', data: { name: 'w2.pdf' } }])
  })
})

describe('canAnalyze / statusMessage', () => {
  it('needs one of each, nothing still reading, and the caps respected', () => {
    expect(statusMessage(initialState)).toBe('Drop payslips and AVAC PDFs — or a whole folder — to begin.')
    expect(canAnalyze(withItems([ready('p.pdf', 'payslip')]))).toBe(false)
    expect(statusMessage(withItems([ready('p.pdf', 'payslip')]))).toBe('Add at least 1 AVAC to continue.')
    expect(statusMessage(withItems([ready('w.pdf', 'avac')]))).toBe('Add at least 1 payslip to continue.')
    expect(statusMessage(withItems([ready('p.pdf', 'payslip'), newItem(file('r.pdf'))]))).toBe('Reading 1 file…')
    const both = withItems([ready('p.pdf', 'payslip'), ready('w.pdf', 'avac'), newItem(file('x.png', 'image/png')),
      { ...newItem(file('e.pdf')), status: { state: 'error', message: 'nope' } }])
    expect(canAnalyze(both)).toBe(true)
    expect(statusMessage(both)).toBe("Ready: 1 payslip and 1 AVAC. 1 skipped. 1 couldn't be read and won't be included.")
    const tooMany = withItems([...Array.from({ length: 27 }, (_, i) => ready(`p${i}.pdf`, 'payslip')), ready('w.pdf', 'avac')])
    expect(canAnalyze(tooMany)).toBe(false)
    expect(statusMessage(tooMany)).toBe('Too many payslips (27 of 26). Remove some to continue.')
    expect(canAnalyze({ ...both, phase: 'analyzing' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- --run "app/(app)/check/new/upload-state.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `upload-state.ts`**

```ts
import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, MAX_REQUEST_BYTES, type ParsedUpload, type UploadKind } from '@/lib/jobs'

/** A year is ~80 valid files; more than this in one drop is a home folder by mistake. */
export const MAX_FILES_PER_DROP = 150

export type UploadStatus =
  | { state: 'reading' }
  | { state: 'ready'; kind: UploadKind; data: unknown }
  | { state: 'skipped'; reason: string }
  | { state: 'error'; message: string }

export interface UploadItem {
  id: string
  file: File
  status: UploadStatus
}

export type Phase = 'idle' | 'analyzing' | 'done'

export interface State {
  items: UploadItem[]
  phase: Phase
  error: string | null
}

export type Action =
  | { type: 'add_files'; items: UploadItem[] }
  | { type: 'settle'; id: string; status: UploadStatus }
  | { type: 'remove'; id: string }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_phase'; value: Phase }
  | { type: 'reset' }

export const initialState: State = { items: [], phase: 'idle', error: null }

export const SKIP_NOT_PDF = 'Skipped — not a PDF'
export const SKIP_TOO_LARGE = 'Skipped — larger than 4 MB'
export const SKIP_NOT_RECOGNISED = 'Skipped — not a payslip or AVAC'
export const skipDuplicateOf = (name: string) => `Skipped — same file as ${name}`

/** Decided in the browser, before any request: not a PDF, or too big for one request. */
export function localSkipReason(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return SKIP_NOT_PDF
  if (file.size > MAX_REQUEST_BYTES) return SKIP_TOO_LARGE
  return null
}

let nextId = 0

export function newItem(file: File): UploadItem {
  const reason = localSkipReason(file)
  nextId += 1
  return { id: `u${nextId}`, file, status: reason ? { state: 'skipped', reason } : { state: 'reading' } }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add_files':
      return { ...state, items: [...state.items, ...action.items], error: null }
    case 'settle':
      return { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, status: action.status } : i)) }
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.id !== action.id), error: null }
    case 'set_error':
      return { ...state, error: action.value }
    case 'set_phase':
      return { ...state, phase: action.value }
    case 'reset':
      return initialState
    default:
      return state
  }
}

export interface Counts {
  payslips: number
  avacs: number
  reading: number
  skipped: number
  errors: number
  total: number
}

export function countItems(items: UploadItem[]): Counts {
  const counts: Counts = { payslips: 0, avacs: 0, reading: 0, skipped: 0, errors: 0, total: items.length }
  for (const { status } of items) {
    if (status.state === 'ready') counts[status.kind === 'payslip' ? 'payslips' : 'avacs'] += 1
    else if (status.state === 'reading') counts.reading += 1
    else if (status.state === 'skipped') counts.skipped += 1
    else counts.errors += 1
  }
  return counts
}

export function readyUploads(items: UploadItem[], kind: UploadKind): ParsedUpload[] {
  return items.flatMap((i) => (i.status.state === 'ready' && i.status.kind === kind ? [{ kind, name: i.file.name, data: i.status.data }] : []))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function canAnalyze(state: State): boolean {
  const c = countItems(state.items)
  return state.phase === 'idle' && c.reading === 0
    && c.payslips >= 1 && c.payslips <= MAX_PAYSLIP_FILES
    && c.avacs >= 1 && c.avacs <= MAX_AVAC_FILES
}

/** One sentence for the live status line under the Analyse button. */
export function statusMessage(state: State): string {
  const c = countItems(state.items)
  if (c.total === 0) return 'Drop payslips and AVAC PDFs — or a whole folder — to begin.'
  if (c.reading > 0) return `Reading ${plural(c.reading, 'file')}…`
  if (c.payslips > MAX_PAYSLIP_FILES) return `Too many payslips (${c.payslips} of ${MAX_PAYSLIP_FILES}). Remove some to continue.`
  if (c.avacs > MAX_AVAC_FILES) return `Too many AVACs (${c.avacs} of ${MAX_AVAC_FILES}). Remove some to continue.`
  if (c.payslips === 0) return 'Add at least 1 payslip to continue.'
  if (c.avacs === 0) return 'Add at least 1 AVAC to continue.'
  return `Ready: ${plural(c.payslips, 'payslip')} and ${plural(c.avacs, 'AVAC')}.`
    + (c.skipped ? ` ${c.skipped} skipped.` : '')
    + (c.errors ? ` ${c.errors} couldn't be read and won't be included.` : '')
}
```

- [ ] **Step 4: Run the state tests**

Run: `npm run test -- --run "app/(app)/check/new/upload-state.test.ts"`
Expected: PASS.

- [ ] **Step 5: Failing page tests** — rewrite `app/(app)/check/new/page.test.tsx`. Keep the `next/link`, `next/navigation` and `@/lib/session-reports` mocks and the `useDropzoneMock` pattern; the dropzone is now created once, so its options are `useDropzoneMock.mock.calls.at(-1)[0]`. Mock `@/lib/jobs` so that `parseUpload`, `fileDigest` and `startAnalyzeJob` are controllable and everything else (constants, `withParseSlot`) is real:

```tsx
const parseUploadMock = vi.fn()
const fileDigestMock = vi.fn()

vi.mock('@/lib/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jobs')>()),
  parseUpload: (...args: unknown[]) => parseUploadMock(...args),
  fileDigest: (...args: unknown[]) => fileDigestMock(...args),
  startAnalyzeJob: (...args: unknown[]) => startAnalyzeJobMock(...args),
}))

function getDrop(): (accepted: File[], rejected?: { file: File }[]) => void {
  const options = useDropzoneMock.mock.calls.at(-1)?.[0] as { onDrop: (a: File[], r: { file: File }[]) => void } | undefined
  if (!options) throw new Error('Dropzone handler is unavailable.')
  return (accepted, rejected = []) => options.onDrop(accepted, rejected)
}

const pdf = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const png = (name: string) => new File([new Uint8Array(16)], name, { type: 'image/png' })

/** Classifies by file name, like the backend would: "payslip*" → payslip, "week*" → avac, otherwise unknown. */
function classifyByName(file: File) {
  const n = file.name.toLowerCase()
  if (n.startsWith('payslip')) return { kind: 'payslip', name: file.name, data: { payslip: file.name } }
  if (n.startsWith('week')) return { kind: 'avac', name: file.name, data: { avac: file.name } }
  return { kind: 'unknown', name: file.name }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDropzoneMock.mockImplementation(() => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false, open: vi.fn() }))
  fileDigestMock.mockImplementation(async (file: File) => `digest:${file.name}`)
  parseUploadMock.mockImplementation(async (file: File) => classifyByName(file))
  saveSessionReportMock.mockReturnValue('report-123')
  startAnalyzeJobMock.mockResolvedValue({ status: 'ok' })
})

async function drop(files: File[], rejected: File[] = []) {
  await act(async () => {
    getDrop()(files, rejected.map((file) => ({ file })))
  })
}
```

Tests:

```tsx
describe('NewAnalysisPage', () => {
  it('renders the hero, one dropzone, a folder chooser and the year-sized trust chip', () => {
    render(<NewAnalysisPage />)
    expect(screen.getByRole('heading', { name: 'Start Your Free Analysis' })).toBeInTheDocument()
    expect(useDropzoneMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Choose a folder' })).toBeInTheDocument()
    expect(screen.getByTestId('folder-input')).toHaveAttribute('webkitdirectory')
    expect(screen.getByText('PDF only · Up to 60 AVACs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Drop payslips and AVAC PDFs — or a whole folder — to begin.')
  })

  it('classifies each dropped file, shows kind badges and counts, and skips junk with a note', async () => {
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf'), pdf('Menu.pdf')], [png('Screenshot.png')])

    const list = screen.getByRole('list', { name: 'Files' })
    expect(within(list).getByText('Payslip')).toBeInTheDocument()
    expect(within(list).getAllByText('AVAC')).toHaveLength(2)
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 2/60 AVACs · 2 skipped')
    const skipped = screen.getByText('Skipped 2 files').closest('details')!
    expect(within(skipped).getByText('Skipped — not a PDF')).toBeInTheDocument()
    expect(within(skipped).getByText('Skipped — not a payslip or AVAC')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Ready: 1 payslip and 2 AVACs. 2 skipped.')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('skips non-PDFs locally without a parse request', async () => {
    render(<NewAnalysisPage />)
    await drop([], [png('a.png'), png('b.png'), new File(['x'], '.DS_Store')])
    expect(parseUploadMock).not.toHaveBeenCalled()
    expect(fileDigestMock).not.toHaveBeenCalled()
    expect(screen.getByText('Skipped 3 files')).toBeInTheDocument()
  })

  it('refuses a drop of more than 150 files without adding any of them', async () => {
    render(<NewAnalysisPage />)
    await drop(Array.from({ length: 151 }, (_, i) => pdf(`Week ${i}.pdf`)))
    expect(screen.getByRole('alert')).toHaveTextContent("That's 151 files. CheckPay reads up to 150 at a time — a year is about 80.")
    expect(parseUploadMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('skips a byte-identical file and frees it when the original is removed', async () => {
    fileDigestMock.mockResolvedValue('same')
    render(<NewAnalysisPage />)
    await drop([pdf('Week 19.pdf'), pdf('Week 19 - copy.pdf')])
    expect(parseUploadMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Skipped — same file as Week 19.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Week 19.pdf' }))
    await drop([pdf('Week 19 - copy.pdf')])
    expect(parseUploadMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('file-counts')).toHaveTextContent('0/26 payslips · 1/60 AVACs')
  })

  it('keeps reading the other files when one parse fails, and excludes that file from the run', async () => {
    parseUploadMock.mockImplementation(async (file: File) => {
      if (file.name === 'Week 2.pdf') throw { message: 'Too many requests. Please try again later.' }
      return classifyByName(file)
    })
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf')])

    expect(screen.getByText("Couldn't read")).toBeInTheDocument()
    expect(screen.getByText('Too many requests. Please try again later.')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent("Ready: 1 payslip and 1 AVAC. 1 couldn't be read and won't be included.")

    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))
    const [params] = startAnalyzeJobMock.mock.calls[0]
    expect(params).toEqual({
      payslips: [{ kind: 'payslip', name: 'Payslip 1.pdf', data: { payslip: 'Payslip 1.pdf' } }],
      avacs: [{ kind: 'avac', name: 'Week 1.pdf', data: { avac: 'Week 1.pdf' } }],
    })
  })

  it('shows "Reading…" while parses are in flight and keeps Analyse disabled', async () => {
    let finish: (v: unknown) => void = () => {}
    parseUploadMock.mockImplementation((file: File) => file.name === 'Week 1.pdf' ? new Promise((r) => { finish = r }) : classifyByName(file))
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf')])
    expect(screen.getByText('Reading…')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Reading 1 file…')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    await act(async () => { finish({ kind: 'avac', name: 'Week 1.pdf', data: {} }) })
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('disables Analyse when more than 26 payslips are ready', async () => {
    render(<NewAnalysisPage />)
    await drop([...Array.from({ length: 27 }, (_, i) => pdf(`Payslip ${i}.pdf`)), pdf('Week 1.pdf')])
    expect(screen.getByTestId('file-counts')).toHaveTextContent('27/26 payslips · 1/60 AVACs')
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Too many payslips (27 of 26). Remove some to continue.')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Payslip 0.pdf' }))
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('replaces the form with the compare panel, then opens the report', async () => {
    vi.useFakeTimers()
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf')])
    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))

    const heading = screen.getByRole('heading', { name: 'Checking 2 AVACs against 1 payslip' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Analyse Files' })).not.toBeInTheDocument()
    expect(screen.getByTestId('analysis-stage')).toHaveTextContent('Comparing every shift with the award rules and your payslips')

    await act(async () => { await Promise.resolve() })
    expect(saveSessionReportMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Your report is ready' })).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(pushMock).toHaveBeenCalledWith('/check/report/report-123')
    vi.useRealTimers()
  })

  it('returns to the form and focuses the error when the analysis fails', async () => {
    startAnalyzeJobMock.mockRejectedValue({ message: 'Parsed data exceeds the 3 MB request limit.' })
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf')])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Parsed data exceeds the 3 MB request limit.')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeInTheDocument()
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 1/60 AVACs') // files survive a failed run
  })

  it('adds files chosen through the folder input', async () => {
    render(<NewAnalysisPage />)
    const input = screen.getByTestId('folder-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf('Payslip 1.pdf'), png('shot.png')] } })
    })
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 0/60 AVACs · 1 skipped')
  })
})
```

Keep the existing `renders sample report preview CTA` test as is. Import `within` from `@testing-library/react`.

- [ ] **Step 6: Run to verify failure**

Run: `npm run test -- --run "app/(app)/check/new/page.test.tsx"`
Expected: FAIL throughout (two dropzones, no folder input, old copy).

- [ ] **Step 7: Implement `FileList.tsx`**

```tsx
'use client'

import { CalendarDays, CircleAlert, FileText, Loader2, X, type LucideIcon } from 'lucide-react'

import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { type Counts, type UploadItem, type UploadStatus } from './upload-state'

// Kind and state are always icon + words, never colour alone.
const BADGES: Record<'reading' | 'payslip' | 'avac' | 'error', { icon: LucideIcon; label: string; className: string }> = {
  reading: { icon: Loader2, label: 'Reading…', className: 'bg-[var(--cp-bg-secondary)] text-[var(--cp-text-secondary)] ring-[var(--cp-border)]' },
  payslip: { icon: FileText, label: 'Payslip', className: 'bg-[var(--cp-accent-subtle)] text-[var(--cp-accent-hover)] ring-[#cfdcfb]' },
  avac: { icon: CalendarDays, label: 'AVAC', className: 'bg-[var(--cp-review-bg)] text-[var(--cp-review)] ring-[var(--cp-review-ring)]' },
  error: { icon: CircleAlert, label: "Couldn't read", className: 'bg-[var(--cp-owed-bg)] text-[var(--cp-owed)] ring-[var(--cp-owed-ring)]' },
}

function badgeOf(status: UploadStatus) {
  if (status.state === 'ready') return BADGES[status.kind]
  if (status.state === 'reading') return BADGES.reading
  return BADGES.error
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function RemoveButton({ name, onClick, disabled }: { name: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--cp-text-secondary)] transition hover:border-[var(--cp-border)] hover:bg-[var(--cp-accent-subtle)] hover:text-[var(--cp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
      aria-label={`Remove ${name}`}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  )
}

export function FileList({
  items,
  counts,
  disabled,
  onRemove,
  onRemoveAll,
}: {
  items: UploadItem[]
  counts: Counts
  disabled: boolean
  onRemove: (id: string) => void
  onRemoveAll: () => void
}) {
  if (items.length === 0) return null
  const active = items.filter((i) => i.status.state !== 'skipped')
  const skipped = items.filter((i) => i.status.state === 'skipped')
  const over = counts.payslips > MAX_PAYSLIP_FILES || counts.avacs > MAX_AVAC_FILES

  return (
    <section aria-labelledby="files-heading" className="mt-6 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-bg-primary)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="files-heading" className="text-sm font-semibold text-[var(--cp-text-primary)]">Your files</h2>
        <p data-testid="file-counts" className={cn('cp-mono text-[11px] uppercase tracking-[0.08em]', over ? 'text-[var(--cp-owed)]' : 'text-[var(--cp-text-secondary)]')}>
          {counts.payslips}/{MAX_PAYSLIP_FILES} payslips · {counts.avacs}/{MAX_AVAC_FILES} AVACs{counts.skipped > 0 && ` · ${counts.skipped} skipped`}
        </p>
        <Button type="button" variant="ghost" onClick={onRemoveAll} disabled={disabled} className="h-8 px-2 text-xs text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]">
          Remove all
        </Button>
      </div>

      {active.length > 0 && (
        <ul aria-label="Files" className="mt-3 space-y-2">
          {active.map((item) => {
            const badge = badgeOf(item.status)
            const Icon = badge.icon
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-lg border border-[var(--cp-border)] bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--cp-text-primary)]">{item.file.name}</span>
                    <span className="cp-mono shrink-0 text-[11px] text-[var(--cp-text-secondary)]">{formatFileSize(item.file.size)}</span>
                    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', badge.className)}>
                      <Icon className={cn('h-3.5 w-3.5', item.status.state === 'reading' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                      {badge.label}
                    </span>
                  </div>
                  {item.status.state === 'error' && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-text-secondary)]">{item.status.message}</p>
                  )}
                </div>
                <RemoveButton name={item.file.name} onClick={() => onRemove(item.id)} disabled={disabled} />
              </li>
            )
          })}
        </ul>
      )}

      {skipped.length > 0 && (
        <details className="mt-3 rounded-lg border border-dashed border-[var(--cp-border)] px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none text-[var(--cp-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)]">
            Skipped {skipped.length} file{skipped.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {skipped.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[var(--cp-text-primary)]">{item.file.name}</span>
                  <span className="block text-[13px] text-[var(--cp-text-secondary)]">{item.status.state === 'skipped' ? item.status.reason : ''}</span>
                </span>
                <RemoveButton name={item.file.name} onClick={() => onRemove(item.id)} disabled={disabled} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
```

- [ ] **Step 8: Rewrite `AnalysisProgress.tsx`** (the per-AVAC list moved into `FileList`; the compare step is one call, so the bar is indeterminate):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Shown only after this long, when a cold start is the likely cause.
const SLOW_AFTER_MS = 10_000

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function AnalysisProgress({ payslipCount, avacCount, ready }: { payslipCount: number; avacCount: number; ready: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [slow, setSlow] = useState(false)

  // The Analyse button unmounts with the form; hand focus to the panel so keyboard and
  // screen reader users land on what replaced it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [ready])

  const announcement = ready
    ? `Report ready. ${plural(avacCount, 'AVAC')} checked against ${plural(payslipCount, 'payslip')}. Opening your report.`
    : slow
      ? 'Still working. The first check can take a few extra seconds.'
      : ''

  return (
    <section
      aria-labelledby="analysis-progress-heading"
      aria-busy={!ready}
      className="cp-reveal relative isolate overflow-hidden rounded-2xl bg-[var(--cp-bg-dark)] text-[var(--cp-text-inverse)] shadow-[0_24px_60px_rgba(26,26,26,0.18)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-60 cp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,rgba(0,87,255,0.22),transparent_65%)]" aria-hidden />

      <div className="relative px-5 pb-6 pt-7 sm:px-9 sm:pb-9 sm:pt-10">
        <p className="cp-mono text-[11px] uppercase tracking-[0.12em] text-[#a9c3ff]">
          {ready ? 'Analysis complete' : 'Analysis in progress'}
        </p>
        <h2
          id="analysis-progress-heading"
          ref={headingRef}
          tabIndex={-1}
          className="cp-display mt-3 max-w-[22ch] text-[clamp(1.75rem,4.2vw,2.5rem)] leading-[1.08] outline-none"
        >
          {ready ? 'Your report is ready' : `Checking ${plural(avacCount, 'AVAC')} against ${plural(payslipCount, 'payslip')}`}
        </h2>

        <div className="mt-8">
          <p className="text-sm text-[#E6E6E4]" data-testid="analysis-stage">
            {ready ? 'Every shift compared with the award rules and your payslips' : 'Comparing every shift with the award rules and your payslips'}
          </p>
          <div
            role="progressbar"
            aria-label="Comparing shifts with payslips"
            aria-valuetext={ready ? 'Done' : 'In progress'}
            className={cn('relative mt-3 h-[3px] overflow-hidden rounded-full bg-white/15', !ready && 'cp-progress-track')}
          >
            <div className="h-full origin-left rounded-full bg-[var(--cp-accent)] transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${ready ? 1 : 0})` }} />
          </div>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-[#B6B6B6]">
          {ready
            ? 'Opening your report…'
            : slow
              ? 'Taking a little longer than usual. The first check can need a few extra seconds while the service starts up.'
              : 'Keep this tab open until your report opens.'}
        </p>

        <p role="status" aria-live="polite" className="sr-only" data-testid="analysis-announcement">
          {announcement}
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 9: Rewrite `page.tsx`** — keep the hero section verbatim except: the subtitle becomes `Drop a year of payslips and AVAC PDFs — or the folder they live in. CheckPay sorts them, then compares expected vs paid overtime in about a minute.`; the trust chip becomes `` `PDF only · Up to ${MAX_AVAC_FILES} AVACs` ``. Replace everything from the type declarations down to the return statement's second `<section>` with:

```tsx
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, ArrowRight, Clock3, Eye, FolderOpen, LockKeyhole, ScanSearch, UploadCloud } from 'lucide-react'

import { MAX_AVAC_FILES, MAX_PAYSLIP_FILES, fileDigest, parseUpload, readyUploads as _unused, startAnalyzeJob, withParseSlot } from '@/lib/jobs'
```

(remove the `_unused` import — `readyUploads` comes from `./upload-state`; shown here only to flag the two sources):

```tsx
import { SAMPLE_REPORT_ROUTE } from '@/lib/sample-report'
import { saveSessionReport } from '@/lib/session-reports'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { AnalysisProgress } from './AnalysisProgress'
import { FileList } from './FileList'
import {
  canAnalyze, countItems, initialState, MAX_FILES_PER_DROP, newItem, readyUploads, reducer, SKIP_NOT_RECOGNISED,
  skipDuplicateOf, statusMessage, type UploadItem, type UploadStatus,
} from './upload-state'

// Short "Report ready" beat before navigating; long enough to register, not a fake wait.
const READY_BEAT_MS = 400

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'Something went wrong. Please try again.'
}

export default function NewAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const router = useRouter()
  const errorRef = useRef<HTMLDivElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const prevPhaseRef = useRef(state.phase)
  const runIdRef = useRef(0)
  // digest -> the item that owns it; a byte-identical later file is skipped until that item is removed.
  const digestOwners = useRef(new Map<string, { id: string; name: string }>())

  useEffect(() => {
    if (prevPhaseRef.current === 'analyzing' && state.phase === 'idle' && state.error) errorRef.current?.focus()
    prevPhaseRef.current = state.phase
  }, [state.error, state.phase])

  const readItem = useCallback(async (item: UploadItem) => {
    const settle = (status: UploadStatus) => dispatch({ type: 'settle', id: item.id, status })
    try {
      await withParseSlot(async () => {
        const digest = await fileDigest(item.file)
        const owner = digestOwners.current.get(digest)
        if (owner && owner.id !== item.id) return settle({ state: 'skipped', reason: skipDuplicateOf(owner.name) })
        digestOwners.current.set(digest, { id: item.id, name: item.file.name })
        const parsed = await parseUpload(item.file)
        settle(parsed.kind === 'unknown'
          ? { state: 'skipped', reason: SKIP_NOT_RECOGNISED }
          : { state: 'ready', kind: parsed.kind, data: parsed.data })
      })
    } catch (error) {
      settle({ state: 'error', message: messageOf(error) })
    }
  }, [])

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    if (files.length + state.items.length > MAX_FILES_PER_DROP) {
      dispatch({ type: 'set_error', value: `That's ${files.length} files. CheckPay reads up to ${MAX_FILES_PER_DROP} at a time — a year is about 80.` })
      return
    }
    const items = files.map(newItem)
    dispatch({ type: 'add_files', items })
    for (const item of items) if (item.status.state === 'reading') void readItem(item)
  }, [readItem, state.items.length])

  const removeItem = useCallback((id: string) => {
    for (const [digest, owner] of digestOwners.current) if (owner.id === id) digestOwners.current.delete(digest)
    dispatch({ type: 'remove', id })
  }, [])

  const removeAll = useCallback(() => {
    digestOwners.current.clear()
    dispatch({ type: 'reset' })
  }, [])

  const dropzone = useDropzone({
    // Rejected files (wrong type) still go through addFiles so each gets its own skip note.
    onDrop: (accepted, rejected) => addFiles([...accepted, ...rejected.map((r) => r.file)]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: state.phase !== 'idle',
  })

  const counts = countItems(state.items)
  const ready = canAnalyze(state)

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze(state)) return
    const payslips = readyUploads(state.items, 'payslip')
    const avacs = readyUploads(state.items, 'avac')
    dispatch({ type: 'set_error', value: null })
    dispatch({ type: 'set_phase', value: 'analyzing' })
    const runId = ++runIdRef.current
    try {
      const analysis = await startAnalyzeJob({ payslips, avacs })
      if (runIdRef.current !== runId) return
      const reportId = saveSessionReport(analysis)
      dispatch({ type: 'set_phase', value: 'done' })
      setTimeout(() => router.push(`/check/report/${reportId}`), READY_BEAT_MS)
    } catch (error) {
      if (runIdRef.current !== runId) return
      dispatch({ type: 'set_error', value: messageOf(error) })
      dispatch({ type: 'set_phase', value: 'idle' })
    }
  }, [router, state])

  const trustPills = [
    { icon: LockKeyhole, label: 'No account required' },
    { icon: ScanSearch, label: `PDF only · Up to ${MAX_AVAC_FILES} AVACs` },
    { icon: Clock3, label: 'Temporary session report' },
  ]
```

and the form section:

```tsx
      <section className="mx-auto max-w-[1120px] px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {state.error && (
            <Alert ref={errorRef} tabIndex={-1} variant="destructive" className="mb-6 outline-none">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {state.phase !== 'idle' ? (
            <AnalysisProgress payslipCount={counts.payslips} avacCount={counts.avacs} ready={state.phase === 'done'} />
          ) : (
            <>
              <div
                {...dropzone.getRootProps()}
                className={cn(
                  'rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                  dropzone.isDragActive ? 'border-[var(--cp-accent)] bg-[var(--cp-accent-subtle)]' : 'border-[var(--cp-border)] bg-[#F7F6F3]',
                  'cursor-pointer hover:border-[var(--cp-accent)]/60 hover:bg-[var(--cp-accent-subtle)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cp-accent)] focus-visible:ring-offset-2',
                )}
              >
                <input {...dropzone.getInputProps()} />
                <UploadCloud className="mx-auto h-8 w-8 text-[var(--cp-text-secondary)]/70" aria-hidden />
                <p className="mt-3 text-base font-semibold text-[var(--cp-text-primary)]">
                  {dropzone.isDragActive ? 'Drop them here' : 'Drop payslips and AVAC PDFs here'}
                </p>
                <p className="mt-1 text-sm text-[var(--cp-text-secondary)]">
                  A whole folder works too — CheckPay tells payslips from AVACs and skips the rest.
                </p>
                <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="h-10 gap-2" onClick={(e) => { e.stopPropagation(); dropzone.open() }}>
                    Choose files
                  </Button>
                  <Button type="button" variant="outline" className="h-10 gap-2" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}>
                    <FolderOpen className="h-4 w-4" aria-hidden />
                    Choose a folder
                  </Button>
                </div>
                <p className="cp-mono mt-4 text-[11px] uppercase tracking-[0.08em] text-[var(--cp-text-secondary)]">
                  PDF · up to {MAX_PAYSLIP_FILES} payslips and {MAX_AVAC_FILES} AVACs · 4 MB each
                </p>
              </div>
              {/* The folder chooser is a plain input: react-dropzone has no directory mode. */}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                tabIndex={-1}
                aria-hidden
                className="sr-only"
                data-testid="folder-input"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
                {...({ webkitdirectory: '' } as Record<string, string>)}
              />

              <FileList items={state.items} counts={counts} disabled={false} onRemove={removeItem} onRemoveAll={removeAll} />

              <div className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleAnalyze}
                    disabled={!ready}
                    className="h-11 w-full rounded-md bg-[var(--cp-accent)] px-8 text-white transition duration-150 hover:scale-[1.01] hover:bg-[var(--cp-accent-hover)] hover:shadow-[0_10px_24px_rgba(0,87,255,0.28)] sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-2">
                      Analyse Files
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>
                  <Button type="button" variant="ghost" onClick={removeAll} className="text-[var(--cp-text-secondary)] hover:text-[var(--cp-text-primary)]">
                    Reset
                  </Button>
                </div>
                <p className="mt-3 text-sm text-[var(--cp-text-secondary)]" aria-live="polite" data-testid="analysis-status-message">
                  {statusMessage(state)}
                </p>
              </div>
            </>
          )}
        </div>
      </section>
```

Delete `UploadCard`, `SelectedFiles`, `FILE_LIMITS`, `UploadType`, the old reducer and `validatePdfFile`/`formatFileSize` from `page.tsx` (`formatFileSize` now lives in `FileList.tsx`). Update `lib/faq-data.ts:20` to: `'You need your Queensland Health payslip PDFs and the AVAC form PDFs they cover — up to 26 payslips and 60 AVACs, a whole year. Drop them together (or the folder they are in); CheckPay tells them apart.'`

- [ ] **Step 10: Run page tests, the whole suite, types and lint**

Run: `npm run test -- --run "app/(app)/check/new/page.test.tsx"` → PASS.
Run: `npm run test -- --run && npx tsc --noEmit && npm run lint` → all green (lint: `security/detect-object-injection` warnings are tolerated at `warn`; no errors).

- [ ] **Step 11: Look at it** — `npx vercel@latest dev -L`, open `http://localhost:3000/check/new` at 1280 px and at 390 px (DevTools device toolbar). Drop 3 sample PDFs plus a PNG; confirm badges, the `Skipped 1 file` disclosure, keyboard: Tab reaches the dropzone, both choose buttons, each remove button and the disclosure summary; screen reader status line updates once per state change (not per file). Do not screenshot real data.

- [ ] **Step 12: Commit**

```bash
git add "app/(app)/check/new" lib/faq-data.ts
git commit -m "feat(upload): one dropzone with folder chooser, live classification and per-file notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**GATE 3:** full frontend suite, `tsc`, lint green; manual 390 px check done.

---

### Task 4: Report — group a year by month

**Files:**
- Modify: `app/(app)/check/report/[id]/report-formatters.ts` (append), `report-formatters.test.ts`
- Modify: `app/(app)/check/report/[id]/_components/ReportActionQueue.tsx`, `ReportActionQueue.test.tsx`
- Modify: `app/(app)/check/report/[id]/_components/ReportPerAvacDetails.tsx`, `ReportPerAvacDetails.test.tsx`
- Modify: `app/(app)/check/report/[id]/_components/PrintSummaryDocument.tsx`; Create: `PrintSummaryDocument.test.tsx`
- Modify: `app/(app)/check/report/[id]/_components/ReportOverview.test.tsx` (pin the 26-payslip hero)
- Modify: `app/globals.css` (print month row)

**Interfaces:**
- Produces in `report-formatters.ts`:
  - `export function isoDateOf(date: string): string | null` — `"05.06.2025"` → `"2025-06-05"`.
  - `export function formatMonthLabel(key: string): string` — `"2025-06"` → `"June 2025"`.
  - `export interface MonthGroup<T> { key: string; label: string; items: T[] }`
  - `export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => string | null | undefined): MonthGroup<T>[]` — oldest first; undated last with `key: 'undated'`, `label: 'Undated'`.
- Consumes: `ActionableRow.date`, `UnpaidWeek.week_start`, `AvacDetailSummary.report.days[].date` (all `dd.mm.yyyy`).

- [ ] **Step 1: Failing formatter tests** — append to `report-formatters.test.ts` (add `groupByMonth`, `isoDateOf`, `formatMonthLabel` to the import):

```ts
  it('turns dotted dates into ISO and month labels', () => {
    expect(isoDateOf('05.06.2025')).toBe('2025-06-05')
    expect(isoDateOf('12/05')).toBeNull()
    expect(formatMonthLabel('2025-06')).toBe('June 2025')
  })

  it('groups by calendar month, oldest first, same month in different years apart, undated last', () => {
    const rows = [
      { d: '15.12.2025', n: 'dec25' }, { d: '03.06.2025', n: 'jun-a' }, { d: '', n: 'none' },
      { d: '20.12.2024', n: 'dec24' }, { d: '28.06.2025', n: 'jun-b' },
    ]
    const groups = groupByMonth(rows, (r) => r.d)
    expect(groups.map((g) => [g.key, g.label, g.items.map((r) => r.n)])).toEqual([
      ['2024-12', 'December 2024', ['dec24']],
      ['2025-06', 'June 2025', ['jun-a', 'jun-b']],
      ['2025-12', 'December 2025', ['dec25']],
      ['undated', 'Undated', ['none']],
    ])
    expect(groupByMonth([], (r: { d: string }) => r.d)).toEqual([])
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- --run "app/(app)/check/report/[id]/report-formatters.test.ts"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the helpers** — append to `report-formatters.ts`:

```ts
/** "05.06.2025" -> "2025-06-05"; null for any other shape (SAP "12/05" periods included). */
export function isoDateOf(date: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date?.trim() ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2025-06" -> "June 2025". */
export function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-')
  const name = MONTHS_LONG[Number(month) - 1]
  return name ? `${name} ${year}` : key
}

export interface MonthGroup<T> {
  key: string
  label: string
  items: T[]
}

/** Buckets items by the calendar month of dateOf(item), oldest month first, keeping each item's relative
 *  order inside its month. Items without a readable date land in a trailing "Undated" group. */
export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => string | null | undefined): MonthGroup<T>[] {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = isoDateOf(dateOf(item) ?? '')?.slice(0, 7) ?? 'undated'
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === 'undated' ? 1 : b === 'undated' ? -1 : a.localeCompare(b)))
    .map(([key, groupItems]) => ({ key, label: key === 'undated' ? 'Undated' : formatMonthLabel(key), items: groupItems }))
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Failing component tests** — append to `ReportActionQueue.test.tsx`:

```tsx
  it('groups "Raise with payroll" rows by month with a subtotal when they span several months', () => {
    const april = { ...buildTimingRow(0), date: '14.04.2025', status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const, difference: -50 }
    const june = { ...buildTimingRow(1), date: '02.06.2025', status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const, difference: -70 }
    render(<ReportActionQueue needsFollowUpNowRows={[june, april]} timingCheckRows={[]} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toContain('April 2025')
    expect(headings[0]).toContain('1 item')
    expect(headings[0]).toContain('-$50.00')
    expect(headings[1]).toContain('June 2025')
    expect(screen.getByText('Total difference').nextElementSibling).toHaveTextContent('-$120.00')
  })

  it('shows no month headings when everything is in one month', () => {
    const rows = [0, 1].map((i) => ({ ...buildTimingRow(i), status: 'UNDERPAID', issueLabel: 'Underpaid', category: 'needs_follow_up_now' as const }))
    render(<ReportActionQueue needsFollowUpNowRows={rows} timingCheckRows={[]} />)
    expect(screen.queryByRole('heading', { level: 3, name: /2025/ })).not.toBeInTheDocument()
  })

  it('groups unpaid weeks and dates to verify by month', () => {
    const weeks = [
      { week_start: '07.04.2025', avac_name: 'Week 15.pdf', expected_total: 100, age_days: 60 },
      { week_start: '02.06.2025', avac_name: 'Week 23.pdf', expected_total: 120, age_days: 4 },
    ]
    const rows = [{ ...buildTimingRow(0), date: '10.04.2025' }, { ...buildTimingRow(1), date: '12.06.2025' }]
    render(<ReportActionQueue needsFollowUpNowRows={[]} timingCheckRows={rows} unpaidWeeks={weeks} />)
    expect(screen.getAllByRole('heading', { level: 4, name: 'April 2025' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 4, name: 'June 2025' })).toHaveLength(2)
  })
```

Append to `ReportPerAvacDetails.test.tsx` (reuse the file's existing `totals`, `payrollContext` and summary builders; if it has no summary builder, use this one):

```tsx
function summaryFor(id: string, firstDate: string): AvacDetailSummary {
  const day = { date: firstDate, day_of_week: 'Mon', day_type: 'weekday', status: 'OK', expected_total: 0, actual_total: 0, difference: 0, items: [] }
  return {
    id, avacName: `${id}.pdf`, statusKey: 'ALL_MATCH', statusLabel: 'All matched', subtitle: '1 day', actionItemCount: 0, followUpCount: 0,
    pendingCheckCount: 0, issueDays: [], cleanDays: [day], actionableStatusesByDate: new Map(),
    report: { overall_status: 'ALL_MATCH', match_count: 1, discrepancy_count: 0, missing_count: 0, unmatched_count: 0, not_yet_paid_count: 0,
      possibly_missed_count: 0, earliest_adjustment_date: firstDate, latest_adjustment_date: firstDate, total_expected: 0, total_actual: 0,
      total_difference: 0, days: [day], actionable_items: [], older_adjustments: [], older_adjustments_total: 0, unmatched_payslip_entries: [] },
  }
}

  it('groups AVAC files by the month of their first day and puts unreadable files last', () => {
    const unreadable: AvacDetailSummary = { ...summaryFor('bad', ''), report: undefined, error: 'Could not process this AVAC file.', statusKey: 'PARSE_ERROR', statusLabel: 'Could not read', cleanDays: [] }
    render(<ReportPerAvacDetails summaries={[summaryFor('w23', '02.06.2025'), summaryFor('w15', '07.04.2025'), unreadable]} totals={totals} payrollContext={payrollContext} showTroubleshooting={false} />)
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['April 2025', 'June 2025', 'Files that could not be read'])
  })

  it('shows no month headings for a single month', () => {
    render(<ReportPerAvacDetails summaries={[summaryFor('w1', '02.06.2025'), summaryFor('w2', '09.06.2025')]} totals={totals} payrollContext={payrollContext} showTroubleshooting={false} />)
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })
```

New `PrintSummaryDocument.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SAMPLE_ANALYSIS } from '@/lib/sample-report'
import type { AnalysisJson, LineItem } from '@/lib/jobs'

import { buildPrintSummaryModel, createReportViewModel } from '../report-view-model'
import { PrintSummaryDocument } from './PrintSummaryDocument'

function underpaid(date: string): LineItem {
  return { date, day_of_week: 'Mon', pay_type: 'Overtime_-_1.5', status: 'UNDERPAID', expected_units: 1, actual_units: 0, expected_amount: 60, actual_amount: 0, difference: -60, notes: '' }
}

function analysisWithMonths(dates: string[]): AnalysisJson {
  const first = SAMPLE_ANALYSIS.avac_results[0]
  return {
    ...SAMPLE_ANALYSIS,
    unpaid_weeks: [],
    avac_results: dates.map((date, i) => ({
      avac_name: `Week ${i + 1}.pdf`,
      report: { ...first.report!, days: [], actionable_items: [underpaid(date)], warnings: [] },
    })),
  }
}

describe('PrintSummaryDocument', () => {
  it('adds a month header row per month when rows span several months', () => {
    const analysis = analysisWithMonths(['14.04.2025', '02.06.2025'])
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.getByRole('columnheader', { name: /April 2025 · 1 item/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /June 2025 · 1 item/ })).toBeInTheDocument()
  })

  it('adds no month rows for a single month', () => {
    const analysis = analysisWithMonths(['14.04.2025', '21.04.2025'])
    const viewModel = createReportViewModel(analysis)
    const printModel = buildPrintSummaryModel({ analysis, viewModel, reportId: 'r1', reportCreatedAt: null })
    render(<PrintSummaryDocument analysis={analysis} viewModel={viewModel} printModel={printModel} reportCreatedAt={null} reportId="r1" />)
    expect(screen.queryByRole('columnheader', { name: /2025/ })).not.toBeInTheDocument()
  })
})
```

Append to `ReportOverview.test.tsx`:

```tsx
  it('states the payslip count and the full pay-date range for a year', () => {
    const a: ReconcileResponseOk = {
      ...analysis(1),
      payslips: Array.from({ length: 26 }, (_, i) => {
        const d = new Date(Date.UTC(2025, 0, 15 + i * 14))
        const pad = (n: number) => String(n).padStart(2, '0')
        return { pay_date: `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}` }
      }),
    }
    render(<ReportOverview analysis={a} viewModel={createReportViewModel(a)} reportCreatedAt={null} isSampleReport={false} />)
    expect(screen.getByText('Payslips').nextElementSibling).toHaveTextContent('26')
    expect(screen.getByText('15 Jan 2025 – 31 Dec 2025')).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `npm run test -- --run "app/(app)/check/report"`
Expected: the new grouping tests fail (no month headings / column headers); the overview test passes already (it pins existing behaviour).

- [ ] **Step 7: Implement grouping in the components**

`ReportActionQueue.tsx` — import `groupByMonth` from `../report-formatters`; add:

```tsx
function MonthHeading({ level, label, detail }: { level: 3 | 4; label: string; detail?: string }) {
  const Tag = level === 3 ? 'h3' : 'h4'
  return (
    <Tag className="mt-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--cp-border)] pb-2 text-sm font-semibold text-[var(--cp-text-primary)]">
      <span>{label}</span>
      {detail && <span className="text-[var(--cp-text-secondary)] font-normal tabular-nums">{detail}</span>}
    </Tag>
  )
}
```

In `RaiseWithPayrollSection`, move the existing `<ul>` into `function RowList({ rows, sharedAction }: { rows: ActionableRow[]; sharedAction: string | null })` and render:

```tsx
          {groupByMonth(rows, (row) => row.date).map((group, _, groups) => (
            <div key={group.key}>
              {groups.length > 1 && (
                <MonthHeading
                  level={3}
                  label={group.label}
                  detail={`${group.items.length} item${group.items.length === 1 ? '' : 's'} · ${formatSignedCurrency(group.items.reduce((s, r) => s + toSafeNumber(r.difference), 0))}`}
                />
              )}
              <RowList rows={group.items} sharedAction={sharedAction} />
            </div>
          ))}
```

The "Total difference" footer stays after all groups. In `OtherPayslipsSection`, wrap the unpaid-weeks `<ul>` and the dates `<ul>` the same way with `groupByMonth(unpaidWeeks, (w) => w.week_start)` and `groupByMonth(visibleRows, (r) => r.date)`, using `MonthHeading level={4}` only when `groups.length > 1`. The preview limit still applies to the flat `visibleRows` before grouping.

`ReportPerAvacDetails.tsx` — import `groupByMonth`, `isoDateOf`; add:

```tsx
/** The AVAC's first day, for month grouping; undefined for a file with no report. */
function firstDayOf(summary: AvacDetailSummary): string | undefined {
  return summary.report?.days
    .map((day) => day.date)
    .filter((date) => isoDateOf(date))
    .sort((a, b) => isoDateOf(a)!.localeCompare(isoDateOf(b)!))[0]
}
```

Move the `<Accordion …>{summaries.map(…)}</Accordion>` into `function AvacAccordion({ summaries }: { summaries: AvacDetailSummary[] })` and render under "By AVAC file":

```tsx
        {groupByMonth(summaries, firstDayOf).map((group, _, groups) => (
          <div key={group.key} className="mt-4">
            {groups.length > 1 && (
              <h4 className="mb-3 flex items-baseline justify-between gap-4 border-b border-[var(--cp-border)] pb-2 text-sm font-semibold text-[var(--cp-text-primary)]">
                <span>{group.key === 'undated' ? 'Files that could not be read' : group.label}</span>
                <span className="font-normal text-[var(--cp-text-secondary)]">
                  {group.items.length} file{group.items.length === 1 ? '' : 's'}
                  {group.key !== 'undated' && ` · ${group.items.filter((s) => s.statusKey !== 'ALL_MATCH').length} to look at`}
                </span>
              </h4>
            )}
            <AvacAccordion summaries={group.items} />
          </div>
        ))}
```

`PrintSummaryDocument.tsx` — in `ActionSection`, replace the `<tbody>` body with:

```tsx
              {groupByMonth(section.rows, (row) => row.date).map((group, _, groups) => (
                <Fragment key={group.key}>
                  {groups.length > 1 && (
                    <tr className="print-summary-month-row">
                      <th scope="colgroup" colSpan={7}>{group.label} · {group.items.length} item{group.items.length === 1 ? '' : 's'}</th>
                    </tr>
                  )}
                  {group.items.map((row, index) => (
                    /* the existing two <tr>s per row, unchanged, keyed `${section.id}-${group.key}-${row.avacName}-${row.date}-${row.pay_type}-${index}` */
                  ))}
                </Fragment>
              ))}
```

`app/globals.css` inside `@media print`, after `.print-summary-table` rules:

```css
  .print-summary-month-row th {
    text-align: left;
    background: #f2f2f2;
    font-weight: 600;
    padding: 6px 6px 4px;
  }
```

- [ ] **Step 8: Run the report tests and the full suite**

Run: `npm run test -- --run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 9: Check the sample report is unchanged** — open `http://localhost:3000/check/sample-report` at 1280 and 390 px; no month headings appear (one month); print preview (⌘P) renders as before.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/check/report/[id]" app/globals.css
git commit -m "feat(report): group a year of results by month

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**GATE 4:** suite, `tsc`, lint green; sample report visually unchanged.

---

### Task 5: The gate — the whole private folder through the real UI, plus mocked screenshots and docs

**Files:**
- Create: `e2e/year_of_files.py`
- Create (from the mock run): `docs/design/screenshots/year-upload-desktop.png`, `year-report-desktop.png`, `year-report-mobile.png`, `year-report-print.png`
- Modify: `TESTING.md`, `CLAUDE.md:12,46`, `README.md:10`

**Interfaces:**
- Consumes from Task 3: `[data-testid=folder-input]`, `[data-testid=file-counts]`, `[data-testid=analysis-status-message]`, button `Analyse Files`; from the report: the `AVAC files read` fact (`<dt>` followed by `<dd>`), the `Payslips` fact, the level-1 heading.
- Produces: exit code 0/1 and a `RESULT` line `RESULT files=<n> payslips=<p> avacs=<a> skipped=<s> read_s=<t1> total_s=<t2>`.

- [ ] **Step 1: Write the script** — `e2e/year_of_files.py`:

```python
"""End-to-end gate: a whole folder through the single dropzone.

Real mode (private data; asserts counts, prints timings, writes nothing into the repo):
    npx vercel@latest dev -L                      # terminal 1: frontend + backend
    CHECKPAY_REAL_DATA="/path/to/private folder" \
      uv run --with playwright==1.58.0 python e2e/year_of_files.py --expect-payslips 17 --expect-avacs 23 --min-skipped 16

Mock mode (synthetic year, no backend needed beyond the Next dev server; writes the committed screenshots):
    uv run --with playwright==1.58.0 python e2e/year_of_files.py --mock

If Chromium is missing: uv run --with playwright==1.58.0 playwright install chromium
"""
import argparse
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE_URL = os.environ.get("CHECKPAY_BASE_URL", "http://localhost:3000")
SHOTS = Path(__file__).resolve().parents[1] / "docs" / "design" / "screenshots"
DMY = "%d.%m.%Y"


# ---------------------------------------------------------------- synthetic year (mock mode only)

def year_fixture() -> dict:
    """26 fortnightly payslips and 52 weekly AVACs of fictional data, deterministic, with a mix of outcomes."""
    monday = date(2025, 1, 6)
    payslips = []
    for i in range(26):
        start = monday + timedelta(days=14 * i)
        payslips.append({"pay_date": (start + timedelta(days=16)).strftime(DMY),
                         "period_start": start.strftime(DMY), "period_end": (start + timedelta(days=13)).strftime(DMY)})
    pattern = ["MATCH", "MATCH", "UNDERPAID", "MATCH", "NOT_ON_THIS_PAYSLIP", "MATCH", "MISSING", "MATCH"]
    paid = {"MATCH": 126.0, "UNDERPAID": 84.0, "MISSING": 0.0, "NOT_ON_THIS_PAYSLIP": 0.0}
    results, unpaid = [], []
    for w in range(52):
        day = monday + timedelta(weeks=w, days=1)
        status = pattern[w % len(pattern)]
        expected, actual = 126.0, paid[status]
        diff = 0.0 if status == "NOT_ON_THIS_PAYSLIP" else round(actual - expected, 2)
        item = {"date": day.strftime(DMY), "day_of_week": "Tue", "pay_type": "Overtime_-_1.5", "status": status,
                "expected_units": 1.4, "actual_units": round(actual / 90, 2), "expected_amount": expected,
                "actual_amount": actual, "difference": diff, "notes": ""}
        actionable = [] if status == "MATCH" else [item]
        results.append({"avac_name": f"Week {w + 1} AVAC.pdf", "report": {
            "overall_status": "ALL_MATCH" if status == "MATCH" else "DISCREPANCIES_FOUND",
            "match_count": int(status == "MATCH"), "discrepancy_count": int(status == "UNDERPAID"),
            "missing_count": int(status == "MISSING"), "unmatched_count": 0, "not_yet_paid_count": 0,
            "not_on_this_payslip_count": int(status == "NOT_ON_THIS_PAYSLIP"), "possibly_missed_count": 0,
            "earliest_adjustment_date": item["date"], "latest_adjustment_date": item["date"],
            "total_expected": expected, "total_actual": actual, "total_difference": diff,
            "reversal_count": 0, "informational_difference": 0.0,
            "pending_expected_total": expected if status == "NOT_ON_THIS_PAYSLIP" else 0.0, "warnings": [],
            "days": [{"date": item["date"], "day_of_week": "Tue", "day_type": "weekday",
                      "status": "OK" if status == "MATCH" else status, "expected_total": expected,
                      "actual_total": actual, "difference": diff, "items": [item]}],
            "actionable_items": actionable, "older_adjustments": [], "older_adjustments_total": 0.0,
            "unmatched_payslip_entries": []}})
        if status == "NOT_ON_THIS_PAYSLIP":
            unpaid.append({"week_start": (day - timedelta(days=1)).strftime(DMY), "avac_name": f"Week {w + 1} AVAC.pdf",
                           "expected_total": expected, "age_days": (date(2025, 12, 31) - day).days})
    last = payslips[-1]
    return {"status": "ok", "employee": "Dr Sample", "pay_date": last["pay_date"],
            "pay_period_start": last["period_start"], "pay_period_end": last["period_end"], "base_rate": 60.0,
            "is_overpayment_payslip": False, "adjustment_total": 0.0, "older_adjustments_total": 0.0,
            "avac_results": results, "payslips": payslips, "unpaid_weeks": unpaid}


def fake_files() -> list[dict]:
    pdf = b"%PDF-1.4 fake"
    files = [{"name": f"Payslip {i + 1}.pdf", "mimeType": "application/pdf", "buffer": pdf} for i in range(26)]
    files += [{"name": f"Week {w + 1} AVAC.pdf", "mimeType": "application/pdf", "buffer": pdf} for w in range(52)]
    files += [{"name": "Screenshot.png", "mimeType": "image/png", "buffer": b"\x89PNG"},
              {"name": "Menu.pdf", "mimeType": "application/pdf", "buffer": pdf}]
    return files


def install_mocks(page: Page) -> None:
    def parse(route):
        body = route.request.post_data_buffer or b""
        m = re.search(rb'filename="([^"]+)"', body)
        name = m.group(1).decode() if m else "x.pdf"
        if name.startswith("Payslip"):
            route.fulfill(json={"kind": "payslip", "name": name, "data": {"base_hourly_rate": 60.0}})
        elif name.startswith("Week"):
            route.fulfill(json={"kind": "avac", "name": name, "data": {"shifts": []}})
        else:
            route.fulfill(json={"kind": "unknown", "name": name, "data": None})

    page.route("**/api/parse", parse)
    page.route("**/api/reconcile", lambda route: route.fulfill(json=year_fixture()))


# ---------------------------------------------------------------- the flow

def fact(page: Page, label: str) -> str:
    return page.locator("dt", has_text=re.compile(rf"^{re.escape(label)}$")).locator("xpath=following-sibling::dd[1]").inner_text()


def run(page: Page, source, shots_label: str | None) -> dict:
    problems: list[str] = []
    page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("response", lambda r: problems.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))

    t0 = time.monotonic()
    page.goto(f"{BASE_URL}/check/new")
    page.set_input_files("[data-testid=folder-input]", source)
    status = page.get_by_test_id("analysis-status-message")
    expect(status).to_have_text(re.compile(r"^(Ready:|Too many|Add at least)"), timeout=15 * 60_000)
    read_s = time.monotonic() - t0
    counts_text = page.get_by_test_id("file-counts").inner_text()
    m = re.match(r"(\d+)/\d+ payslips · (\d+)/\d+ AVACs(?: · (\d+) skipped)?", counts_text)
    if not m:
        raise SystemExit(f"unexpected counts text: {counts_text!r}")
    payslips, avacs, skipped = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if shots_label:
        page.screenshot(path=SHOTS / f"year-upload-{shots_label}.png", full_page=True)

    page.get_by_role("button", name="Analyse Files").click()
    page.wait_for_url(re.compile(r"/check/report/"), timeout=5 * 60_000)
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    total_s = time.monotonic() - t0

    read_fact = fact(page, "AVAC files read")
    if read_fact != f"{avacs}/{avacs}":
        problems.append(f"report says AVAC files read {read_fact!r}, expected {avacs}/{avacs}")
    if shots_label:
        page.screenshot(path=SHOTS / f"year-report-{shots_label}.png", full_page=True)
        if shots_label == "desktop":
            page.get_by_role("button", name="Show breakdown").click()
            page.emulate_media(media="print")
            page.screenshot(path=SHOTS / "year-report-print.png", full_page=True)
            page.emulate_media(media="screen")
    return {"payslips": payslips, "avacs": avacs, "skipped": skipped, "read_s": read_s, "total_s": total_s, "problems": problems}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true", help="synthetic year through route mocks; writes screenshots")
    ap.add_argument("--expect-payslips", type=int)
    ap.add_argument("--expect-avacs", type=int)
    ap.add_argument("--min-skipped", type=int, default=0)
    args = ap.parse_args()

    folder = os.environ.get("CHECKPAY_REAL_DATA")
    if not args.mock and not folder:
        print("SKIP: set CHECKPAY_REAL_DATA to the private folder, or pass --mock")
        return 0

    failures: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        viewports = [("desktop", 1280, 900)] + ([("mobile", 390, 844)] if args.mock else [])
        for label, w, h in viewports:
            context = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if args.mock else 1)
            page = context.new_page()
            if args.mock:
                install_mocks(page)
            result = run(page, fake_files() if args.mock else folder, label if args.mock else None)
            context.close()
            n = 80 if args.mock else "folder"
            print(f"RESULT viewport={label} files={n} payslips={result['payslips']} avacs={result['avacs']} "
                  f"skipped={result['skipped']} read_s={result['read_s']:.1f} total_s={result['total_s']:.1f}")
            expected_p = 26 if args.mock else args.expect_payslips
            expected_a = 52 if args.mock else args.expect_avacs
            if expected_p is not None and result["payslips"] != expected_p:
                failures.append(f"{label}: payslips {result['payslips']} != {expected_p}")
            if expected_a is not None and result["avacs"] != expected_a:
                failures.append(f"{label}: avacs {result['avacs']} != {expected_a}")
            if result["skipped"] < (2 if args.mock else args.min_skipped):
                failures.append(f"{label}: skipped {result['skipped']} below minimum")
            failures += [f"{label}: {p}" for p in result["problems"]]
        browser.close()

    for f in failures:
        print("FAIL", f)
    print("PASS" if not failures else f"FAILED ({len(failures)})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the mock mode against `vercel dev`** (the backend is never called; mocks answer)

Run: `npx vercel@latest dev -L` in one terminal, then `uv run --with playwright==1.58.0 python e2e/year_of_files.py --mock`
Expected: two `RESULT` lines (`payslips=26 avacs=52 skipped=2`), `PASS`, and four PNGs in `docs/design/screenshots/`. Open them: desktop upload shows the list with badges and the `Skipped 2 files` disclosure; desktop report shows month headings in "Raise with payroll" and "By AVAC file"; mobile report at 390 px has no horizontal scrolling; print shows month header rows. If `set_input_files` rejects the dict list, upgrade the pin (`--with playwright==1.58.0` → the installed `playwright --version`).

- [ ] **Step 3: Run the real gate**

Run: `CHECKPAY_REAL_DATA="/Users/ahmet/Desktop/Desktop/CheckPay (payslips + AVAC)" uv run --with playwright==1.58.0 python e2e/year_of_files.py --expect-payslips 17 --expect-avacs 23 --min-skipped 16`
Expected: `RESULT viewport=desktop files=folder payslips=17 avacs=23 skipped=18 read_s=… total_s=…` and `PASS` (skipped = 8 duplicate AVACs + 8 PNGs + 2 `.DS_Store`; if Chromium omits dotfiles from a directory pick, skipped is 16, which the `--min-skipped 16` floor accepts). No `HTTP 4xx/5xx`, no console errors. Record `read_s` and `total_s` in the PR description (numbers only, no file names).

- [ ] **Step 4: Docs**

`TESTING.md` — replace the "Error checks" item 2–3 with:

```
2. Drop a PNG and a non-payslip PDF with real files: both appear under "Skipped N files" with a reason and are never uploaded.
3. Drop 27 payslips: Analyse stays disabled with "Too many payslips (27 of 26). Remove some to continue."
```

and add a section:

```
## Year-of-files gate (before merging changes to upload, parse or the report)

    npx vercel@latest dev -L
    CHECKPAY_REAL_DATA="/path/to/private folder" uv run --with playwright==1.58.0 python e2e/year_of_files.py --expect-payslips 17 --expect-avacs 23 --min-skipped 16
    uv run --with playwright==1.58.0 python e2e/year_of_files.py --mock   # refreshes docs/design/screenshots/year-*.png

The real run uses the folder chooser on the whole private folder (subfolder, screenshots and duplicates
included) and must print PASS. Only the mock run's screenshots are committed.
```

`CLAUDE.md`: line 12 → `3. Users drop any mix of payslip and AVAC PDFs (or a folder) into one dropzone; each file is classified and parsed as it lands (`/api/parse`, `kind=auto`).`; line 46 → `- Maximum 26 payslips and 60 AVAC files per analysis (a year); 150 files per drop`. Add under Data Flow: `- Rate limits are per analysis: 200 parses and 6 reconciles per 10 minutes per IP (proxy.ts, in-memory per instance).` `README.md:10` → `Drop a year of payslip and AVAC PDFs (up to 26 + 60) — or the whole folder — in one go`.

- [ ] **Step 5: Final checks**

Run: `npm run test -- --run && npx tsc --noEmit && npm run lint && backend/.venv/bin/python -m pytest backend/tests -q`
Run: `CHECKPAY_REAL_DATA="/Users/ahmet/Desktop/Desktop/CheckPay (payslips + AVAC)" backend/.venv/bin/python backend/scripts/real_data_regression.py` → `single=18/18 multi=13/13 fp=5/5 real_issues=4/4`
Run: `grep -rn "Up to 10\|10 AVAC\|8 payslip\|1–8\|1–10" --include='*.ts' --include='*.tsx' --include='*.md' . | grep -v node_modules | grep -v docs/superpowers` → empty.
Run: `git status --porcelain docs/design/screenshots` → only the four `year-*.png`; confirm by eye that none shows real names (they are all "Dr Sample" / "Week N AVAC.pdf").

- [ ] **Step 6: Commit**

```bash
git add e2e/year_of_files.py docs/design/screenshots/year-*.png TESTING.md CLAUDE.md README.md
git commit -m "test(e2e): year-of-files gate through the folder chooser, with mocked screenshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**GATE 5:** real gate `PASS` with timings recorded; mock screenshots committed; all suites green; scoreboard unchanged.

---

## Self-review notes

- Spec coverage: caps (T1, T2, T3 copy, T5 docs); rate limit per analysis with numbers, in-memory ceiling and Firewall upgrade path (T2); pool of 6 with live per-file progress (T2, T3); one dropzone + folder input + server-side `kind=auto` + skip notes + accessible list with badges/remove/counts (T1, T3); month grouping in action queue, breakdown, unpaid weeks, print; hero already on `describePayslipScope`, pinned (T4); e2e over the entire private folder with counts and time, committed screenshots mocked (T5); no new npm deps (Python Playwright via uv); ≤ 1 PDF or ≤ 3 MB JSON per request (unchanged, headroom stated); scoreboard gate after T1 and T5.
- Type consistency: `ParsedUpload`/`UploadKind`/`ClassifiedUpload` are defined once in `lib/jobs.ts` (T2) and consumed by `upload-state.ts` (T3); `groupByMonth`/`isoDateOf`/`formatMonthLabel` are defined in T4 step 3 and used in T4 steps 7 only; test ids named in T3 match the selectors in T5.
- Known trade-off (deliberate): parse-on-drop means a user who drops files and walks away has still spent backend time; acceptable at 0.2 s per file and covered by the parse bucket.
