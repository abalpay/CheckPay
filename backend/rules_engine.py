"""
Checkpay — Award Rules Engine
===============================
Converts AVAC shift data into expected payslip adjustment entries.

Award: Medical Officers (Queensland Health) Award – State 2015
Relevant clauses: 12 (classifications), 17.3 (meals), 19 (RMO hours/OT)

Input:  AVAC parser output (dict with shifts list)
Output: List of expected payslip entries per day, matching payslip format
"""

import json
import sys
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional


# ─── Constants ────────────────────────────────────────────────────────────────

SALARY_HOURS_PER_DAY = 7.6
MEAL_BREAK_HOURS = 0.5
STANDARD_DAY_HOURS = SALARY_HOURS_PER_DAY + MEAL_BREAK_HOURS  # 8.1h = 8h06m

OT_THRESHOLD_HOURS = 3.0
RECALL_MINIMUM_HOURS = 2.0
MEAL_ALLOWANCE_THRESHOLD_HOURS = 10.0
MEAL_ALLOWANCE_SECOND_THRESHOLD = 15.0
FATIGUE_STANDARD_HOURS = 7.6

RATE_MULTIPLIERS = {
    "1.0x": 1.0,
    "1.5x": 1.5,
    "2.0x": 2.0,
    "2.5x": 2.5,
}

import holidays as holidays_lib

def get_qld_public_holidays(year: int) -> set:
    """Get QLD public holidays for a given year using the holidays library.
    Returns a set of ISO date strings e.g. {'2025-04-18', '2025-04-21', ...}"""
    qld = holidays_lib.Australia(state='QLD', years=year)
    return {str(d) for d in qld.keys()}


# ─── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class ExpectedPayLine:
    date: str = ""
    date_iso: str = ""
    day_of_week: str = ""
    day_type: str = ""
    type: str = ""
    units: float = 0.0
    rate_multiplier: str = ""
    rate: float = 0.0
    amount: float = 0.0
    source_lines: list = field(default_factory=list)
    notes: str = ""

@dataclass
class DailyExpectation:
    date: str = ""
    date_iso: str = ""
    day_of_week: str = ""
    day_type: str = ""
    lines: list = field(default_factory=list)
    total: float = 0.0
    avac_shifts: list = field(default_factory=list)

@dataclass
class RulesResult:
    employee_name: str = ""
    base_hourly_rate: float = 0.0
    roster_start: str = "07:30"
    standard_finish: str = ""
    days: list = field(default_factory=list)
    warnings: list = field(default_factory=list)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def time_to_minutes(t: str) -> int:
    if not t:
        return 0
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])

def minutes_to_hours(m: int) -> float:
    return round(m / 60, 2)

def calc_duration_minutes(start: str, finish: str) -> int:
    s = time_to_minutes(start)
    f = time_to_minutes(finish)
    if f <= s:
        f += 24 * 60
    return f - s

def get_standard_finish(roster_start: str) -> str:
    start_mins = time_to_minutes(roster_start)
    finish_mins = start_mins + int(STANDARD_DAY_HOURS * 60)
    return f"{finish_mins // 60:02d}:{finish_mins % 60:02d}"

def get_day_type(date_iso: str, public_holidays: set = None) -> str:
    if public_holidays is None:
        year = int(date_iso[:4])
        public_holidays = get_qld_public_holidays(year)
    if date_iso in public_holidays:
        return "public_holiday"
    dt = datetime.strptime(date_iso, "%Y-%m-%d")
    dow = dt.weekday()
    if dow == 5:
        return "saturday"
    elif dow == 6:
        return "sunday"
    return "weekday"

def iso_to_payslip_date(date_iso: str) -> str:
    return datetime.strptime(date_iso, "%Y-%m-%d").strftime("%d.%m.%Y")

def get_day_of_week(date_iso: str) -> str:
    return datetime.strptime(date_iso, "%Y-%m-%d").strftime("%a")

