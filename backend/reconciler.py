"""
Checkpay — Reconciler
======================
Compares expected (Rules Engine) vs actual (Payslip Parser) entries.
"""

import json, sys
from datetime import datetime
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
    # Legacy counters (kept for backward compatibility)
    not_yet_paid_count: int = 0      # Legacy alias for check_future_count
    possibly_missed_count: int = 0   # Legacy alias for within_window_issue_count
    # Pending / follow-up counters
    check_previous_count: int = 0
    check_future_count: int = 0
    within_window_issue_count: int = 0
    overall_status: str = ""
    # Payslip adjustment window (for NOT_YET_PAID classification)
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


def _consolidate_recall_threshold_splits(report, base_rate):
    """Post-process recall entries to handle OT threshold splitting.
    
    The AVAC doesn't record regular rostered shifts, so the engine can't know
    how much of the 3h OT threshold was already consumed before a recall.
    This causes systematic mismatches where:
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

    # If this is a pure overpayment/correction payslip with no positive OT-type
    # adjustments, skip reconciliation — there's nothing to verify against AVACs.
    OT_KEYWORDS = {'overtime', 'recall', 'fatigue', 'public_holiday'}
    has_positive_ot = any(
        adj.amount > 0 and adj.date
        and any(kw in adj.type.lower() for kw in OT_KEYWORDS)
        for adj in payslip_data.adjustments
        if adj.section != "adjustment_only"
    )
    if report.is_overpayment_payslip and not has_positive_ot:
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
    all_adjustment_dates = []  # Track ALL payslip adjustment dates for window calculation
    for adj in payslip_data.adjustments:
        if adj.section == "adjustment_only" or not adj.date:
            continue
        all_adjustment_dates.append(adj.date)
        if avac_dates_only and adj.date not in avac_dates:
            continue
        actual_by_date.setdefault(adj.date, {})
        key = normalize_type(adj.type)
        if key not in actual_by_date[adj.date]:
            actual_by_date[adj.date][key] = {"units": 0, "amount": 0}
        actual_by_date[adj.date][key]["units"] += adj.units
        actual_by_date[adj.date][key]["amount"] += adj.amount

    # Compute payslip adjustment window (earliest/latest dates on Page 2)
    # Used to classify check previous/future vs within-window issue
    def _parse_payslip_date(d):
        """Parse dd.mm.yyyy to datetime for comparison."""
        try:
            return datetime.strptime(d, "%d.%m.%Y")
        except:
            return None

    adj_datetimes = [_parse_payslip_date(d) for d in all_adjustment_dates]
    adj_datetimes = [d for d in adj_datetimes if d]
    if adj_datetimes:
        earliest_adj_dt = min(adj_datetimes)
        latest_adj_dt = max(adj_datetimes)
        report.earliest_adjustment_date = earliest_adj_dt.strftime("%d.%m.%Y")
        report.latest_adjustment_date = latest_adj_dt.strftime("%d.%m.%Y")
    else:
        earliest_adj_dt = None
        latest_adj_dt = None

    # Define payslip scope boundary for future-date classification.
    # Priority: current fortnight period end -> pay date -> latest adjustment date.
    period_end = getattr(getattr(payslip_data, "current_fortnight", None), "period_end", "")
    pay_date = getattr(getattr(payslip_data, "employee", None), "pay_date", "")
    scope_end_dt = _parse_payslip_date(period_end) or _parse_payslip_date(pay_date) or latest_adj_dt

    for date in sorted(avac_dates):
        exp = expected_by_date.get(date, {})
        act = actual_by_date.get(date, {})
        dow, dtype = expected_day_info.get(date, ("?", "?"))
        day_summary = DaySummary(date=date, day_of_week=dow, day_type=dtype)
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
            if pay_type in INFORMATIONAL_TYPES and e["amount"] == 0:
                m.status = "INFO"
                m.notes = "Standard allowance/loading (not predicted by AVAC engine)"
                report.match_count += 1  # Informational, not a discrepancy
            elif a["units"] < 0:
                m.status = "REVERSAL"
                m.notes = f"Negative entry ({a['units']:.2f}h) — payroll correction"
                report.unmatched_count += 1
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
        day_summary.difference = round(day_summary.actual_total - day_summary.expected_total, 2)

        # For day-level status, exclude INFO items (OCA, PH loading, etc.)
        # These are non-actionable and shouldn't make a clean day show as UNDERPAID
        NON_ACTIONABLE_STATUSES = frozenset({
            'INFO', 'THRESHOLD_SPLIT', 'THRESHOLD_EXCESS', 'REVERSAL',
        })
        actionable_diff = round(sum(
            m.actual_amount - m.expected_amount
            for m in day_summary.matches
            if m.status not in NON_ACTIONABLE_STATUSES
        ), 2)

        # If ALL entries for this date are MISSING and the payslip has zero entries
        # for this date, classify based on date position:
        #   - BEFORE earliest adjustment date => CHECK_PREVIOUS
        #   - AFTER latest adjustment date => CHECK_FUTURE
        #   - WITHIN adjustment window => ISSUE_WITHIN_WINDOW
        all_missing = (
            len(day_summary.matches) > 0
            and all(m.status == "MISSING" for m in day_summary.matches)
            and date not in actual_by_date
        )
        if all_missing:
            avac_dt = _parse_payslip_date(date)
            if avac_dt and earliest_adj_dt and avac_dt < earliest_adj_dt:
                sub_status = "CHECK_PREVIOUS"
                note = (f"AVAC date ({date}) is before this payslip's adjustment window "
                        f"({report.earliest_adjustment_date}). Check the previous payslip.")
            elif avac_dt and latest_adj_dt and avac_dt > latest_adj_dt:
                sub_status = "CHECK_FUTURE"
                if scope_end_dt and avac_dt > scope_end_dt:
                    scope_label = period_end or pay_date or report.latest_adjustment_date
                    note = (f"AVAC date ({date}) is after this payslip scope ({scope_label}). "
                            f"Check a future payslip.")
                else:
                    note = (f"AVAC date ({date}) is after this payslip's adjustment window "
                            f"({report.latest_adjustment_date}). Check a future payslip.")
            elif (
                avac_dt
                and earliest_adj_dt
                and latest_adj_dt
                and earliest_adj_dt <= avac_dt <= latest_adj_dt
            ):
                sub_status = "ISSUE_WITHIN_WINDOW"
                note = (f"AVAC date ({date}) falls within this payslip's adjustment window "
                        f"({report.earliest_adjustment_date} – {report.latest_adjustment_date}) "
                        f"but has no entries. Follow up with payroll.")
            elif avac_dt and scope_end_dt and avac_dt > scope_end_dt:
                sub_status = "CHECK_FUTURE"
                scope_label = period_end or pay_date or report.latest_adjustment_date
                note = (f"AVAC date ({date}) is after this payslip scope ({scope_label}). "
                        f"Check a future payslip.")
            else:
                sub_status = "CHECK_FUTURE"
                note = "AVAC entry not on this payslip. Check a future payslip."

            for m in day_summary.matches:
                m.status = sub_status
                m.notes = note
                report.missing_count -= 1
                if sub_status == "CHECK_PREVIOUS":
                    report.check_previous_count += 1
                elif sub_status == "CHECK_FUTURE":
                    report.check_future_count += 1
                    report.not_yet_paid_count += 1  # legacy counter
                else:
                    report.within_window_issue_count += 1
                    report.possibly_missed_count += 1  # legacy counter
            day_summary.status = sub_status
        elif abs(actionable_diff) <= ROUNDING_TOLERANCE:
            day_summary.status = "OK"
        elif any(m.status == "REVERSAL" for m in day_summary.matches):
            day_summary.status = "ANOMALY"
        elif actionable_diff < 0:
            day_summary.status = "UNDERPAID"
        else:
            day_summary.status = "OVERPAID"
        report.days.append(day_summary)

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

    report.total_expected = round(sum(d.expected_total for d in report.days), 2)
    report.total_actual = round(sum(d.actual_total for d in report.days), 2)
    report.total_difference = round(report.total_actual - report.total_expected, 2)

    if report.discrepancy_count == 0 and report.missing_count == 0:
        if report.unmatched_count > 0 or report.within_window_issue_count > 0:
            report.overall_status = "OK_WITH_ANOMALIES"
        elif report.check_previous_count > 0 or report.check_future_count > 0:
            report.overall_status = "OK_WITH_ANOMALIES"
        else:
            report.overall_status = "ALL_MATCH"
    else:
        report.overall_status = "DISCREPANCIES_FOUND"

    # Post-process: consolidate recall threshold splits
    _consolidate_recall_threshold_splits(report, expected_result.base_hourly_rate)

    # Re-evaluate overall status after consolidation
    if report.discrepancy_count == 0 and report.missing_count == 0:
        if report.unmatched_count > 0 or report.within_window_issue_count > 0:
            report.overall_status = "OK_WITH_ANOMALIES"
        elif report.check_previous_count > 0 or report.check_future_count > 0:
            report.overall_status = "OK_WITH_ANOMALIES"
        else:
            report.overall_status = "ALL_MATCH"

    return report


STATUS_ICONS = {
    "MATCH": "✅", "UNDERPAID": "🔴", "OVERPAID": "🟡", "MISSING": "❌",
    "UNMATCHED": "❓", "REVERSAL": "🔄", "ADJUSTMENT": "📋", "NOT_IN_AVAC": "📋",
    "THRESHOLD_SPLIT": "🔀", "THRESHOLD_EXCESS": "ℹ️", "INFO": "ℹ️",
    "NOT_YET_PAID": "⏳", "POSSIBLY_MISSED": "⚠️", "CHECK_PREVIOUS": "🔍",
    "CHECK_FUTURE": "⏭️", "ISSUE_WITHIN_WINDOW": "⚠️",
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
            elif m.status == "NOT_YET_PAID":
                print(f"    {mi} {m.pay_type:<28}                         [NOT YET PAID — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "POSSIBLY_MISSED":
                print(f"    {mi} {m.pay_type:<28}                         [POSSIBLY MISSED — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "CHECK_PREVIOUS":
                print(f"    {mi} {m.pay_type:<28}                         [CHECK PREVIOUS — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
            elif m.status == "CHECK_FUTURE":
                print(f"    {mi} {m.pay_type:<28}                         [CHECK FUTURE — expected {m.expected_units:.2f}h = ${m.expected_amount:.2f}]")
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
    if report.check_previous_count > 0:
        print(f"   🔍 Check previous: {report.check_previous_count}")
    if report.check_future_count > 0:
        print(f"   ⏭️ Check future:   {report.check_future_count}")
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
