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
import tempfile
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
    # Distinct bytes per file: the app skips byte-identical uploads as duplicates (SHA-256 of
    # content), so a shared buffer here would collapse the whole year down to one file.
    def pdf(tag: str) -> bytes:
        return f"%PDF-1.4 fake {tag}".encode()

    files = [{"name": f"Payslip {i + 1}.pdf", "mimeType": "application/pdf", "buffer": pdf(f"payslip{i}")} for i in range(26)]
    files += [{"name": f"Week {w + 1} AVAC.pdf", "mimeType": "application/pdf", "buffer": pdf(f"avac{w}")} for w in range(52)]
    files += [{"name": "Screenshot.png", "mimeType": "image/png", "buffer": b"\x89PNG"},
              {"name": "Menu.pdf", "mimeType": "application/pdf", "buffer": pdf("menu")}]
    return files


def materialize(files: list[dict], directory: Path) -> str:
    """[data-testid=folder-input] always carries `webkitdirectory`; Playwright's set_input_files
    refuses a list of in-memory buffers against such an input (real browsers require a real
    directory there), so the mock fixture is written to disk once and fed in as a folder, exactly
    like the real gate's private folder."""
    for f in files:
        (directory / f["name"]).write_bytes(f["buffer"])
    return str(directory)


def install_mocks(page: Page) -> None:
    def parse(route):
        body = route.request.post_data_buffer or b""
        m = re.search(rb'filename="([^"]+)"', body)
        # A file picked through a `webkitdirectory` input serialises as "<dirname>/<basename>" in
        # the multipart body even though file.name (what the app keys its own state on) stays bare.
        name = m.group(1).decode().rsplit("/", 1)[-1] if m else "x.pdf"
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
    # "AVAC files read" appears twice (the hero facts row and the sidebar panel) with the same value.
    return page.locator("dt", has_text=re.compile(rf"^{re.escape(label)}$")).first.locator(
        "xpath=following-sibling::dd[1]"
    ).inner_text()


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
    # text_content(), not inner_text(): the counts line is CSS `uppercase`, which inner_text()
    # would apply, breaking a case-sensitive match against the source copy.
    counts_text = page.get_by_test_id("file-counts").text_content() or ""
    m = re.match(r"(\d+)/\d+ payslips · (\d+)/\d+ AVACs(?: · (\d+) skipped)?", counts_text, re.IGNORECASE)
    if not m:
        raise SystemExit(f"unexpected counts text: {counts_text!r}")
    payslips, avacs, skipped = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if shots_label == "desktop":  # only 4 committed PNGs total: one upload shot is enough
        page.screenshot(path=SHOTS / f"year-upload-{shots_label}.png", full_page=True)

    page.get_by_role("button", name="Analyse Files").click()
    page.wait_for_url(re.compile(r"/check/report/"), timeout=5 * 60_000)
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    total_s = time.monotonic() - t0

    read_fact = fact(page, "AVAC files read")
    if read_fact != f"{avacs} of {avacs}":
        problems.append(f"report says AVAC files read {read_fact!r}, expected {avacs} of {avacs}")
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
    with tempfile.TemporaryDirectory(prefix="checkpay-year-mock-") as mock_dir, sync_playwright() as pw:
        source = materialize(fake_files(), Path(mock_dir)) if args.mock else folder
        browser = pw.chromium.launch()
        viewports = [("desktop", 1280, 900)] + ([("mobile", 390, 844)] if args.mock else [])
        for label, w, h in viewports:
            context = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if args.mock else 1)
            page = context.new_page()
            if args.mock:
                install_mocks(page)
            result = run(page, source, label if args.mock else None)
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
