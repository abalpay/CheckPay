import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
PDF = b"%PDF-1.4 fake"


def test_no_cors_or_rate_limit_middleware():
    names = {m.cls.__name__ for m in main.app.user_middleware}
    assert "CORSMiddleware" not in names
    assert not hasattr(main, "limiter")


def test_too_many_avacs_rejected():
    files = [("payslip", ("p.pdf", PDF, "application/pdf"))] + [
        ("avacs", (f"a{i}.pdf", PDF, "application/pdf")) for i in range(11)
    ]
    r = client.post("/api/reconcile", files=files)
    assert r.status_code == 400


def test_filenames_never_reach_filesystem(monkeypatch, tmp_path):
    seen = []

    def fake_parse_payslip(path):
        seen.append(path)
        raise ValueError("stop")

    monkeypatch.setattr(main, "parse_payslip", fake_parse_payslip)
    files = [
        ("payslip", ("../../evil.pdf", PDF, "application/pdf")),
        ("avacs", ("/tmp/evil2.pdf", PDF, "application/pdf")),
    ]
    r = client.post("/api/reconcile", files=files)
    assert r.status_code == 400
    assert seen and "evil" not in seen[0]
    assert Path(seen[0]).name == "payslip.pdf"


def test_engine_error_isolated_per_avac(monkeypatch):
    from payslip_parser import PayslipData
    from rules_engine import calculate_expected as real_calc

    ps = PayslipData()
    ps.base_hourly_rate = 60.0
    ps.employee.pay_date = "26.03.2025"
    monkeypatch.setattr(main, "parse_payslip", lambda path: ps)
    monkeypatch.setattr(main, "parse_avac", lambda path: {"employee": {"name": "Dr Test"}, "shifts": [], "path": path})

    def flaky_calc(avac_data, *args, **kwargs):
        if avac_data["path"].endswith("avac_1.pdf"):
            raise RuntimeError("boom")
        return real_calc(avac_data, *args, **kwargs)

    monkeypatch.setattr(main, "calculate_expected", flaky_calc)
    files = [("payslip", ("p.pdf", PDF, "application/pdf"))] + [
        ("avacs", (f"a{i}.pdf", PDF, "application/pdf")) for i in range(3)
    ]
    r = client.post("/api/reconcile", files=files)
    assert r.status_code == 200
    results = r.json()["avac_results"]
    assert [x["avac_name"] for x in results] == ["a0.pdf", "a1.pdf", "a2.pdf"]
    assert results[1] == {"avac_name": "a1.pdf", "error": "Could not process this AVAC file."}
    assert "report" in results[0] and "report" in results[2]
