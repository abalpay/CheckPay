import sys
from dataclasses import asdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from avac_parser import ShiftEntry, _build_shifts, _detect_insufficient_breaks, detect_breaks_across
from rules_engine import calculate_expected


def entry(line, date, rs, rf, as_, af, vtype, reason=""):
    return ShiftEntry(line=line, date=date, date_iso=None, personnel_number=None, employee_name=None, pay_level=None,
                      rostered_start=rs, rostered_finish=rf, actual_start=as_, actual_finish=af,
                      variation_type=vtype, reason=reason, initials="")


def test_detector_uses_date_order_not_form_row_order():
    shifts = [
        entry(1, "10/03/2025", "07:30", "15:36", "07:30", "17:30", "Overtime"),
        entry(2, "12/03/2025", "07:30", "15:36", "07:30", "17:30", "Overtime"),
        entry(3, "13/03/2025", "07:30", "15:36", "07:30", "16:30", "Overtime"),
        entry(4, "11/03/2025", None, None, "20:30", "00:00", "Recall Onsite"),
    ]
    _detect_insufficient_breaks(shifts)
    flagged = {s.date: s.break_gap_hours for s in shifts if s.insufficient_break}
    assert flagged == {"12/03/2025": 7.5}


def _dataset_row(block, rs, rf, as_, af):
    fields = [("Date", "12/03/2025"), ("RosteredStart", rs), ("RosteredFinish", rf), ("ActualStart", as_), ("ActualFinish", af)]
    return {"block_name": block, "fields": [(k, v) for k, v in fields if v]}


def test_fatigue_marker_on_rostered_row_sets_flag():
    rows = [_dataset_row("Variation2", "07:30", "15:36", "07:30", "17:30"),
            _dataset_row("Variation3", None, None, "20:00", "22:00")]
    blocks = [{"block_name": "Variation2", "reason": "*Fatigue pay* ward cover", "dropdown_id": "1"},
              {"block_name": "Variation3", "reason": "*Fatigue pay* noted", "dropdown_id": "2"}]
    shifts = _build_shifts(rows, blocks, {"1": "0", "2": "2"})
    assert [s.insufficient_break for s in shifts] == [True, False]
    assert shifts[0].variation_type == "Overtime"  # still an OT row: pays OT *and* fatigue (Rule 5.4)


def test_engine_pays_ot_and_fatigue_for_marker_row():
    shift = {"line": 1, "date_iso": "2025-03-12", "rostered_start": "07:30", "rostered_finish": "15:36",
             "actual_start": "07:30", "actual_finish": "17:30", "variation_type": "Overtime", "insufficient_break": True}
    result = calculate_expected({"employee": {"name": "Dr Test"}, "shifts": [shift]}, 60.0)
    assert {(l.type, l.units) for l in result.days[0].lines} == {
        ("Overtime_-_1.5", 1.9), ("Fatigue_Penalty_@1.0", 7.6), ("Fatigue_Penalty_@1.5", 1.9)}


def test_detect_breaks_across_spans_files():
    week_a = [asdict(entry(1, "09/03/2025", None, None, "12:00", "00:00", "Recall Onsite"))]
    week_b = [asdict(entry(1, "10/03/2025", "07:30", "15:36", "07:30", "20:00", "Overtime"))]
    detect_breaks_across(week_a + week_b)
    assert week_b[0]["insufficient_break"] is True
    assert week_b[0]["break_gap_hours"] == 7.5
    assert week_a[0]["insufficient_break"] is False
