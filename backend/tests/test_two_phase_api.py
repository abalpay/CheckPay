import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import json

import pytest
from fastapi.testclient import TestClient

import main
from avac_parser import validate_avac_dict
from payslip_parser import AdjustmentLine, PayslipData, Employee, merge_payslips, payslip_from_dict, payslip_to_dict

client = TestClient(main.app)


def payslip_dict(pay_date="26.03.2025", covered_start=3, page1=(), page2=()):
    ps = PayslipData(employee=Employee(name="Dr Test", pay_date=pay_date))
    ps.base_hourly_rate = 60.0
    ps.covered_dates = [f"{d:02d}.03.2025" for d in range(covered_start, covered_start + 14)]
    ps.fortnights = [{"start": ps.covered_dates[0], "end": ps.covered_dates[-1], "pay_date": pay_date}]
    ps.page1_lines = [AdjustmentLine(**l) for l in page1]
    ps.adjustments = [AdjustmentLine(**l) for l in page2]
    return payslip_to_dict(ps)


OT_LINE = {"type": "Overtime_-_1.5", "date": "05.03.2025", "units": 1.4, "rate": 90.0, "amount": 126.0, "section": "current_fortnight"}


def avac_dict(shifts):
    return {"employee": {"name": "Dr Test"}, "workplace": {"location": ""}, "shifts": shifts}


def ot_shift(date_iso, finish, line=1):
    return {"line": line, "date": None, "date_iso": date_iso, "rostered_start": "07:30", "rostered_finish": "16:00",
            "actual_start": "07:30", "actual_finish": finish, "variation_type": "Overtime", "reason": "", "initials": ""}


def test_payslip_round_trips_through_dict():
    ps = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    assert ps.base_hourly_rate == 60.0 and ps.page1_lines[0].amount == 126.0 and len(ps.covered_dates) == 14


def test_payslip_from_dict_rejects_garbage():
    with pytest.raises(ValueError):
        payslip_from_dict(["not", "a", "payslip"])


def test_merge_payslips_dedupes_same_pay_date():
    a = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    b = payslip_from_dict(payslip_dict(page1=[OT_LINE]))
    merged = merge_payslips([a, b])
    assert len(merged.page1_lines) == 1 and len(merged.covered_dates) == 14


def test_merge_payslips_concatenates_and_keeps_latest_rate():
    a = payslip_from_dict(payslip_dict(pay_date="12.03.2025", covered_start=1))
    b = payslip_from_dict(payslip_dict(pay_date="26.03.2025", covered_start=15, page1=[OT_LINE]))
    b.base_hourly_rate = 61.0
    merged = merge_payslips([b, a])
    assert merged.employee.pay_date == "26.03.2025" and merged.base_hourly_rate == 61.0
    assert len(merged.covered_dates) == 28 and len(merged.fortnights) == 2


def test_validate_avac_dict_limits():
    with pytest.raises(ValueError):
        validate_avac_dict({"shifts": [ot_shift("2025-03-05", "17:00")] * 201})
    with pytest.raises(ValueError):
        validate_avac_dict({"shifts": [{**ot_shift("2025-03-05", "17:00"), "actual_finish": "5pm"}]})
    assert validate_avac_dict({"shifts": []})["shifts"] == []


