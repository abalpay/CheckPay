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
