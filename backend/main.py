"""
Checkpay — FastAPI Backend
Wraps the tested engine modules in a single API endpoint.
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing import List
from datetime import datetime, timedelta
import tempfile
import os

from payslip_parser import (parse_payslip, page1_overtime_by_date, payslip_to_dict, payslip_from_dict,
                            merge_payslips, unique_payslips)
from avac_parser import parse_avac, detect_breaks_across, validate_avac_dict, AvacFormatError
from rules_engine import calculate_expected, holidays_for
from reconciler import reconcile, has_positive_ot, pending_outstanding

MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB (Vercel body limit is 4.5 MB)
MAX_AVAC_FILES = 10
MAX_PAYSLIP_FILES = 8
MAX_JSON_BODY = 3 * 1024 * 1024  # keeps every request under the Vercel limit

app = FastAPI(title="Checkpay API")


NON_ACTIONABLE = {"MATCH", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS", "INFO"}


def report_to_frontend(report, warnings: list[str] = ()) -> dict:
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
        "check_previous_count": report.check_previous_count,
        "check_future_count": report.check_future_count,
        "not_on_this_payslip_count": report.not_on_this_payslip_count,
        "needs_fortnight_payslip_count": report.needs_fortnight_payslip_count,
        "within_window_issue_count": report.within_window_issue_count,
        "not_yet_paid_count": report.not_yet_paid_count,
        "possibly_missed_count": report.possibly_missed_count,
        "earliest_adjustment_date": report.earliest_adjustment_date,
        "latest_adjustment_date": report.latest_adjustment_date,
        "total_expected": report.total_expected,
        "total_actual": report.total_actual,
        "total_difference": report.total_difference,
        "reversal_count": report.reversal_count,
        "informational_difference": report.informational_difference,
        "pending_expected_total": report.pending_expected_total,
        "warnings": list(warnings),
        "days": days,
        "actionable_items": actionable_items,
        "older_adjustments": older,
        "older_adjustments_total": report.older_adjustments_total,
        "unmatched_payslip_entries": unmatched,
    }


def _correction_response(ps) -> dict:
    return {"status": "correction_payslip", "employee": ps.employee.name, "pay_date": ps.employee.pay_date,
            "pay_period_start": ps.current_fortnight.period_start, "pay_period_end": ps.current_fortnight.period_end,
            "message": "This payslip contains only corrections/reversals from previous pay periods. There are no new overtime or recall payments to verify against AVACs.",
            "adjustment_total": ps.adjustment_total, "overpayment_amount": ps.overpayment_amount, "avac_results": []}


def _pay_dt(ps):
    try:
        return datetime.strptime(ps.employee.pay_date, "%d.%m.%Y")
    except ValueError:
        return None


def _unpaid_weeks(results: list, as_of) -> list:
    """Weeks with lines not on any uploaded payslip (covered or not). Listed only, never escalated (P3)."""
    out = {}
    for r in results:
        for day in (r.get("report") or {}).get("days", []):
            # outstanding = expected minus whatever page 1 already paid of that line
            amount = sum(pending_outstanding(i["expected_amount"], i["actual_amount"])
                         for i in day["items"] if i["status"] == "NOT_ON_THIS_PAYSLIP")
            if not amount:
                continue
            dt = datetime.strptime(day["date"], "%d.%m.%Y")
            key = (dt - timedelta(days=dt.weekday()), r["avac_name"])
            out[key] = out.get(key, 0.0) + amount
    return [{"week_start": w.strftime("%d.%m.%Y"), "avac_name": n, "expected_total": round(t, 2),
             "age_days": (as_of - w).days if as_of else None}  # days from week start to the latest pay date
            for (w, n), t in sorted(out.items())]


def _avac_dates(avacs: list) -> set:
    out = set()
    for _, a in avacs:
        for s in a.get("shifts", []):
            try:
                out.add(datetime.strptime(s.get("date_iso") or "", "%Y-%m-%d").strftime("%d.%m.%Y"))
            except ValueError:
                pass
    return out


def run_reconciliation(payslips: list, avacs: list) -> dict:
    """Deterministic core shared by every endpoint. avacs = [(display name, parse_avac() dict)]."""
    dates = _avac_dates(avacs)
    if all(p.is_overpayment_payslip and not has_positive_ot(p, dates) for p in payslips):
        return _correction_response(merge_payslips(payslips))  # only an all-correction upload short-circuits (P5)
    ps = merge_payslips(payslips)
    detect_breaks_across([s for _, a in avacs for s in a.get("shifts", [])])  # previous week's last shift counts
    page1_ot = page1_overtime_by_date(ps)
    results = []
    for name, avac_data in avacs:
        try:
            expected = calculate_expected(avac_data, ps.base_hourly_rate,
                                           public_holidays=holidays_for(avac_data, ps.locality),
                                           page1_ot_by_date=page1_ot)
            results.append({"avac_name": name,
                             "report": report_to_frontend(reconcile(expected, ps), warnings=expected.warnings)})
        except Exception as e:  # one bad AVAC must not sink the others
            print(f"AVAC reconcile error ({name}): {e!r}")
            results.append({"avac_name": name, "error": "Could not process this AVAC file."})
    return {"status": "ok", "employee": ps.employee.name, "pay_date": ps.employee.pay_date,
            "pay_period_start": ps.current_fortnight.period_start, "pay_period_end": ps.current_fortnight.period_end,
            "base_rate": ps.base_hourly_rate, "is_overpayment_payslip": ps.is_overpayment_payslip,
            "adjustment_total": ps.adjustment_total, "avac_results": results,
            "older_adjustments_total": ps.adjustment_subtotal_older,
            "payslips": [{"pay_date": p.employee.pay_date, "period_start": p.current_fortnight.period_start,
                          "period_end": p.current_fortnight.period_end}
                         for p in unique_payslips(sorted(payslips, key=lambda p: _pay_dt(p) or datetime.min))],
            "unpaid_weeks": _unpaid_weeks(results, _pay_dt(ps))}


class ParsedAvacIn(BaseModel):
    name: str
    data: dict

    @field_validator("name")
    @classmethod
    def _short_name(cls, v: str) -> str:
        return v[:200]  # a long filename is shortened for display, never a reason to fail the run


class ReconcileJsonIn(BaseModel):
    payslips: list = Field(min_length=1, max_length=MAX_PAYSLIP_FILES)
    avacs: list[ParsedAvacIn] = Field(min_length=1, max_length=MAX_AVAC_FILES)


@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...), kind: str = Form(...)):
    """Phase 1: one PDF in, its parsed JSON out."""
    if kind not in ("payslip", "avac"):
        raise HTTPException(400, "kind must be 'payslip' or 'avac'.")
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds the 4 MB size limit.")
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "upload.pdf")
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, "File exceeds the 4 MB size limit.")
        with open(path, "wb") as f:
            f.write(content)
        try:
            data = payslip_to_dict(parse_payslip(path)) if kind == "payslip" else parse_avac(path)
        except AvacFormatError as e:
            raise HTTPException(400, e.user_message)
        except Exception as e:
            print(f"{kind} parse error: {e}")
            raise HTTPException(400, "Could not parse the payslip. Please check the file and try again."
                                if kind == "payslip" else "Could not process this AVAC file.")
    return {"kind": kind, "name": file.filename, "data": data}


@app.middleware("http")
async def limit_json_body(request: Request, call_next):
    if request.url.path == "/api/reconcile/json":
        try:
            too_big = int(request.headers.get("content-length") or 0) > MAX_JSON_BODY
        except ValueError:
            too_big = True
        if too_big:
            return JSONResponse({"detail": "Request body exceeds the 3 MB limit."}, status_code=400)
    return await call_next(request)


@app.post("/api/reconcile/json")
async def reconcile_json_endpoint(body: ReconcileJsonIn):
    """Phase 2: every parsed payslip and AVAC in one deterministic call."""
    try:
        payslips = [payslip_from_dict(p) for p in body.payslips]
        avacs = [(a.name, validate_avac_dict(a.data)) for a in body.avacs]
    except ValueError as e:
        raise HTTPException(400, f"Invalid parsed data: {e}")
    return run_reconciliation(payslips, avacs)


@app.post("/api/reconcile")
async def reconcile_endpoint(
    payslip: UploadFile = File(...),
    avacs: List[UploadFile] = File(...),
):
    # Validate file count
    if len(avacs) > MAX_AVAC_FILES:
        raise HTTPException(400, f"Too many AVAC files. Maximum is {MAX_AVAC_FILES}.")

    # Validate file sizes
    for f in [payslip, *avacs]:
        if f.size and f.size > MAX_FILE_SIZE:
            raise HTTPException(400, "File exceeds the 4 MB size limit.")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Save payslip
        ps_path = os.path.join(tmpdir, "payslip.pdf")
        with open(ps_path, "wb") as f:
            f.write(await payslip.read())

        # Parse payslip
        try:
            ps = parse_payslip(ps_path)
        except Exception as e:
            print(f"Payslip parse error: {e}")
            raise HTTPException(400, "Could not parse the payslip. Please check the file and try again.")

        # Parse each AVAC; failures are reported per file in upload order
        parsed, errors = [], {}
        for i, avac_file in enumerate(avacs):
            avac_path = os.path.join(tmpdir, f"avac_{i}.pdf")
            with open(avac_path, "wb") as f:
                f.write(await avac_file.read())
            try:
                parsed.append((avac_file.filename, parse_avac(avac_path)))
            except AvacFormatError as e:
                errors[i] = e.user_message
            except Exception as e:
                print(f"AVAC parse error ({avac_file.filename}): {e}")
                errors[i] = "Could not process this AVAC file."

        response = run_reconciliation([ps], parsed)
        if response["status"] != "ok":
            return response
        ok = iter(response["avac_results"])
        response["avac_results"] = [
            {"avac_name": f.filename, "error": errors[i]} if i in errors else next(ok)
            for i, f in enumerate(avacs)
        ]
        return response
