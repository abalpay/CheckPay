import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from reconciler import reconcile


def build_expected(date: str):
    line = SimpleNamespace(type="Overtime_-_1.5", units=1.0, amount=100.0)
    day = SimpleNamespace(date=date, day_of_week="Mon", day_type="weekday", lines=[line])
    return SimpleNamespace(employee_name="Dr Test", base_hourly_rate=60.5, days=[day])


def build_payslip(
    adjustment_dates,
    *,
    pay_date: str = "24.06.2025",
    period_end: str = "22.06.2025",
):
    adjustments = [
        SimpleNamespace(
            section="previous_4",
            date=date,
            type="Overtime_-_1.5",
            units=1.0,
            amount=100.0,
        )
        for date in adjustment_dates
    ]
    return SimpleNamespace(
        employee=SimpleNamespace(pay_date=pay_date),
        current_fortnight=SimpleNamespace(period_end=period_end),
        adjustments=adjustments,
        is_overpayment_payslip=False,
        overpayment_amount=0.0,
        adjustment_total=0.0,
        adjustment_subtotal_older=0.0,
    )


class ReconcilerPendingStatusTests(unittest.TestCase):
    def test_classifies_missing_before_window_as_check_previous(self):
        expected = build_expected("16.06.2025")
        payslip = build_payslip(["17.06.2025", "20.06.2025"])

        report = reconcile(expected, payslip)

        self.assertEqual(report.days[0].status, "CHECK_PREVIOUS")
        self.assertEqual(report.check_previous_count, 1)
        self.assertEqual(report.check_future_count, 0)
        self.assertEqual(report.within_window_issue_count, 0)
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")

    def test_classifies_missing_after_scope_as_check_future(self):
        expected = build_expected("24.06.2025")
        payslip = build_payslip(["17.06.2025", "20.06.2025"], period_end="22.06.2025")

        report = reconcile(expected, payslip)

        self.assertEqual(report.days[0].status, "CHECK_FUTURE")
        self.assertEqual(report.check_previous_count, 0)
        self.assertEqual(report.check_future_count, 1)
        self.assertEqual(report.within_window_issue_count, 0)
        self.assertEqual(report.not_yet_paid_count, 1)  # legacy alias remains populated
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")

    def test_classifies_missing_within_window_as_issue(self):
        expected = build_expected("18.06.2025")
        payslip = build_payslip(["17.06.2025", "20.06.2025"], period_end="22.06.2025")

        report = reconcile(expected, payslip)

        self.assertEqual(report.days[0].status, "ISSUE_WITHIN_WINDOW")
        self.assertEqual(report.check_previous_count, 0)
        self.assertEqual(report.check_future_count, 0)
        self.assertEqual(report.within_window_issue_count, 1)
        self.assertEqual(report.possibly_missed_count, 1)  # legacy alias remains populated
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")

    def test_falls_back_to_window_when_period_metadata_missing(self):
        expected = build_expected("24.06.2025")
        payslip = build_payslip(
            ["17.06.2025", "20.06.2025"],
            pay_date="",
            period_end="",
        )

        report = reconcile(expected, payslip)

        self.assertEqual(report.days[0].status, "CHECK_FUTURE")
        self.assertEqual(report.check_future_count, 1)


if __name__ == "__main__":
    unittest.main()
