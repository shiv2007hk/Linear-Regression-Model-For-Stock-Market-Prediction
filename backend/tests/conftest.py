from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TEST_DB = Path(__file__).resolve().parent / "_test_stocksense.db"
for suffix in ("", "-wal", "-shm"):
    candidate = Path(str(TEST_DB) + suffix)
    if candidate.exists():
        candidate.unlink()
os.environ["STOCKSENSE_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["STOCKSENSE_CACHE_TTL_SECONDS"] = "0"


def _make_frame(closes: np.ndarray, start: str = "2023-01-02") -> pd.DataFrame:
    index = pd.bdate_range(start=start, periods=len(closes))
    index.name = "Date"
    closes = np.asarray(closes, dtype=float)
    return pd.DataFrame(
        {
            "Open": closes * 0.999,
            "High": closes * 1.01,
            "Low": closes * 0.99,
            "Close": closes,
            "Volume": np.full(len(closes), 1_000_000.0),
        },
        index=index,
    )


def _recurrence(n: int, intercept: float = 5.0, slope: float = 0.9, start: float = 100.0) -> np.ndarray:
    values = np.empty(n, dtype=float)
    values[0] = start
    for i in range(1, n):
        values[i] = intercept + slope * values[i - 1]
    return values


@pytest.fixture(scope="session")
def exact_frame() -> pd.DataFrame:
    """Y is an exact linear function of yesterday's close: Y = 2 + 1.0005 * X (gently rising)."""
    return _make_frame(_recurrence(240, intercept=2.0, slope=1.0005))


@pytest.fixture(scope="session")
def noisy_frame() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    values = _recurrence(300)
    values = values + rng.normal(0.0, 1.2, size=len(values))
    return _make_frame(values)


@pytest.fixture(scope="session")
def exact_market_data(exact_frame):
    from datetime import datetime, timezone

    from ml.data_loader import MarketData

    meta = {
        "ticker": "TEST.NS",
        "name": "Test Industries",
        "currency": "INR",
        "currency_symbol": "₹",
        "exchange_code": "NSI",
        "exchange": "National Stock Exchange of India",
        "adjusted": True,
        "price_label": "Adjusted closing price",
    }
    return MarketData(
        ticker="TEST.NS",
        df=exact_frame,
        meta=meta,
        retrieved_at=datetime.now(timezone.utc),
        source="test",
    )


@pytest.fixture()
def db():
    from database.session import Base, SessionLocal, engine
    import models.entities  # noqa: F401

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    from fastapi.testclient import TestClient

    from database.session import get_db
    from main import app

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def patch_loader(monkeypatch):
    """Replace every module-level load_market_data reference with a fixed payload."""

    def apply(data, raising: Exception | None = None):
        def fake_load(*args, **kwargs):
            if raising is not None:
                raise raising
            return data

        targets = {
            "api.market_data": "load_market_data",
            "api.model": "load_market_data",
            "api.analytics": "load_market_data",
            "services.watchlist": "load_market_data",
            "services.alerts": "load_market_data",
            "services.predictions": "load_market_data",
            "services.analytics": "load_market_data",
            "services.dashboard": "load_market_data",
        }
        for module_name, attribute in targets.items():
            try:
                module = __import__(module_name, fromlist=[attribute])
            except ImportError:
                continue
            if hasattr(module, attribute):
                monkeypatch.setattr(module, attribute, fake_load)
        return fake_load

    return apply