def get_payslip_type(category: str, multiplier: str) -> str:
    mapping = {
        ("overtime", "1.5x"): "Overtime_-_1.5",
        ("overtime", "2.0x"): "Overtime_-_2.0",
        ("overtime", "2.5x"): "Overtime_-_2.5",
        ("recall", "1.5x"): "Recall_-",
        ("recall", "2.0x"): "Recall_-_T2.0",
        ("recall", "2.5x"): "Recall_-_T2.5",
        ("recall_offsite", "1.5x"): "Recall_Offsite_1.5",
        ("recall_offsite", "2.0x"): "Recall_Offsite_2.0",
        ("recall_offsite", "2.5x"): "Recall_Offsite_2.5",
        ("fatigue", "1.0x"): "Fatigue_Penalty_@1.0",
        ("fatigue", "1.5x"): "Fatigue_Penalty_@1.5",
        ("fatigue", "2.0x"): "Fatigue_Penalty_@2.0",
        ("meal", "flat"): "Meal_Allowance",
    }
    return mapping.get((category, multiplier), f"{category}_{multiplier}")


# ─── Threshold Logic ─────────────────────────────────────────────────────────

def apply_ot_threshold(hours: float, day_type: str, cumulative_ot_hours: float = 0.0) -> list:
    """Apply Mon-Sat 3h threshold. Sunday=2.0x all, PH=2.5x all."""
    if hours <= 0:
        return []
    if day_type == "sunday":
        return [(hours, "2.0x")]
    elif day_type == "public_holiday":
        return [(hours, "2.5x")]
    else:
        result = []
        remaining_at_1_5 = max(0, OT_THRESHOLD_HOURS - cumulative_ot_hours)
        if remaining_at_1_5 > 0:
            at_1_5 = min(hours, remaining_at_1_5)
            result.append((round(at_1_5, 2), "1.5x"))
            hours -= at_1_5
        if hours > 0:
            result.append((round(hours, 2), "2.0x"))
        return result


# ─── Shift Processors ────────────────────────────────────────────────────────

def process_overtime_shift(shift, base_rate, standard_finish_mins, cumulative_ot, day_type):
    """Process overtime using the AVAC's rostered_finish as OT baseline.
    
    WEEKDAYS: rostered_finish marks the boundary between ordinary and OT hours.
    When rostered_finish=16:00, the 0.4h gap (15:36→16:00) was already paid
    on Page 1 as rostered OT, so Page 2 only shows hours beyond 16:00.
    But that 0.4h still counts toward the cumulative 3h threshold.
    
    When rostered_finish is far beyond normal (e.g. 18:00 for extended recall
    coverage), we fall back to standard_finish_mins (15:36).
    
    SATURDAY/SUNDAY/PUBLIC HOLIDAY: The entire shift is overtime per clause 19.4.
    The doctor's ordinary hours are weekday-based (76h/fortnight, clause 19.1),
    so any rostered Saturday/Sunday/PH shift is additional to ordinary hours.
    All hours from actual_start to actual_finish are OT.
    Award rates: clause 19.4(a)(i) Mon-Sat T1.5 first 3h then T2.0,
                 clause 19.4(a)(ii) Sunday T2.0,
                 clause 19.4(a)(iii) PH T2.5.
    """
    lines = []
    
    actual_finish_mins = time_to_minutes(shift["actual_finish"])
    actual_start_mins = time_to_minutes(shift["actual_start"])
    if actual_finish_mins <= actual_start_mins:
        actual_finish_mins += 24 * 60

    # Total on-site hours (for meal allowance)
    total_shift_mins = actual_finish_mins - actual_start_mins
    total_shift_hours = minutes_to_hours(total_shift_mins)

    if day_type in ("saturday", "sunday", "public_holiday"):
        # Weekend/PH: ALL hours are OT — no ordinary hour baseline
        ot_hours = total_shift_hours
        ot_note = f"Full shift OT on {day_type} {shift['actual_start']}-{shift['actual_finish']} ({ot_hours:.2f}h, cum: {cumulative_ot:.2f}h)"
    else:
        # Weekday: OT = hours beyond rostered_finish (or standard finish)
        rostered_finish = shift.get("rostered_finish")
        if rostered_finish:
            rf_mins = time_to_minutes(rostered_finish)
            if rf_mins <= standard_finish_mins + 30:  # 16:06 cap for 15:36 standard
                ot_baseline_mins = rf_mins
            else:
                ot_baseline_mins = standard_finish_mins
        else:
            ot_baseline_mins = standard_finish_mins

        ot_minutes = max(0, actual_finish_mins - ot_baseline_mins)
        ot_hours = minutes_to_hours(ot_minutes)
        rostered_finish = shift.get("rostered_finish")
        ot_note = f"OT beyond {rostered_finish or 'standard'} to {shift['actual_finish']} (cum: {cumulative_ot:.2f}h+{ot_hours:.2f}h)"

    if ot_hours > 0:
        splits = apply_ot_threshold(ot_hours, day_type, cumulative_ot)
        for hours, mult in splits:
            rate = base_rate * RATE_MULTIPLIERS[mult]
            lines.append(ExpectedPayLine(
                type=get_payslip_type("overtime", mult),
                units=hours, rate_multiplier=mult,
                rate=round(rate, 4), amount=round(hours * rate, 2),
                source_lines=[shift["line"]],
                notes=ot_note
            ))
        cumulative_ot += ot_hours

    return lines, cumulative_ot, total_shift_hours


