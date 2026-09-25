"""
Checkpay — Reconciler
======================
Compares expected (Rules Engine) vs actual (Payslip Parser) entries.
"""

import json, sys
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict

ROUNDING_TOLERANCE = 0.10

# Recall-related types that share the OT threshold and should be compared as a group
RECALL_TYPES = frozenset({
    'Recall_-', 'Recall_-_T2.0', 'Recall_-_T2.5',
    'Recall_Guaranteed_Hrs_2.0',
    'Recall_Offsite_1.5', 'Recall_Offsite_2.0',
})

@dataclass
class MatchResult:
    date: str = ""
    day_of_week: str = ""
    pay_type: str = ""
    expected_units: float = 0.0
    actual_units: float = 0.0
    expected_amount: float = 0.0
    actual_amount: float = 0.0
    difference: float = 0.0
    status: str = ""
    notes: str = ""

@dataclass
class DaySummary:
    date: str = ""
    day_of_week: str = ""
    day_type: str = ""
    matches: list = field(default_factory=list)
    expected_total: float = 0.0
    actual_total: float = 0.0
    difference: float = 0.0
    status: str = ""

@dataclass
class ReconciliationReport:
    employee_name: str = ""
    pay_date: str = ""
    base_hourly_rate: float = 0.0
    days: list = field(default_factory=list)
    unmatched_payslip: list = field(default_factory=list)
    total_expected: float = 0.0
    total_actual: float = 0.0
    total_difference: float = 0.0
    match_count: int = 0
    discrepancy_count: int = 0
    missing_count: int = 0
    unmatched_count: int = 0
    reversal_count: int = 0
    informational_difference: float = 0.0   # INFO + THRESHOLD_* + REVERSAL, shown but not owed
    pending_expected_total: float = 0.0     # expected $ on days whose payslip is not uploaded yet
    # Legacy counters (kept for backward compatibility)
    not_yet_paid_count: int = 0      # Legacy alias for check_future_count
    possibly_missed_count: int = 0   # Legacy alias for within_window_issue_count
    # Pending / follow-up counters
    check_previous_count: int = 0
    check_future_count: int = 0
    within_window_issue_count: int = 0
    not_on_this_payslip_count: int = 0
    needs_fortnight_payslip_count: int = 0
    overall_status: str = ""
    # Page-2 adjustment date range (shown in the UI only)
    earliest_adjustment_date: str = ""   # e.g. "10.03.2025"
    latest_adjustment_date: str = ""     # e.g. "27.04.2025"
    # Overpayment / clawback info
    is_overpayment_payslip: bool = False
    overpayment_amount: float = 0.0         # net overpayment to be repaid
    adjustment_total: float = 0.0           # gross adjustment total (negative for clawbacks)
    # Older adjustments that can't be reconciled to specific AVACs
    older_adjustments_total: float = 0.0
    older_adjustments: list = field(default_factory=list)  # list of MatchResult


def normalize_type(pay_type: str) -> str:
    """Normalize pay type names so equivalent types match.
    Payroll uses slightly different names for the same concept."""
    equivalences = {
        "Fatigue_Leave": "Fatigue_Penalty_@1.0",
    }
    return equivalences.get(pay_type, pay_type)


# Types that appear on payslips but aren't predicted by the AVAC engine.
# These are standard allowances/loadings, not discrepancies.
INFORMATIONAL_TYPES = frozenset({
    'OCA_-_RMO_-_Level_4_to_13',     # On-call allowance (paid based on roster, not AVAC)
    'Shift_-_Sat_Loading_-_50%',      # Weekend loading (reversal payslips)
    'Shift-Sunday_Loading-100%',      # Weekend loading (reversal payslips)
    'Public_Holiday_-_50%',           # PH loading — payroll adds on PH days, not in AVAC
    'Public_Holiday_-_150%',          # PH loading — payroll adds on PH days, not in AVAC
    'Stand_Down_Leave',               # PH leave adjustment — always a reversal/admin entry
    'Fortnightly_Salary',             # Base salary adjustment — not OT-related
})