def test_reconcile_json_happy_path():
    body = {"payslips": [payslip_dict(page1=[OT_LINE])],
            "avacs": [{"name": "week.pdf", "data": avac_dict([ot_shift("2025-03-05", "17:00")])}]}
    r = client.post("/api/reconcile/json", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"
    assert data["avac_results"][0]["report"]["overall_status"] == "ALL_MATCH"
    assert data["payslips"] == [{"pay_date": "26.03.2025", "period_start": "", "period_end": ""}]


def test_reconcile_json_rejects_too_many_payslips():
    body = {"payslips": [payslip_dict()] * 9, "avacs": [{"name": "w.pdf", "data": avac_dict([])}]}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


def test_reconcile_json_rejects_too_many_avacs():
    body = {"payslips": [payslip_dict()], "avacs": [{"name": "w.pdf", "data": avac_dict([])}] * 11}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


def test_reconcile_json_lists_unpaid_weeks():
    body = {"payslips": [payslip_dict()],
            "avacs": [{"name": "week.pdf", "data": avac_dict([ot_shift("2025-04-02", "18:00")])}]}
    data = client.post("/api/reconcile/json", json=body).json()
    assert data["unpaid_weeks"] == [{"week_start": "31.03.2025", "avac_name": "week.pdf", "expected_total": 180.0,
                                     "age_days": -5}]


def test_engine_error_isolated_per_avac(monkeypatch):
    """One bad AVAC must not sink the others, and results stay ordered."""
    from rules_engine import calculate_expected as real_calc

    calls = {"n": 0}

    def flaky_calc(avac_data, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real_calc(avac_data, *args, **kwargs)

    monkeypatch.setattr(main, "calculate_expected", flaky_calc)
    ps = payslip_from_dict(payslip_dict())
    avacs = [(f"a{i}.pdf", avac_dict([])) for i in range(3)]
    response = main.run_reconciliation([ps], avacs)
    results = response["avac_results"]
    assert [r["avac_name"] for r in results] == ["a0.pdf", "a1.pdf", "a2.pdf"]
    assert results[1] == {"avac_name": "a1.pdf", "error": "Could not process this AVAC file."}
    assert "report" in results[0] and "report" in results[2]


def test_run_reconciliation_pools_breaks_across_avacs():
    sunday_recall = {"line": 1, "date": None, "date_iso": "2025-03-09", "rostered_start": None, "rostered_finish": None,
                     "actual_start": "12:00", "actual_finish": "00:00", "variation_type": "Recall Onsite", "reason": "", "initials": ""}
    monday = ot_shift("2025-03-10", "20:00")
    response = main.run_reconciliation([payslip_from_dict(payslip_dict())],
                                       [("a.pdf", avac_dict([sunday_recall])), ("b.pdf", avac_dict([monday]))])
    monday_report = response["avac_results"][1]["report"]
    types = {i["pay_type"] for d in monday_report["days"] for i in d["items"]}
    assert "Fatigue_Penalty_@1.0" in types


def test_parse_endpoint_rejects_bad_kind():
    r = client.post("/api/parse", files={"file": ("x.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"kind": "photo"})
    assert r.status_code == 400


def test_parse_filenames_never_reach_filesystem(monkeypatch):
    seen = []

    def fake_parse_payslip(path):
        seen.append(path)
        raise ValueError("stop")

    monkeypatch.setattr(main, "parse_payslip", fake_parse_payslip)
    r = client.post(
        "/api/parse",
        files={"file": ("../../evil.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"kind": "payslip"},
    )
    assert r.status_code == 400
    assert seen and "evil" not in seen[0]
    assert Path(seen[0]).name == "upload.pdf"


def test_unpaid_weeks_include_covered_dates_never_escalated():
    # 05.03 is covered by the payslip (page 1 in evidence) but nothing was paid for its week.
    body = {"payslips": [payslip_dict()],
            "avacs": [{"name": "week.pdf", "data": avac_dict([ot_shift("2025-03-05", "18:00")])}]}
    data = client.post("/api/reconcile/json", json=body).json()
    report = data["avac_results"][0]["report"]
    assert report["overall_status"] == "OK_WITH_ANOMALIES"
    assert [(w["week_start"], w["age_days"]) for w in data["unpaid_weeks"]] == [("03.03.2025", 23)]
    assert data["unpaid_weeks"][0]["expected_total"] > 0


@pytest.mark.parametrize("payslip", [
    "garbage",
    {"current_fortnight": "x"},
    {"covered_dates": {"a": 1}},
    {"fortnights": "abc"},
    {"page1_lines": ["x"]},
    {"adjustments": [OT_LINE] * 501},
])
def test_reconcile_json_rejects_hostile_payslips(payslip):
    body = {"payslips": [payslip], "avacs": [{"name": "w.pdf", "data": avac_dict([])}]}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


@pytest.mark.parametrize("avac", [
    {"shifts": "x"},
    {"shifts": [ot_shift("2025-03-05", "17:00")] * 201},
    {"shifts": [{**ot_shift("2025-03-05", "17:00"), "date": {"d": 1}}]},
    {"shifts": [{**ot_shift("2025-03-05", "17:00"), "actual_start": ["07:30"]}]},
])
def test_reconcile_json_rejects_hostile_avacs(avac):
    body = {"payslips": [payslip_dict()], "avacs": [{"name": "w.pdf", "data": avac}]}
    assert client.post("/api/reconcile/json", json=body).status_code in (400, 422)


def test_reconcile_json_survives_odd_but_valid_values():
    ps = payslip_dict(page1=[OT_LINE])
    ps["base_hourly_rate"] = float("nan")
    avac = avac_dict([{**ot_shift("2025-13-45", "17:00"), "line": "x"}, ot_shift("2025-03-05", "17:00")])
    avac["employee"] = ["not", "a", "dict"]
    body = {"payslips": [ps], "avacs": [{"name": "w.pdf", "data": avac}]}
    r = client.post("/api/reconcile/json", content=json.dumps(body), headers={"content-type": "application/json"})  # NaN on the wire
    assert r.status_code in (200, 400), r.text


def test_merge_payslips_keeps_distinct_payslips_with_same_pay_date():
    line = {**OT_LINE, "section": "previous_4"}
    a = payslip_from_dict(payslip_dict(pay_date="", page2=[line]))
    b = payslip_from_dict(payslip_dict(pay_date="", page2=[{**line, "date": "06.03.2025"}]))
    assert len(merge_payslips([a, b]).adjustments) == 2
    avac = {"name": "w.pdf", "data": avac_dict([])}
    body = {"payslips": [payslip_dict(pay_date="", page2=[line]), payslip_dict(pay_date="", page2=[{**line, "date": "06.03.2025"}])],
            "avacs": [avac]}
    assert len(client.post("/api/reconcile/json", json=body).json()["payslips"]) == 2
    body["payslips"] = [payslip_dict(page1=[OT_LINE])] * 2
    assert len(client.post("/api/reconcile/json", json=body).json()["payslips"]) == 1


def test_reconcile_json_rejects_oversized_body():
    body = {"payslips": [payslip_dict()], "avacs": [{"name": "w.pdf", "data": {**avac_dict([]), "pad": "x" * (3 * 1024 * 1024)}}]}
    assert client.post("/api/reconcile/json", json=body).status_code == 400


def test_parse_rejects_oversized_file_by_actual_length(monkeypatch):
    monkeypatch.setattr(main, "parse_avac", lambda path: {"shifts": []})
    big = b"%PDF-1.4 " + b"0" * (4 * 1024 * 1024)
    r = client.post("/api/parse", files={"file": ("x.pdf", big, "application/pdf")}, data={"kind": "avac"})
    assert r.status_code == 400


def test_page1_ot_blocks_correction_short_circuit():
    # Page 2 nets negative (one clawback in the AVAC week), but page 1 pays the OT short: 1.0h of 2.4h.
    clawback = {"type": "OCA_-_RMO_-_Level_4_to_13", "date": "04.03.2025", "units": -4.0, "rate": 5.25,
                "amount": -21.0, "section": "previous_4"}
    ps = payslip_from_dict(payslip_dict(page1=[{**OT_LINE, "units": 1.0, "amount": 90.0}], page2=[clawback]))
    ps.is_overpayment_payslip = True
    resp = main.run_reconciliation([ps], [("w.pdf", avac_dict([ot_shift("2025-03-05", "18:00")]))])
    assert resp["status"] == "ok"
    rep = resp["avac_results"][0]["report"]
    assert rep["total_difference"] < 0 and rep["days"][0]["status"] == "UNDERPAID"


def test_same_pay_date_reupload_with_parse_difference_counts_once():
    a = payslip_from_dict(payslip_dict(page1=[{**OT_LINE, "units": 2.4, "amount": 216.0}]))
    b = payslip_from_dict(payslip_dict(page1=[{**OT_LINE, "units": 2.4, "amount": 216.0}]))
    b.net_income = 1234.0  # e.g. a print-to-PDF re-save that extracts one field differently
    assert len(merge_payslips([a, b]).page1_lines) == 1
    resp = main.run_reconciliation([a, b], [("w.pdf", avac_dict([ot_shift("2025-03-05", "18:00")]))])
    rep = resp["avac_results"][0]["report"]
    assert len(resp["payslips"]) == 1
    assert rep["overall_status"] == "ALL_MATCH" and rep["total_difference"] == 0


def test_pending_total_and_unpaid_week_use_one_number():
    # Page 1 paid the routine 0.4h of an expected 2.4h; the week is not processed yet.
    ps = payslip_from_dict(payslip_dict(page1=[{**OT_LINE, "units": 0.4, "amount": 36.0}]))
    resp = main.run_reconciliation([ps], [("w.pdf", avac_dict([ot_shift("2025-03-05", "18:00")]))])
    rep = resp["avac_results"][0]["report"]
    assert rep["days"][0]["status"] == "NOT_ON_THIS_PAYSLIP"
    assert rep["pending_expected_total"] == resp["unpaid_weeks"][0]["expected_total"] == 180.0


def test_long_avac_name_does_not_fail_the_run():
    body = {"payslips": [payslip_dict(page1=[OT_LINE])],
            "avacs": [{"name": "a" * 300 + ".pdf", "data": avac_dict([ot_shift("2025-03-05", "17:00")])}]}
    r = client.post("/api/reconcile/json", json=body)
    assert r.status_code == 200, r.text
    assert len(r.json()["avac_results"][0]["avac_name"]) <= 200


def test_routine_page1_ot_off_avac_dates_keeps_correction_short_circuit():
    # Page 1 always pays the fortnight's own rostered OT; that is not evidence for an AVAC of other dates.
    clawback = {"type": "Overtime_-_1.5", "date": "20.02.2025", "units": -1.0, "rate": 90.0,
                "amount": -90.0, "section": "previous_4"}
    ps = payslip_from_dict(payslip_dict(page1=[{**OT_LINE, "date": "10.03.2025"}], page2=[clawback]))
    ps.is_overpayment_payslip = True
    resp = main.run_reconciliation([ps], [("w.pdf", avac_dict([ot_shift("2025-02-12", "18:00")]))])
    assert resp["status"] == "correction_payslip"