def process_recall_onsite(shift, base_rate, cumulative_ot, day_type):
    lines = []
    duration_mins = calc_duration_minutes(shift["actual_start"], shift["actual_finish"])
    actual_hours = minutes_to_hours(duration_mins)
    paid_hours = max(actual_hours, RECALL_MINIMUM_HOURS)
    guarantee_hours = round(paid_hours - actual_hours, 2)

    # Split ACTUAL hours through OT threshold
    splits = apply_ot_threshold(actual_hours, day_type, cumulative_ot)
    for hours, mult in splits:
        rate = base_rate * RATE_MULTIPLIERS[mult]
        lines.append(ExpectedPayLine(
            type=get_payslip_type("recall", mult),
            units=hours, rate_multiplier=mult,
            rate=round(rate, 4), amount=round(hours * rate, 2),
            source_lines=[shift["line"]],
            notes=f"Recall {shift['actual_start']}-{shift['actual_finish']} (actual:{actual_hours:.2f}h paid:{paid_hours:.2f}h cum:{cumulative_ot:.2f}h)"
        ))

    # Add guarantee top-up at 2.0× if actual < 2h minimum
    if guarantee_hours > 0.001:
        rate_2x = base_rate * RATE_MULTIPLIERS["2.0x"]
        lines.append(ExpectedPayLine(
            type="Recall_Guaranteed_Hrs_2.0",
            units=guarantee_hours, rate_multiplier="2.0x",
            rate=round(rate_2x, 4), amount=round(guarantee_hours * rate_2x, 2),
            source_lines=[shift["line"]],
            notes=f"Guarantee top-up: {actual_hours:.2f}h actual → {paid_hours:.2f}h minimum"
        ))

    cumulative_ot += paid_hours
    return lines, cumulative_ot


def process_recall_offsite(shift, base_rate, cumulative_ot=0, day_type="weekday"):
    duration_mins = calc_duration_minutes(shift["actual_start"], shift["actual_finish"])
    actual_hours = minutes_to_hours(duration_mins)
    lines = []
    splits = apply_ot_threshold(actual_hours, day_type, cumulative_ot)
    new_cumulative = cumulative_ot + actual_hours
    for hours, mult in splits:
        rate = base_rate * RATE_MULTIPLIERS[mult]
        lines.append(ExpectedPayLine(
            type=get_payslip_type("recall_offsite", mult),
            units=hours, rate_multiplier=mult,
            rate=round(rate, 4), amount=round(hours * rate, 2),
            source_lines=[shift["line"]],
            notes=f"Offsite {shift['actual_start']}-{shift['actual_finish']} ({actual_hours:.2f}h)"
        ))
    return lines, new_cumulative