ACTIONABLE_STATUSES = frozenset({"UNDERPAID", "OVERPAID", "MISSING", "UNMATCHED", "ISSUE_WITHIN_WINDOW"})
NON_ACTIONABLE_STATUSES = frozenset({"INFO", "THRESHOLD_SPLIT", "THRESHOLD_EXCESS", "REVERSAL"})
PENDING_STATUSES = frozenset({"NOT_ON_THIS_PAYSLIP", "NEEDS_FORTNIGHT_PAYSLIP"})


def _consolidate_recall_threshold_splits(report, base_rate):
    """Post-process recall entries to handle OT threshold splitting.
    
    When the date is covered by an uploaded payslip, page-1 rostered OT seeds the 3h threshold
    exactly. On an uncovered date the AVAC doesn't record regular rostered shifts, so the engine
    can't know how much of the threshold was consumed before a recall, which causes mismatches where:
      - Engine expects Recall_- (1.5×) for threshold portion
      - Payslip shows all at Recall_-_T2.0 (threshold already consumed)
      - NET total is higher because 2.0× > 1.5×
    
    This function detects that pattern and reclassifies individual line
    mismatches as THRESHOLD_SPLIT (informational), replacing them with a
    single NET comparison per date.
    """
    for day in report.days:
        # Find recall-type mismatches on this day
        recall_mismatches = [
            m for m in day.matches
            if m.pay_type in RECALL_TYPES and m.status not in ('MATCH', 'REVERSAL')
            and m.actual_units >= 0  # a reversed recall line is a payroll correction, never a threshold split
        ]
        
        if len(recall_mismatches) < 2:
            continue  # Need at least 2 to be a threshold split pattern
        
        # Check for the threshold split pattern:
        # Some lines MISSING/UNDERPAID (engine expected 1.5× portion)
        # Some lines OVERPAID/UNMATCHED (payslip has more at 2.0×)
        has_under = any(m.status in ('MISSING', 'UNDERPAID') for m in recall_mismatches)
        has_over = any(m.status in ('OVERPAID', 'UNMATCHED') for m in recall_mismatches)
        
        if not (has_under and has_over):
            continue  # Not a threshold split pattern
        
        # Calculate NET across all recall types
        net_expected = sum(m.expected_amount for m in recall_mismatches)
        net_actual = sum(m.actual_amount for m in recall_mismatches)
        net_diff = net_actual - net_expected
        
        # Threshold consumption should produce a POSITIVE net diff
        # (shifting hours from 1.5× to 2.0× increases total pay)
        # Allow small negative for rounding
        if net_diff < -1.0:
            continue  # Not a threshold split — something else is wrong
        
        # Reclassify individual mismatches
        for m in recall_mismatches:
            old_status = m.status
            # Adjust counters
            if old_status in ('OVERPAID', 'UNDERPAID'):
                report.discrepancy_count -= 1
            elif old_status == 'MISSING':
                report.missing_count -= 1
            elif old_status == 'UNMATCHED':
                report.unmatched_count -= 1
            
            m.status = "THRESHOLD_SPLIT"
            m.notes = (
                f"OT threshold split (was {old_status}). "
                f"Rostered OT consumed threshold before recall. "
                f"Day recall NET: exp=${net_expected:.2f} act=${net_actual:.2f} diff=${net_diff:+.2f}"
            )
            report.match_count += 1  # Count as informational match
        
        # If NET diff is significant, add a summary entry
        if abs(net_diff) > ROUNDING_TOLERANCE:
            # Positive NET diff means payslip pays MORE (threshold consumed by rostered OT)
            # This is expected, not an error — mark as informational
            summary = MatchResult(
                date=day.date, day_of_week=day.day_of_week,
                pay_type="Recall_NET_Total",
                expected_units=0, actual_units=0,
                expected_amount=round(net_expected, 2),
                actual_amount=round(net_actual, 2),
                difference=round(net_diff, 2),
                status="THRESHOLD_EXCESS" if net_diff > ROUNDING_TOLERANCE else "MATCH",
                notes=f"Payslip pays ${abs(net_diff):.2f} more — rostered OT consumed ≈ {net_diff / (base_rate * 0.5):.1f}h of threshold before recall"
            )
            # THRESHOLD_EXCESS is informational, not a discrepancy
            report.match_count += 1
            day.matches.append(summary)


