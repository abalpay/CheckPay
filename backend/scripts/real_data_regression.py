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