def process_fatigue(shift, base_rate, day_type):
    """Fatigue penalty replaces what the employee would have earned:
    - Weekday: 7.60h salary replacement @1.0x + any OT excess @1.5x
    - Saturday: all hours through OT threshold at Saturday rates (1.5x/2.0x)
    - Sunday: all hours @2.0x
    - Public holiday: all hours @2.5x
    """
    lines = []
    break_gap = shift.get('break_gap_hours', '?')

    if day_type == "weekday":
        # Standard salary replacement
        rate_1x = base_rate
        lines.append(ExpectedPayLine(
            type=get_payslip_type("fatigue", "1.0x"),
            units=FATIGUE_STANDARD_HOURS, rate_multiplier="1.0x",
            rate=round(rate_1x, 4),
            amount=round(FATIGUE_STANDARD_HOURS * rate_1x, 2),
            source_lines=[shift["line"]],
            notes=f"Fatigue penalty: break gap {break_gap}h (weekday salary replacement)"
        ))
        # Plus OT excess if shift info available
        if shift.get("actual_start") and shift.get("actual_finish"):
            duration_mins = calc_duration_minutes(shift["actual_start"], shift["actual_finish"])
            total_hours = minutes_to_hours(duration_mins)
            worked_hours = total_hours - MEAL_BREAK_HOURS
            excess = round(worked_hours - FATIGUE_STANDARD_HOURS, 2)
            if excess > 0:
                splits = apply_ot_threshold(excess, day_type, 0)
                for hours, mult in splits:
                    rate = base_rate * RATE_MULTIPLIERS[mult]
                    lines.append(ExpectedPayLine(
                        type=get_payslip_type("fatigue", mult),
                        units=hours, rate_multiplier=mult,
                        rate=round(rate, 4), amount=round(hours * rate, 2),
                        source_lines=[shift["line"]],
                        notes=f"Fatigue worked excess: {excess:.2f}h beyond standard"
                    ))
    else:
        # Weekend/PH: no salary component, all hours at day-appropriate OT rates
        # Determine total fatigue hours from shift info or default
        if shift.get("actual_start") and shift.get("actual_finish"):
            duration_mins = calc_duration_minutes(shift["actual_start"], shift["actual_finish"])
            total_hours = minutes_to_hours(duration_mins)
            fatigue_hours = total_hours - MEAL_BREAK_HOURS if total_hours > 5 else total_hours
        else:
            fatigue_hours = FATIGUE_STANDARD_HOURS

        splits = apply_ot_threshold(fatigue_hours, day_type, 0)
        for hours, mult in splits:
            rate = base_rate * RATE_MULTIPLIERS[mult]
            lines.append(ExpectedPayLine(
                type=get_payslip_type("fatigue", mult),
                units=hours, rate_multiplier=mult,
                rate=round(rate, 4), amount=round(hours * rate, 2),
                source_lines=[shift["line"]],
                notes=f"Fatigue penalty: break gap {break_gap}h ({day_type} rates, {fatigue_hours:.2f}h)"
            ))
    return lines