OT_KEYWORDS = ("overtime", "recall", "fatigue", "public_holiday")


def has_positive_ot(payslip_data, avac_dates=()) -> bool:
    """Any positive dated OT-type line on page 2, or on page 1 dated on an AVAC date: then the payslip
    is not correction-only. Page 1 always pays the fortnight's routine rostered OT, so only page-1 lines
    on the uploaded AVAC's dates are evidence to verify."""
    lines = [a for a in payslip_data.adjustments if a.section != "adjustment_only"]
    lines += [a for a in getattr(payslip_data, "page1_lines", []) or [] if a.date in avac_dates]
    return any(a.amount > 0 and a.date and any(kw in a.type.lower() for kw in OT_KEYWORDS) for a in lines)


def pending_outstanding(expected_amount, actual_amount) -> float:
    """What a pending line still owes: expected minus what was already paid (a reversal owes nothing)."""
    return max(0.0, expected_amount - max(actual_amount, 0.0))


def _week_start(dt):
    return dt - timedelta(days=dt.weekday())


def _parse_payslip_date(d):
    try:
        return datetime.strptime(d, "%d.%m.%Y")
    except (TypeError, ValueError):
        return None


def _fortnight_hint(payslip_data, date_dt):
    """(start, end, pay_date) of the fortnight containing date_dt, extrapolated from the uploaded payslip grid."""
    anchors = getattr(payslip_data, "fortnights", None) or []
    parsed = [(_parse_payslip_date(a["start"]), _parse_payslip_date(a["end"]), _parse_payslip_date(a["pay_date"])) for a in anchors]
    parsed = [p for p in parsed if all(p)]
    if not parsed:
        return None
    for s, e, p in parsed:
        if s <= date_dt <= e:
            return s, e, p
    s, e, p = parsed[0]
    k = (date_dt - s).days // 14
    return s + timedelta(days=14 * k), e + timedelta(days=14 * k), p + timedelta(days=14 * k)


_COUNTER_FOR = {"MISSING": "missing_count", "UNDERPAID": "discrepancy_count", "OVERPAID": "discrepancy_count",
                "UNMATCHED": "unmatched_count", "REVERSAL": "reversal_count"}
_PENDING_COUNTER = {"NOT_ON_THIS_PAYSLIP": "not_on_this_payslip_count",
                    "NEEDS_FORTNIGHT_PAYSLIP": "needs_fortnight_payslip_count",
                    "ISSUE_WITHIN_WINDOW": "within_window_issue_count"}


def _reclassify(report, day, matches, status, note):
    for m in matches:
        old = _COUNTER_FOR.get(m.status)
        if old:
            setattr(report, old, getattr(report, old) - 1)
        m.status = status
        m.notes = note
        setattr(report, _PENDING_COUNTER[status], getattr(report, _PENDING_COUNTER[status]) + 1)
    if not any(m.status in ACTIONABLE_STATUSES and m.status != status for m in day.matches):
        day.status = status  # a day with lines still actionable keeps its own status (set in _finalize)


