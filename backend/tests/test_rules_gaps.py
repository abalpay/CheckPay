import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from rules_engine import calculate_expected, get_qld_public_holidays, holidays_for


def sat_ot(finish):
    return {"employee": {"name": "Dr Test"}, "shifts": [{
        "line": 1, "date_iso": "2025-03-08", "rostered_start": "08:00", "rostered_finish": "12:00",
        "actual_start": "08:00", "actual_finish": finish, "variation_type": "Overtime", "insufficient_break": False}]}


def units(result):
    return {(l.type, l.units) for l in result.days[0].lines}


def test_weekend_ot_deducts_meal_break_over_five_hours():
    assert units(calculate_expected(sat_ot("15:00"), 60.0)) == {("Overtime_-_1.5", 3.0), ("Overtime_-_2.0", 3.5)}


def test_weekend_ot_of_five_hours_or_less_keeps_full_span():
    assert units(calculate_expected(sat_ot("13:00"), 60.0)) == {("Overtime_-_1.5", 3.0), ("Overtime_-_2.0", 2.0)}


def test_townsville_gets_show_day_and_loses_ekka():
    days = get_qld_public_holidays(2025, "Townsville")
    assert "2025-07-07" in days and "2025-08-13" not in days and "2025-04-21" in days


def test_brisbane_and_unknown_locality_keep_state_list():
    assert "2025-08-13" in get_qld_public_holidays(2025, "Brisbane")
    assert "2025-08-13" in get_qld_public_holidays(2025, None)
    assert "2025-07-07" not in get_qld_public_holidays(2025, None)


def test_holidays_for_uses_avac_years_and_locality():
    avac = {"shifts": [{"date_iso": "2025-07-07"}, {"date_iso": "2026-01-02"}]}
    days = holidays_for(avac, "Townsville")
    assert "2025-07-07" in days and "2026-01-01" in days


def test_show_day_recall_is_paid_at_2_5x():
    avac = {"employee": {"name": "Dr Test"}, "shifts": [{
        "line": 1, "date_iso": "2025-07-07", "rostered_start": None, "rostered_finish": None,
        "actual_start": "13:00", "actual_finish": "18:00", "variation_type": "Recall Onsite", "insufficient_break": False}]}
    result = calculate_expected(avac, 60.0, public_holidays=holidays_for(avac, "Townsville"))
    assert units(result) == {("Recall_-_T2.5", 5.0)}