def check_meal_allowance(total_onsite_hours, meal_rate, source_lines):
    """Check meal allowance based on WORK hours (on-site minus meal break).
    
    Clause 17.3(a): 'rostered to work more than ten (10) continuous hours'
    Work hours = on-site hours minus unpaid meal break (0.5h for shifts > 5h)
    """
    lines = []
    # Subtract meal break to get actual work hours
    work_hours = total_onsite_hours - MEAL_BREAK_HOURS if total_onsite_hours > 5 else total_onsite_hours
    
    if work_hours > MEAL_ALLOWANCE_THRESHOLD_HOURS:  # Strictly > 10h
        lines.append(ExpectedPayLine(
            type="Meal_Allowance", units=1.0, rate_multiplier="flat",
            rate=meal_rate, amount=meal_rate, source_lines=source_lines,
            notes=f"Work {work_hours:.2f}h (onsite {total_onsite_hours:.2f}h - {MEAL_BREAK_HOURS}h meal) > {MEAL_ALLOWANCE_THRESHOLD_HOURS}h"
        ))
    if work_hours > MEAL_ALLOWANCE_SECOND_THRESHOLD:  # > 15h
        lines.append(ExpectedPayLine(
            type="Meal_Allowance", units=1.0, rate_multiplier="flat",
            rate=meal_rate, amount=meal_rate, source_lines=source_lines,
            notes=f"Second meal: work {work_hours:.2f}h > {MEAL_ALLOWANCE_SECOND_THRESHOLD}h"
        ))
    return lines


# ─── Main Engine ──────────────────────────────────────────────────────────────

def calculate_expected(avac_data: dict, base_hourly_rate: float,
                       roster_start: str = "07:30",
                       meal_allowance_rate: float = 16.80,
                       public_holidays: set = None) -> RulesResult:
    if public_holidays is None:
        # Derive year(s) from AVAC shift dates and build holiday set
        years = set()
        for s in avac_data.get("shifts", []):
            d = s.get("date_iso", "")
            if d:
                years.add(int(d[:4]))
        if not years:
            years = {2025}  # fallback
        public_holidays = set()
        for y in years:
            public_holidays |= get_qld_public_holidays(y)

    result = RulesResult()
    result.employee_name = avac_data.get("employee", {}).get("name", "")
    result.base_hourly_rate = base_hourly_rate
    result.roster_start = roster_start
    standard_finish = get_standard_finish(roster_start)
    standard_finish_mins = time_to_minutes(standard_finish)
    result.standard_finish = standard_finish

    shifts = avac_data.get("shifts", [])

    # Group by date
    by_date = {}
    for shift in shifts:
        date_iso = shift.get("date_iso", "")
        if not date_iso:
            date_str = shift.get("date", "")
            if date_str:
                try:
                    date_iso = datetime.strptime(date_str, "%d/%m/%Y").strftime("%Y-%m-%d")
                except:
                    result.warnings.append(f"Bad date: {date_str}")
                    continue
        by_date.setdefault(date_iso, []).append(shift)

    for date_iso in sorted(by_date.keys()):
        day_shifts = by_date[date_iso]
        day_type = get_day_type(date_iso, public_holidays)
        day_of_week = get_day_of_week(date_iso)
        payslip_date = iso_to_payslip_date(date_iso)

        day = DailyExpectation(
            date=payslip_date, date_iso=date_iso,
            day_of_week=day_of_week, day_type=day_type,
            avac_shifts=day_shifts,
        )

        cumulative_ot = 0.0
        main_shift_onsite_hours = 0.0  # Only shifts with rostered hours (for meal check)
        source_lines = [s["line"] for s in day_shifts]
        
        # Pre-seed cumulative OT with rostered OT gap (0.4h when rostered_finish > standard)
        # This gap was already paid on Page 1 but counts toward the 3h threshold
        # Only applies on WEEKDAYS when rostered_finish is within 30min of standard
        # On Saturday/Sunday/PH, all hours are OT (no ordinary hour baseline)
        if day_type == "weekday":
            for shift in day_shifts:
                rf = shift.get("rostered_finish")
                if rf and shift.get("rostered_start"):
                    rf_mins = time_to_minutes(rf)
                    if rf_mins > standard_finish_mins and rf_mins <= standard_finish_mins + 30:
                        gap_hours = minutes_to_hours(rf_mins - standard_finish_mins)
                        cumulative_ot = gap_hours  # e.g. 0.4h for 15:36→16:00
                    break

        for shift in day_shifts:
            vtype = (shift.get("variation_type") or "").lower()
            has_roster = bool(shift.get("rostered_start"))
            is_fatigue = shift.get("insufficient_break", False) or "insufficient" in vtype or "fatigue" in vtype
            is_offsite = "offsite" in vtype
            is_recall = "recall" in vtype

            if is_fatigue and has_roster:
                # Fatigue shift WITH rostered hours: calculate BOTH OT and fatigue penalty
                # OT = hours beyond rostered finish (separate entitlement)
                # Fatigue = penalty for working with insufficient break
                ot_lines, cumulative_ot, shift_hours = process_overtime_shift(
                    shift, base_hourly_rate, standard_finish_mins, cumulative_ot, day_type)
                day.lines.extend(ot_lines)
                main_shift_onsite_hours = max(main_shift_onsite_hours, shift_hours)
                # Then fatigue penalty
                day.lines.extend(process_fatigue(shift, base_hourly_rate, day_type))
            elif is_fatigue:
                day.lines.extend(process_fatigue(shift, base_hourly_rate, day_type))
            elif is_offsite:
                pay_lines, cumulative_ot = process_recall_offsite(shift, base_hourly_rate, cumulative_ot, day_type)
                day.lines.extend(pay_lines)
            elif has_roster:
                pay_lines, cumulative_ot, shift_hours = process_overtime_shift(
                    shift, base_hourly_rate, standard_finish_mins, cumulative_ot, day_type)
                day.lines.extend(pay_lines)
                main_shift_onsite_hours = max(main_shift_onsite_hours, shift_hours)
            elif is_recall:
                pay_lines, cumulative_ot = process_recall_onsite(
                    shift, base_hourly_rate, cumulative_ot, day_type)
                day.lines.extend(pay_lines)
            else:
                result.warnings.append(f"Unknown type on {payslip_date}: {shift.get('variation_type')}")

        # Meal allowance based on MAIN shift only (not standalone recalls)
        if main_shift_onsite_hours > 0:
            day.lines.extend(check_meal_allowance(main_shift_onsite_hours, meal_allowance_rate, source_lines))

        for line in day.lines:
            line.date = payslip_date
            line.date_iso = date_iso
            line.day_of_week = day_of_week
            line.day_type = day_type

        day.total = round(sum(l.amount for l in day.lines), 2)
        result.days.append(day)

    return result