def _classify_pending_days(report, payslip_data, page2_dates, covered):
    """Rule 9: is an unmet expectation actionable?

    processed week = payroll produced something for the AVAC's Mon–Sun week (a page-2 line dated in
                     it, or a page-1 line that met an expected type).
    covered date   = an uploaded payslip's fortnight contains the date, so page 1 is in evidence.
    Never declare a day unpaid unless the payslip that could have paid it is in evidence.
    """
    processed = set()
    for d in page2_dates:
        dt = _parse_payslip_date(d)
        if dt:
            processed.add(_week_start(dt))
    for day in report.days:
        dt = _parse_payslip_date(day.date)
        # A page-1 partial Overtime payment is only the routine rostered block, not payroll processing the
        # AVAC week. A negative correction or a short non-Overtime line is evidenced payroll action.
        if dt and any(m.status in ("MATCH", "OVERPAID")
                      or (m.status == "UNDERPAID" and (m.actual_units < 0 or not m.pay_type.startswith("Overtime")))
                      for m in day.matches):
            processed.add(_week_start(dt))

    for day in report.days:
        dt = _parse_payslip_date(day.date)
        if not dt:
            continue
        unmet = [m for m in day.matches if m.status in ("MISSING", "UNDERPAID")]
        reversed_types = {m.pay_type for m in day.matches
                          if m.status == "REVERSAL" or (m.status == "UNDERPAID" and m.actual_units < 0)}
        has_reversal = bool(reversed_types)
        missing = [m for m in day.matches if m.status == "MISSING"]
        # An INFO line (e.g. the on-call allowance that accompanies a recall) does not count as a payment.
        all_missing = bool(missing) and all(m.status in ("MISSING", "INFO") for m in day.matches)
        if _week_start(dt) not in processed:
            if unmet:
                _reclassify(report, day, unmet, "NOT_ON_THIS_PAYSLIP",
                            f"The week of {_week_start(dt):%d.%m.%Y} is not on the uploaded payslip(s). "
                            f"Payment usually appears on a payslip dated 3–10 weeks after the AVAC week.")
        elif day.date not in covered and (all_missing or has_reversal):
            hint = _fortnight_hint(payslip_data, dt)
            where = (f"the payslip for fortnight {hint[0]:%d.%m.%Y}–{hint[1]:%d.%m.%Y} (pay date about {hint[2]:%d.%m.%Y})"
                     if hint else "the payslip for the fortnight containing this date")
            # Only what the missing page 1 could explain: reversed types and wholly missing lines.
            # A partial payment of another type is still an actionable shortfall.
            targets = [m for m in day.matches
                       if m.status in ("REVERSAL", "MISSING") or (m.pay_type in reversed_types and m.status != "INFO")]
            _reclassify(report, day, targets, "NEEDS_FORTNIGHT_PAYSLIP",
                        f"Rostered pay for {day.date} would be on {where}, which is not uploaded. "
                        f"Upload it and re-run to verify this day.")
        elif all_missing:
            _reclassify(report, day, missing, "ISSUE_WITHIN_WINDOW",
                        f"Payroll processed other days of this week but nothing for {day.date}. "
                        f"Ask payroll why this date was not paid.")


def _finalize(report):
    """Day statuses, one actionable amount per day, report totals, overall status."""
    for day in report.days:
        if day.status in PENDING_STATUSES:
            day.difference = round(day.actual_total - day.expected_total, 2)
            continue
        day.difference = round(sum(m.difference for m in day.matches if m.status in ACTIONABLE_STATUSES), 2)
        if day.status == "ISSUE_WITHIN_WINDOW":
            continue
        if abs(day.difference) <= ROUNDING_TOLERANCE:
            # never OK after a reversal: a correction happened even if nothing is owed
            day.status = "ANOMALY" if any(m.status == "REVERSAL" for m in day.matches) else "OK"
        elif day.difference < 0:
            day.status = "UNDERPAID"
        else:
            day.status = "OVERPAID"

    report.total_expected = round(sum(d.expected_total for d in report.days), 2)
    report.total_actual = round(sum(d.actual_total for d in report.days), 2)
    report.total_difference = round(sum(d.difference for d in report.days if d.status not in PENDING_STATUSES), 2)
    report.informational_difference = round(sum(
        m.difference for d in report.days for m in d.matches
        if m.status in NON_ACTIONABLE_STATUSES and m.pay_type != "Recall_NET_Total"), 2)  # NET line restates its splits
    report.pending_expected_total = round(sum(
        pending_outstanding(m.expected_amount, m.actual_amount)
        for d in report.days for m in d.matches if m.status in PENDING_STATUSES), 2)
    report.check_future_count = report.not_on_this_payslip_count
    report.not_yet_paid_count = report.not_on_this_payslip_count
    report.possibly_missed_count = report.within_window_issue_count

    if report.discrepancy_count or report.missing_count or report.within_window_issue_count:
        report.overall_status = "DISCREPANCIES_FOUND"
    elif (report.unmatched_count or report.reversal_count
          or report.not_on_this_payslip_count or report.needs_fortnight_payslip_count):
        report.overall_status = "OK_WITH_ANOMALIES"
    else:
        report.overall_status = "ALL_MATCH"


