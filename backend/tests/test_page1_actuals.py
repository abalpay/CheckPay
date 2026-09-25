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


def test_page1_meal_allowance_with_roster_ot_is_info():
    expected = calculate_expected(avac([recall_row("2025-03-05", "18:00", "20:00")]), RATE, page1_ot_by_date={"05.03.2025": 2.4})
    ps = build_payslip(
        page1=[AdjustmentLine(type="Overtime_-_1.5", date="05.03.2025", units=2.4, rate=90.0, amount=216.0, section="current_fortnight"),
               AdjustmentLine(type="Meal_Allowance", date="05.03.2025", units=1.0, rate=16.0, amount=16.0, section="current_fortnight")],
        page2=[AdjustmentLine(type="Recall_-", date="05.03.2025", units=0.6, rate=90.0, amount=54.0, section="previous_4"),
               AdjustmentLine(type="Recall_-_T2.0", date="05.03.2025", units=1.4, rate=120.0, amount=168.0, section="previous_4")],
        covered=["05.03.2025"])
    report = reconcile(expected, ps)
    statuses = {m.pay_type: m.status for m in report.days[0].matches}
    assert statuses["Meal_Allowance"] == "INFO"
    assert "meal allowance" in next(m.notes for m in report.days[0].matches if m.pay_type == "Meal_Allowance").lower()
    assert report.overall_status == "ALL_MATCH"


def test_negative_page1_roster_ot_without_avac_roster_row_is_reversal():
    expected = calculate_expected(avac([recall_row("2025-03-05", "18:00", "20:00")]), RATE, page1_ot_by_date={"05.03.2025": -2.4})
    ps = build_payslip(
        page1=[AdjustmentLine(type="Overtime_-_1.5", date="05.03.2025", units=-2.4, rate=90.0, amount=-216.0, section="current_fortnight")],
        covered=["05.03.2025"])
    report = reconcile(expected, ps)
    statuses = {m.pay_type: m.status for m in report.days[0].matches}
    assert statuses["Overtime_-_1.5"] == "REVERSAL"