# ─── Output ───────────────────────────────────────────────────────────────────

def print_expected(result: RulesResult):
    print(f"{'='*75}")
    print(f" EXPECTED PAYSLIP — {result.employee_name}")
    print(f" Base: ${result.base_hourly_rate:.4f}  |  Standard finish: {result.standard_finish}")
    print(f"{'='*75}")

    grand_total = 0.0
    for day in result.days:
        print(f"\n  {day.date} ({day.day_of_week}) [{day.day_type}]")
        for line in day.lines:
            print(f"    {line.type:<30} {line.units:>6.2f}h x ${line.rate:.4f} = ${line.amount:>9,.2f}")
        print(f"    {'Day total:':>46} ${day.total:>9,.2f}")
        grand_total += day.total

    print(f"\n{'='*75}")
    print(f"  GRAND TOTAL: ${grand_total:>12,.2f}")
    print(f"{'='*75}")

    if result.warnings:
        print(f"\n  WARNINGS:")
        for w in result.warnings:
            print(f"    - {w}")


def result_to_dict(result: RulesResult) -> dict:
    return asdict(result)


def main():
    if len(sys.argv) < 3:
        print("Usage: python rules_engine.py <avac.json> <base_rate> [--json]")
        sys.exit(1)
    avac_path = sys.argv[1]
    base_rate = float(sys.argv[2])
    json_output = "--json" in sys.argv
    if avac_path == "-":
        avac_data = json.load(sys.stdin)
    else:
        with open(avac_path) as f:
            avac_data = json.load(f)
    result = calculate_expected(avac_data, base_rate)
    if json_output:
        print(json.dumps(result_to_dict(result), indent=2))
    else:
        print_expected(result)


if __name__ == "__main__":
    main()