def reconcile(expected_result, payslip_data, avac_dates_only=True):
    report = ReconciliationReport()
    report.employee_name = expected_result.employee_name
    report.pay_date = payslip_data.employee.pay_date
    report.base_hourly_rate = expected_result.base_hourly_rate

    # Populate overpayment info from payslip (before any matching)
    report.is_overpayment_payslip = getattr(payslip_data, 'is_overpayment_payslip', False)
    report.overpayment_amount = getattr(payslip_data, 'overpayment_amount', 0.0)
    report.adjustment_total = getattr(payslip_data, 'adjustment_total', 0.0)

    # Populate older adjustments (> previous 4 pay periods)
    older_total = getattr(payslip_data, 'adjustment_subtotal_older', 0.0)
    if older_total != 0:
        report.older_adjustments_total = older_total
    for adj in payslip_data.adjustments:
        if adj.section == "adjustment_only":
            report.older_adjustments.append(MatchResult(
                date="(older)", pay_type=adj.type,
                actual_amount=adj.amount, status="ADJUSTMENT",
                notes=f"Older period adjustment: ${adj.amount:.2f}"
            ))

    # A pure overpayment/correction payslip with no positive OT-type line (page 1 or 2)
    # has nothing to verify against AVACs.
    if report.is_overpayment_payslip and not has_positive_ot(payslip_data, {d.date for d in expected_result.days}):
        report.overall_status = "CORRECTION_PAYSLIP"
        return report

    avac_dates = {d.date for d in expected_result.days}

    expected_by_date = {}
    expected_day_info = {}
    for day in expected_result.days:
        expected_by_date[day.date] = {}
        expected_day_info[day.date] = (day.day_of_week, day.day_type)
        for line in day.lines:
            key = normalize_type(line.type)
            if key not in expected_by_date[day.date]:
                expected_by_date[day.date][key] = {"units": 0, "amount": 0}
            expected_by_date[day.date][key]["units"] += line.units
            expected_by_date[day.date][key]["amount"] += line.amount

    actual_by_date = {}
    all_adjustment_dates = []  # page-2 dates only: evidence payroll processed something
    page1_lines = list(getattr(payslip_data, "page1_lines", []) or [])
    for adj in list(payslip_data.adjustments) + page1_lines:
        if adj.section == "adjustment_only" or not adj.date:
            continue
        if adj.section != "current_fortnight":
            all_adjustment_dates.append(adj.date)
        if avac_dates_only and adj.date not in avac_dates:
            continue
        actual_by_date.setdefault(adj.date, {})
        key = normalize_type(adj.type)
        actual_by_date[adj.date].setdefault(key, {"units": 0, "amount": 0})
        actual_by_date[adj.date][key]["units"] += adj.units
        actual_by_date[adj.date][key]["amount"] += adj.amount
    covered_dates = set(getattr(payslip_data, "covered_dates", []) or [])

    # Earliest/latest page-2 dates: shown in the UI only (Rule 9 uses same-week evidence).
    adj_datetimes = [_parse_payslip_date(d) for d in all_adjustment_dates]
    adj_datetimes = [d for d in adj_datetimes if d]
    if adj_datetimes:
        report.earliest_adjustment_date = min(adj_datetimes).strftime("%d.%m.%Y")
        report.latest_adjustment_date = max(adj_datetimes).strftime("%d.%m.%Y")

    for date in sorted(avac_dates):
        exp = expected_by_date.get(date, {})
        act = actual_by_date.get(date, {})
        dow, dtype = expected_day_info.get(date, ("?", "?"))
        day_summary = DaySummary(date=date, day_of_week=dow, day_type=dtype)
        roster_ot_is_info = (date in covered_dates and dtype == "weekday"
                             and not any(k.startswith("Overtime") for k in exp))
        all_types = sorted(set(list(exp.keys()) + list(act.keys())))

        for pay_type in all_types:
            e = exp.get(pay_type, {"units": 0, "amount": 0})
            a = act.get(pay_type, {"units": 0, "amount": 0})
            diff = a["amount"] - e["amount"]
            m = MatchResult(
                date=date, day_of_week=dow, pay_type=pay_type,
                expected_units=round(e["units"], 2), actual_units=round(a["units"], 2),
                expected_amount=round(e["amount"], 2), actual_amount=round(a["amount"], 2),
                difference=round(diff, 2),
            )
            if (roster_ot_is_info and (pay_type.startswith("Overtime") or pay_type == "Meal_Allowance")
                    and e["amount"] == 0 and a["units"] > 0):
                m.status = "INFO"
                m.notes = ("Meal allowance paid with rostered overtime on payslip page 1 (the AVAC has no rostered shift on this date)"
                           if pay_type == "Meal_Allowance" else
                           "Rostered overtime paid on payslip page 1 (the AVAC has no rostered shift on this date)")
                report.match_count += 1
            elif pay_type in INFORMATIONAL_TYPES and e["amount"] == 0:
                m.status = "INFO"
                m.notes = "Standard allowance/loading (not predicted by AVAC engine)"
                report.match_count += 1  # Informational, not a discrepancy
            elif a["units"] < 0 and e["amount"] == 0:
                m.status = "REVERSAL"
                m.notes = f"Negative entry ({a['units']:.2f}h) — payroll correction"
                report.reversal_count += 1
            elif a["units"] < 0:
                m.status = "UNDERPAID"
                m.notes = (f"Payroll reversed this line (net {a['units']:.2f}h) but the AVAC expects "
                           f"{e['units']:.2f}h — short ${abs(diff):.2f}")
                report.discrepancy_count += 1
            elif e["amount"] == 0 and a["amount"] != 0:
                m.status = "UNMATCHED"
                m.notes = "On payslip but not predicted by AVAC"
                report.unmatched_count += 1
            elif a["amount"] == 0 and e["amount"] != 0:
                m.status = "MISSING"
                m.notes = "Expected from AVAC but not on payslip"
                report.missing_count += 1
            elif abs(diff) <= ROUNDING_TOLERANCE:
                m.status = "MATCH"
                report.match_count += 1
            elif diff < 0:
                m.status = "UNDERPAID"
                m.notes = f"Short ${abs(diff):.2f}"
                report.discrepancy_count += 1
            else:
                m.status = "OVERPAID"
                m.notes = f"Excess ${diff:.2f}"
                report.discrepancy_count += 1
            day_summary.matches.append(m)

        day_summary.expected_total = round(sum(v["amount"] for v in exp.values()), 2)
        day_summary.actual_total = round(sum(v["amount"] for v in act.values()), 2)

        report.days.append(day_summary)

    _classify_pending_days(report, payslip_data, page2_dates=set(all_adjustment_dates), covered=covered_dates)

    for adj in payslip_data.adjustments:
        if adj.section == "adjustment_only":
            continue  # handled separately in older_adjustments
        elif adj.date and adj.date not in avac_dates:
            report.unmatched_payslip.append(MatchResult(
                date=adj.date, pay_type=adj.type,
                actual_units=adj.units, actual_amount=adj.amount,
                status="NOT_IN_AVAC",
                notes="Date not in uploaded AVAC"
            ))

    _consolidate_recall_threshold_splits(report, expected_result.base_hourly_rate)
    _finalize(report)
    return report


