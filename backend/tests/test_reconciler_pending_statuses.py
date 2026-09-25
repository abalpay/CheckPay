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

    def test_page1_partial_payment_alone_does_not_mark_week_processed(self):
        # Page 1 paid only the routine 0.4h rostered block; the AVAC claim itself is not on any payslip yet.
        page1 = [adj("12.03.2025", units=0.4, amount=36.0, section="current_fortnight")]
        report = reconcile(build_expected("12.03.2025", units=2.4, amount=216.0), build_payslip(page1=page1))
        self.assertEqual(report.days[0].status, "NOT_ON_THIS_PAYSLIP")
        self.assertEqual(report.overall_status, "OK_WITH_ANOMALIES")

    def test_negative_page1_correction_of_expected_line_is_underpaid(self):
        page1 = [adj("12.03.2025", units=-1.0, amount=-90.0, section="current_fortnight")]
        report = reconcile(build_expected("12.03.2025"), build_payslip(page1=page1))
        self.assertEqual(report.days[0].status, "UNDERPAID")
        self.assertEqual(report.total_difference, -180.0)

    def test_page1_recall_paid_short_is_underpaid(self):
        page1 = [adj("12.03.2025", pay_type="Recall_-", units=2.0, amount=180.0, section="current_fortnight")]
        report = reconcile(build_expected("12.03.2025", pay_type="Recall_-", units=3.0, amount=270.0),
                           build_payslip(page1=page1))
        self.assertEqual(report.days[0].status, "UNDERPAID")
        self.assertEqual(report.total_difference, -90.0)

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

    def test_covered_net_negative_against_expected_is_underpaid(self):
        report = reconcile(build_expected("12.03.2025"), build_payslip(page2=[adj("12.03.2025", units=-1.0, amount=-90.0)]))
        self.assertEqual(report.days[0].matches[0].status, "UNDERPAID")
        self.assertEqual(report.total_difference, -180.0)

    def test_uncovered_net_negative_against_expected_needs_fortnight_payslip(self):
        report = reconcile(build_expected("12.03.2025"),
                           build_payslip(page2=[adj("12.03.2025", units=-1.0, amount=-90.0)], covered=[]))
        self.assertEqual(report.days[0].status, "NEEDS_FORTNIGHT_PAYSLIP")

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


    def test_uncovered_reversal_neutralises_only_reversed_types(self):
        exp = SimpleNamespace(employee_name="Dr Test", base_hourly_rate=60.0, days=[SimpleNamespace(
            date="12.02.2025", day_of_week="Wed", day_type="weekday",
            lines=[SimpleNamespace(type="Overtime_-_1.5", units=1.0, amount=90.0),
                   SimpleNamespace(type="Recall_-_T2.0", units=2.0, amount=240.0)])])
        report = reconcile(exp, build_payslip(page2=[adj("12.02.2025", units=-1.0, amount=-90.0),
                                                     adj("12.02.2025", "Recall_-_T2.0", 1.0, 120.0)]))
        by_type = {m.pay_type: m for m in report.days[0].matches}
        self.assertEqual(by_type["Overtime_-_1.5"].status, "NEEDS_FORTNIGHT_PAYSLIP")
        self.assertEqual(by_type["Recall_-_T2.0"].status, "UNDERPAID")
        self.assertEqual(report.total_difference, -120.0)
        self.assertEqual(report.overall_status, "DISCREPANCIES_FOUND")

    def test_uncovered_partial_underpayment_stays_actionable(self):
        report = reconcile(build_expected("12.02.2025"), build_payslip(page2=[adj("12.02.2025", units=0.5, amount=45.0)]))
        self.assertEqual(report.days[0].matches[0].status, "UNDERPAID")
        self.assertEqual(report.days[0].status, "UNDERPAID")
        self.assertEqual(report.total_difference, -45.0)

    def test_evidenced_missed_day_is_discrepancy(self):
        report = reconcile(build_expected("12.03.2025"), build_payslip(page2=[adj("11.03.2025")]))
        self.assertEqual(report.overall_status, "DISCREPANCIES_FOUND")

    def test_reversed_recall_line_is_not_absorbed_into_threshold_split(self):
        exp = SimpleNamespace(employee_name="Dr Test", base_hourly_rate=60.0, days=[SimpleNamespace(
            date="12.03.2025", day_of_week="Wed", day_type="weekday",
            lines=[SimpleNamespace(type="Recall_-", units=0.6, amount=54.0),
                   SimpleNamespace(type="Recall_-_T2.0", units=1.4, amount=168.0)])])
        report = reconcile(exp, build_payslip(page2=[adj("12.03.2025", "Recall_-", -0.6, -54.0),
                                                     adj("12.03.2025", "Recall_-_T2.0", 2.75, 330.0)]))
        neg = next(m for m in report.days[0].matches if m.pay_type == "Recall_-")
        self.assertNotEqual(neg.status, "THRESHOLD_SPLIT")
        self.assertNotEqual(report.days[0].status, "OK")


if __name__ == "__main__":
    unittest.main()


class InfoAndDayLabelTests(unittest.TestCase):
    def test_info_line_does_not_block_uncovered_all_missing(self):
        # Uncovered, processed week: the recall is wholly unpaid; an on-call allowance (INFO) sits on the same day.
        report = reconcile(build_expected("12.02.2025", pay_type="Recall_-", units=2.0, amount=180.0),
                           build_payslip(page2=[adj("11.02.2025"),
                                                adj("12.02.2025", pay_type="OCA_-_RMO_-_Level_4_to_13", amount=21.0)]))
        day = report.days[0]
        self.assertEqual(day.status, "NEEDS_FORTNIGHT_PAYSLIP")
        self.assertEqual(report.total_difference, 0.0)
        self.assertEqual({m.pay_type: m.status for m in day.matches},
                         {"Recall_-": "NEEDS_FORTNIGHT_PAYSLIP", "OCA_-_RMO_-_Level_4_to_13": "INFO"})

    def test_info_line_does_not_block_covered_issue_within_window(self):
        report = reconcile(build_expected("12.03.2025", pay_type="Recall_-", units=2.0, amount=180.0),
                           build_payslip(page2=[adj("11.03.2025"),
                                                adj("12.03.2025", pay_type="OCA_-_RMO_-_Level_4_to_13", amount=21.0)]))
        day = report.days[0]
        self.assertEqual(day.status, "ISSUE_WITHIN_WINDOW")
        self.assertEqual({m.pay_type: m.status for m in day.matches},
                         {"Recall_-": "ISSUE_WITHIN_WINDOW", "OCA_-_RMO_-_Level_4_to_13": "INFO"})
        self.assertEqual(report.total_difference, -180.0)

    def test_underpaid_day_with_reversal_is_labelled_underpaid(self):
        report = reconcile(build_expected("12.03.2025", pay_type="Recall_-", units=2.0, amount=180.0),
                           build_payslip(page2=[adj("12.03.2025", pay_type="Recall_-", units=1.0, amount=90.0),
                                                adj("12.03.2025", pay_type="Meal_Allowance", units=-1.0, amount=-16.8)]))
        self.assertEqual(report.days[0].status, "UNDERPAID")
        self.assertEqual(report.days[0].difference, -90.0)

    def test_reversal_only_day_is_never_ok(self):
        report = reconcile(build_expected("12.03.2025"),
                           build_payslip(page2=[adj("12.03.2025"),
                                                adj("12.03.2025", pay_type="Meal_Allowance", units=-1.0, amount=-16.8)]))
        self.assertEqual(report.days[0].status, "ANOMALY")
