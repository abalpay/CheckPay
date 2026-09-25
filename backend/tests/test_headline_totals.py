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


def test_pure_correction_is_a_reversal_with_its_own_counter():
    exp = expected({"05.03.2025": []})
    ps = payslip([("05.03.2025", "Overtime_-_1.5", -1.0, -90.0)])
    ps.covered_dates = ["05.03.2025"]  # uncovered reversals are NEEDS_FORTNIGHT_PAYSLIP (Rule 9.3)
    report = reconcile(exp, ps)
    assert report.days[0].matches[0].status == "REVERSAL"
    assert report.reversal_count == 1 and report.unmatched_count == 0
    assert report.overall_status == "OK_WITH_ANOMALIES"
    assert report.total_difference == 0.0
    assert report.days[0].status != "OK"


def test_expected_line_reversed_is_an_underpayment():
    exp = expected({"05.03.2025": [("Overtime_-_1.5", 1.0, 90.0)]})
    ps = payslip([("05.03.2025", "Overtime_-_1.5", -1.0, -90.0)])
    ps.covered_dates = ["05.03.2025"]
    report = reconcile(exp, ps)
    line = report.days[0].matches[0]
    assert line.status == "UNDERPAID" and "revers" in line.notes.lower()
    assert report.reversal_count == 0
    assert report.days[0].difference == report.total_difference == -180.0


def test_page2_reversal_of_page1_payment_keeps_the_shortfall():
    exp = expected({"05.03.2025": [("Overtime_-_1.5", 2.0, 180.0)]})
    ps = payslip([("05.03.2025", "Overtime_-_1.5", -2.0, -180.0)])
    ps.covered_dates = ["05.03.2025"]
    ps.page1_lines = [SimpleNamespace(section="current_fortnight", date="05.03.2025",
                                      type="Overtime_-_1.5", units=1.0, amount=90.0)]
    report = reconcile(exp, ps)
    line = report.days[0].matches[0]
    assert line.status == "UNDERPAID"
    assert report.days[0].difference == report.total_difference == -270.0
    assert report.overall_status == "DISCREPANCIES_FOUND"


def test_threshold_excess_not_double_counted():
    exp = expected({"05.03.2025": [("Recall_-", 0.6, 54.0), ("Recall_-_T2.0", 1.4, 168.0)]})
    ps = payslip([("05.03.2025", "Recall_-_T2.0", 2.0, 240.0)])
    ps.covered_dates = ["05.03.2025"]
    report = reconcile(exp, ps)
    assert report.informational_difference == 18.0
    assert round(report.total_actual - report.total_expected, 2) == round(
        report.total_difference + report.informational_difference, 2)


def test_match_lines_within_tolerance_do_not_accumulate():
    exp = expected({"05.03.2025": [("Overtime_-_1.5", 1.0, 90.0), ("Overtime_-_2.0", 1.0, 120.0),
                                   ("Recall_-_T2.0", 1.0, 120.0)]})
    ps = payslip([("05.03.2025", "Overtime_-_1.5", 1.0, 90.08), ("05.03.2025", "Overtime_-_2.0", 1.0, 120.08),
                  ("05.03.2025", "Recall_-_T2.0", 1.0, 120.08)])
    ps.covered_dates = ["05.03.2025"]
    report = reconcile(exp, ps)
    assert report.days[0].status == "OK"
    assert report.overall_status == "ALL_MATCH"
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