STATUS_ICONS = {
    "MATCH": "✅", "UNDERPAID": "🔴", "OVERPAID": "🟡", "MISSING": "❌",
    "UNMATCHED": "❓", "REVERSAL": "🔄", "ADJUSTMENT": "📋", "NOT_IN_AVAC": "📋",
    "THRESHOLD_SPLIT": "🔀", "THRESHOLD_EXCESS": "ℹ️", "INFO": "ℹ️",
    "NOT_ON_THIS_PAYSLIP": "⏭️", "NEEDS_FORTNIGHT_PAYSLIP": "📄", "ISSUE_WITHIN_WINDOW": "⚠️",
    "OK": "✅", "ANOMALY": "🔄", "ALL_MATCH": "✅",
    "OK_WITH_ANOMALIES": "⚠️", "DISCREPANCIES_FOUND": "🔴",
    "CORRECTION_PAYSLIP": "🔄",
}


def print_report(report):
    print(f"\n{'='*80}")
    print(f" CHECKPAY RECONCILIATION REPORT")
    print(f" {STATUS_ICONS.get(report.overall_status, '')} {report.overall_status}")
    print(f"{'='*80}")
    print(f" Employee: {report.employee_name}  |  Pay Date: {report.pay_date}")
    print(f" Base Rate: ${report.base_hourly_rate:.4f}")

    # Overpayment warning banner
    if report.is_overpayment_payslip:
        print(f"{'='*80}")
        print(f" ⚠️  OVERPAYMENT / CLAWBACK PAYSLIP")
        print(f"     Gross adjustment: ${report.adjustment_total:,.2f}")
        if report.overpayment_amount > 0:
            print(f"     Net overpayment to be repaid: ${report.overpayment_amount:,.2f}")
        print(f"     All negative entries are payroll corrections clawing back previous overpayments.")

    # Early exit for correction payslips with no positive entries
    if report.overall_status == "CORRECTION_PAYSLIP":
        print(f"{'='*80}")
        print(f"\n  This payslip contains ONLY corrections/reversals from previous pay periods.")
        print(f"  There are no new overtime or recall payments to verify against AVACs.")
        print(f"  The original payments would have appeared on an earlier payslip.")
        if report.older_adjustments:
            print(f"\n  📋 OLDER PERIOD ADJUSTMENTS (> 4 pay periods back)")
            for a in report.older_adjustments:
                print(f"     {a.pay_type}: ${a.actual_amount:,.2f}")
            print(f"     Total: ${report.older_adjustments_total:,.2f}")
        print(f"\n{'='*80}")
        return

    print(f"{'='*80}")

    for day in report.days:
        icon = STATUS_ICONS.get(day.status, "")
        print(f"\n  {icon} {day.date} ({day.day_of_week}) [{day.day_type}] — {day.status}")
        for m in day.matches:
            mi = STATUS_ICONS.get(m.status, " ")
            if m.status == "MATCH":
                print(f"    {mi} {m.pay_type:<28} {m.actual_units:>6.2f}h  ${m.actual_amount:>9,.2f}")
            elif m.status == "INFO":
                print(f"    {mi} {m.pay_type:<28} {m.actual_units:>6.02f}h  ${m.actual_amount:>9,.2f}  [standard allowance]")
            elif m.status == "THRESHOLD_SPLIT":
                print(f"    {mi} {m.pay_type:<28} exp:{m.expected_units:.2f}h act:{m.actual_units:.2f}h  [threshold split]")
            elif m.status == "THRESHOLD_EXCESS":
                print(f"    {mi} {m.pay_type:<28} exp:${m.expected_amount:.2f} act:${m.actual_amount:.2f}  [+${m.difference:.2f} — {m.notes}]")
            elif m.status == "REVERSAL":
                print(f"    {mi} {m.pay_type:<28} {m.actual_units:>6.2f}h  ${m.actual_amount:>9,.2f}  [REVERSAL — expected +{m.expected_units:.2f}h]")
            elif m.status == "MISSING":
                print(f"    {mi} {m.pay_type:<28}                         [MISSING — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "NOT_ON_THIS_PAYSLIP":
                print(f"    {mi} {m.pay_type:<28}                         [NOT ON THIS PAYSLIP — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "NEEDS_FORTNIGHT_PAYSLIP":
                print(f"    {mi} {m.pay_type:<28}                         [NEEDS FORTNIGHT PAYSLIP — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "ISSUE_WITHIN_WINDOW":
                print(f"    {mi} {m.pay_type:<28}                         [ISSUE — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "UNMATCHED":
                print(f"    {mi} {m.pay_type:<28} {m.actual_units:>6.02f}h  ${m.actual_amount:>9,.2f}  [NOT IN AVAC]")
            else:
                print(f"    {mi} {m.pay_type:<28} {m.actual_units:>6.2f}h  ${m.actual_amount:>9,.2f}  [exp ${m.expected_amount:.2f}, diff ${m.difference:+.2f}]")
        if abs(day.difference) > ROUNDING_TOLERANCE:
            print(f"    {'':28} Day diff: ${day.difference:+,.2f}")

    if report.unmatched_payslip:
        not_in_avac = [u for u in report.unmatched_payslip if u.status == "NOT_IN_AVAC"]
        if not_in_avac:
            print(f"\n  📋 PAYSLIP ENTRIES NOT IN THIS AVAC ({len(not_in_avac)} entries)")
            dates_seen = set()
            for u in not_in_avac:
                if u.date not in dates_seen:
                    date_entries = [x for x in not_in_avac if x.date == u.date]
                    total = sum(x.actual_amount for x in date_entries)
                    try:
                        dow = datetime.strptime(u.date, "%d.%m.%Y").strftime("%a")
                    except:
                        dow = "?"
                    print(f"     {u.date} ({dow}): {len(date_entries)} entries, ${total:,.2f}")
                    dates_seen.add(u.date)

    # Older adjustments section
    if report.older_adjustments:
        print(f"\n  📋 OLDER PERIOD ADJUSTMENTS (> 4 pay periods back)")
        print(f"     These cannot be reconciled to specific AVAC dates.")
        for a in report.older_adjustments:
            print(f"     {a.pay_type}: ${a.actual_amount:,.2f}")
        print(f"     Total: ${report.older_adjustments_total:,.2f}")

    print(f"\n{'='*80}")
    print(f" SUMMARY")
    print(f"   ✅ Matched:       {report.match_count}")
    print(f"   🔴 Discrepancies: {report.discrepancy_count}")
    print(f"   ❌ Missing:       {report.missing_count}")
    print(f"   ❓ Unmatched:     {report.unmatched_count}")
    if report.not_on_this_payslip_count > 0:
        print(f"   ⏭️ Not on this payslip: {report.not_on_this_payslip_count}")
    if report.needs_fortnight_payslip_count > 0:
        print(f"   📄 Needs fortnight payslip: {report.needs_fortnight_payslip_count}")
    if report.within_window_issue_count > 0:
        print(f"   ⚠️  Within-window issues: {report.within_window_issue_count}")
    if report.earliest_adjustment_date and report.latest_adjustment_date:
        print(f"   📅 Adjustment window: {report.earliest_adjustment_date} – {report.latest_adjustment_date}")
    print(f"")
    print(f"   Expected (AVAC):  ${report.total_expected:>10,.2f}")
    print(f"   Actual (Payslip): ${report.total_actual:>10,.2f}")
    print(f"   Difference:       ${report.total_difference:>+10,.2f}")
    if report.older_adjustments_total != 0:
        print(f"   Older adj:        ${report.older_adjustments_total:>+10,.2f}  (not reconciled)")
    if report.is_overpayment_payslip and report.overpayment_amount > 0:
        print(f"   Overpayment:      ${report.overpayment_amount:>10,.2f}  (to be repaid)")
    print(f"{'='*80}")


def report_to_dict(report):
    return asdict(report)
