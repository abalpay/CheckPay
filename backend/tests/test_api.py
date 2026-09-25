import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_no_cors_or_rate_limit_middleware():
    names = {m.cls.__name__ for m in main.app.user_middleware}
    assert "CORSMiddleware" not in names
    assert not hasattr(main, "limiter")
