from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from ml.data_loader import MarketData
from models.entities import ModelRun, PredictionHistory


def _market(frame, ticker="TEST.NS"):
    meta = {
        "ticker": ticker,
        "name": "Test Industries",
        "currency": "INR",
        "currency_symbol": "₹",
        "exchange_code": "NSI",
        "adjusted": True,
        "price_label": "Adjusted closing price",
    }
    return MarketData(ticker=ticker, df=frame, meta=meta, retrieved_at=datetime.now(timezone.utc), source="test")


def test_model_run_is_persisted_with_evaluation_metrics(db, exact_market_data):
    from services.model_service import persist_run, run_training

    result = run_training(exact_market_data, split_ratio=0.7)
    run = persist_run(db, "TEST.NS", "lag", result, 0.7)

    stored = db.execute(select(ModelRun).where(ModelRun.id == run.id)).scalar_one()
    assert stored.ticker == "TEST.NS"
    assert stored.model_type == "lag"
    assert stored.train_size == result["sample"]["train_size"]
    assert stored.test_size == result["sample"]["test_size"]
    assert stored.split_ratio == 0.7
    assert stored.slope == pytest.approx(1.0005, abs=1e-5)
    assert stored.mae == pytest.approx(0.0, abs=1e-4)
    assert stored.baseline_mae > stored.mae
    assert stored.train_start <= stored.train_end < stored.test_start <= stored.test_end


def test_saved_prediction_records_inputs_and_stays_pending(db, monkeypatch, noisy_frame):
    import services.predictions as predictions_service

    monkeypatch.setattr(predictions_service, "load_market_data", lambda *a, **k: _market(noisy_frame))

    payload = predictions_service.create_prediction(db, "TEST.NS", period="2y", split_ratio=0.7, horizon=1)

    record = payload["prediction"]
    assert record["status"] == "pending"
    assert record["ticker"] == "TEST.NS"
    assert record["model_run_id"] is not None
    assert record["input_price"] == pytest.approx(float(noisy_frame["Close"].iloc[-1]), abs=1e-4)
    assert record["coefficients"]["slope"] != 0
    assert record["metrics"]["mae"] is not None
    assert record["actual_price"] is None
    assert record["resolved_at"] is None
    assert payload["forecast"]["forecast"]["predicted_price"] == record["predicted_price"]

    stored = db.execute(select(PredictionHistory)).scalars().all()
    assert len(stored) == 1
    assert stored[0].forecast_date >= record["base_date"]


def test_resolve_pending_uses_the_next_actual_observation(db, monkeypatch, noisy_frame):
    import services.predictions as predictions_service

    monkeypatch.setattr(predictions_service, "load_market_data", lambda *a, **k: _market(noisy_frame))

    base_date = noisy_frame.index[-3].strftime("%Y-%m-%d")
    next_close = float(noisy_frame["Close"].iloc[-2])
    prediction = PredictionHistory(
        ticker="TEST.NS",
        base_date=base_date,
        input_price=float(noisy_frame["Close"].iloc[-3]),
        predicted_price=100.0,
        forecast_date=noisy_frame.index[-2].strftime("%Y-%m-%d"),
        intercept=5.0,
        slope=0.9,
        train_start="2023-01-02",
        train_end="2023-06-01",
    )
    db.add(prediction)
    db.commit()

    resolved = predictions_service.resolve_pending(db)

    db.refresh(prediction)
    assert resolved == 1
    assert prediction.actual_price == pytest.approx(next_close, abs=1e-9)
    assert prediction.absolute_error == pytest.approx(abs(next_close - 100.0), abs=1e-6)
    assert prediction.percentage_error == pytest.approx(abs(next_close - 100.0) / next_close * 100, abs=1e-6)
    assert prediction.resolved_at is not None


def test_list_predictions_aggregates_resolved_records(db, monkeypatch, noisy_frame):
    import services.predictions as predictions_service

    monkeypatch.setattr(predictions_service, "load_market_data", lambda *a, **k: _market(noisy_frame))
    monkeypatch.setattr(predictions_service, "resolve_pending", lambda _db: 0)

    db.add_all(
        [
            PredictionHistory(
                ticker="TEST.NS",
                base_date="2024-01-02",
                input_price=100.0,
                predicted_price=102.0,
                forecast_date="2024-01-03",
                intercept=5.0,
                slope=0.9,
                actual_price=104.0,
                absolute_error=2.0,
                percentage_error=2.0 / 104.0 * 100,
                resolved_at=datetime.now(timezone.utc),
            ),
            PredictionHistory(
                ticker="TEST.NS",
                base_date="2024-01-05",
                input_price=105.0,
                predicted_price=106.0,
                forecast_date="2024-01-08",
                intercept=5.0,
                slope=0.9,
                actual_price=None,
            ),
        ]
    )
    db.commit()

    payload = predictions_service.list_predictions(db)

    assert payload["stats"]["total"] == 2
    assert payload["stats"]["resolved"] == 1
    assert payload["stats"]["pending"] == 1
    assert payload["stats"]["mae"] == pytest.approx(2.0)
    assert payload["by_ticker"][0]["count"] == 1
    assert payload["series"]["predictions_vs_actual"][0]["actual_price"] == pytest.approx(104.0)
    assert len(payload["series"]["error_histogram"]) == 20
    assert payload["insights"]


def test_watchlist_add_duplicate_and_remove(db, monkeypatch, exact_frame):
    import services.watchlist as watchlist_service

    monkeypatch.setattr(watchlist_service, "load_market_data", lambda *a, **k: _market(exact_frame))

    created = watchlist_service.add_watchlist(db, "test.ns")
    assert created["ticker"] == "TEST.NS"
    assert created["name"] == "Test Industries"

    with pytest.raises(ValueError, match="already on the watchlist"):
        watchlist_service.add_watchlist(db, "TEST.NS")

    listing = watchlist_service.list_watchlist(db)
    assert listing["analytics"]["count"] == 1
    assert listing["items"][0]["quote"]["latest_price"] > 0
    assert listing["items"][0]["quote"]["sparkline"]
    assert listing["analytics"]["best"] == "TEST.NS"

    watchlist_service.remove_watchlist(db, created["id"])
    assert watchlist_service.list_watchlist(db)["analytics"]["count"] == 0
    with pytest.raises(LookupError):
        watchlist_service.remove_watchlist(db, created["id"])


def test_alert_lifecycle_and_evaluation(db, monkeypatch, noisy_frame):
    import services.alerts as alerts_service

    monkeypatch.setattr(alerts_service, "load_market_data", lambda *a, **k: _market(noisy_frame))

    alert = alerts_service.create_alert(db, "price_change_pct", "TEST.NS", 0.0001)
    assert alert["enabled"] is True
    assert alert["alert_type"] == "price_change_pct"

    toggled = alerts_service.toggle_alert(db, alert["id"], False)
    assert toggled["enabled"] is False

    alerts_service.toggle_alert(db, alert["id"], True)
    result = alerts_service.evaluate_alerts(db, "TEST.NS")
    assert result["checked"] == 1
    assert len(result["new_events"]) == 1
    assert "TEST.NS moved" in result["new_events"][0]["message"]

    repeated = alerts_service.evaluate_alerts(db, "TEST.NS")
    assert repeated["new_events"] == [], "dedupe must prevent duplicate events"

    alerts_service.delete_alert(db, alert["id"])
    with pytest.raises(LookupError):
        alerts_service.delete_alert(db, alert["id"])
    assert alerts_service.list_alerts(db)["alerts"] == []
