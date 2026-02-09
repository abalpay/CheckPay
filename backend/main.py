"""
Checkpay — FastAPI Backend
Wraps the tested engine modules in a single API endpoint.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import tempfile
import os

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
