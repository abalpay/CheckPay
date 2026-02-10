"""
Checkpay — FastAPI Backend
Wraps the tested engine modules in a single API endpoint.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import tempfile
import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from payslip_parser import parse_payslip
from avac_parser import parse_avac
from rules_engine import calculate_expected
from reconciler import reconcile

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_AVAC_FILES = 10

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Checkpay API")
app.state.limiter = limiter

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        {"error": "Too many requests. Please try again later."},
        status_code=429,
    )


NON_ACTIONABLE = {"MATCH", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS", "INFO", "NOT_YET_PAID"}

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
        "not_yet_paid_count": report.not_yet_paid_count,
        "possibly_missed_count": report.possibly_missed_count,
        "earliest_adjustment_date": report.earliest_adjustment_date,
        "latest_adjustment_date": report.latest_adjustment_date,
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
@limiter.limit("20/minute")
async def reconcile_endpoint(
    request: Request,
    payslip: UploadFile = File(...),
    avacs: List[UploadFile] = File(...),
):
    # Validate file count
    if len(avacs) > MAX_AVAC_FILES:
        raise HTTPException(400, f"Too many AVAC files. Maximum is {MAX_AVAC_FILES}.")

    # Validate file sizes
    for f in [payslip, *avacs]:
        if f.size and f.size > MAX_FILE_SIZE:
            raise HTTPException(400, "File exceeds the 5 MB size limit.")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Save payslip
        ps_path = os.path.join(tmpdir, payslip.filename or "payslip.pdf")
        with open(ps_path, "wb") as f:
            f.write(await payslip.read())

        # Parse payslip
        try:
            ps = parse_payslip(ps_path)
        except Exception as e:
            print(f"Payslip parse error: {e}")
            raise HTTPException(400, "Could not parse the payslip. Please check the file and try again.")

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
                print(f"AVAC parse error ({avac_file.filename}): {e}")
                avac_results.append({
                    "avac_name": avac_file.filename,
                    "error": "Could not process this AVAC file.",
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
