from __future__ import annotations

import pytest

from ml.data_loader import MarketDataError


def test_health_reports_database_and_yfinance(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"
    assert payload["yfinance_version"]
    assert "not investment advice" in payload["disclaimer"].lower()


def test_periods_catalog(client):
    response = client.get("/api/market-data/periods")

    assert response.status_code == 200
    payload = response.json()
    assert {"3mo", "6mo", "1y", "2y", "5y", "max"} <= {item["value"] for item in payload["periods"]}
    assert {item["value"] for item in payload["intervals"]} == {"1d", "1wk", "1mo"}


def test_market_data_payload_contains_adjusted_ohlcv(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    response = client.get("/api/market-data", params={"ticker": "test.ns", "period": "2y"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["ticker"] == "TEST.NS"
    assert payload["meta"]["adjusted"] is True
    assert payload["meta"]["source"] == "test"
    assert len(payload["ohlcv"]) == len(exact_market_data.df)
    assert {"date", "open", "high", "low", "close", "volume"} <= set(payload["ohlcv"][0])
    assert payload["summary"]["currency_symbol"] == "₹"


def test_summary_computes_volatility_and_ranges(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    response = client.get("/api/market-data/summary", params={"ticker": "TEST.NS"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["range_high"] >= payload["latest_price"] >= payload["range_low"]
    assert payload["annualized_volatility_pct"] >= 0
    assert len(payload["volume_series"]) <= 120
    assert payload["meta"]["adjusted"] is True


def test_dataset_pagination_and_csv_export(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    page = client.get("/api/market-data/dataset", params={"ticker": "TEST.NS", "page_size": 50})
    assert page.status_code == 200
    body = page.json()
    assert body["page"] == 1
    assert body["page_size"] == 50
    assert len(body["rows"]) == 50
    assert body["total"] == len(exact_market_data.df)
    assert body["pages"] >= 2

    csv_response = client.get("/api/market-data/dataset.csv", params={"ticker": "TEST.NS"})
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "TEST.NS_2y_cleaned.csv" in csv_response.headers["content-disposition"]
    lines = csv_response.text.strip().splitlines()
    assert lines[0].startswith("date,")
    assert len(lines) == len(exact_market_data.df) + 1


def test_invalid_ticker_is_rejected_with_400(client):
    response = client.get("/api/market-data", params={"ticker": "BAD TICKER"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_market_data_errors_map_to_api_errors(client, patch_loader):
    patch_loader(
        None,
        raising=MarketDataError(
            "No data found for 'ZZZZ'.",
            code="no_data",
            status=404,
            ticker="ZZZZ",
        ),
    )

    response = client.get("/api/market-data/summary", params={"ticker": "ZZZZ"})

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "no_data"
    assert "ZZZZ" in body["error"]["message"]


def test_dashboard_payload_contains_model_and_forecast(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    response = client.get("/api/dashboard", params={"ticker": "TEST.NS", "period": "2y"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["latest_price"] > 0
    assert payload["model"]["mae"] == pytest.approx(0.0, abs=1e-4)
    assert payload["forecast"]["predicted_price"] > 0
    assert payload["series"]["price"]
    assert payload["insights"]


def test_trend_returns_and_quality_analytics(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    trend = client.get("/api/analytics/trend", params={"ticker": "TEST.NS"})
    returns = client.get("/api/analytics/returns", params={"ticker": "TEST.NS"})
    quality = client.get("/api/analytics/data-quality", params={"ticker": "TEST.NS"})

    assert trend.status_code == returns.status_code == quality.status_code == 200
    assert trend.json()["series"]
    assert returns.json()["series"]["histogram"]
    report = quality.json()
    assert report["metrics"]["cleaned_records"] == len(exact_market_data.df)


def test_model_train_persists_a_run(client, db, patch_loader, exact_market_data):
    from sqlalchemy import select

    from models.entities import ModelRun

    patch_loader(exact_market_data)

    response = client.post(
        "/api/model/train",
        json={"ticker": "TEST.NS", "period": "2y", "split_ratio": 0.7, "model_type": "lag"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["persisted"] is True
    assert payload["run_id"]
    assert payload["coefficients"]["slope"] == pytest.approx(1.0005, abs=1e-5)
    assert payload["sample"]["train_size"] + payload["sample"]["test_size"] == payload["sample"]["total_rows"]

    stored = db.execute(select(ModelRun)).scalars().all()
    assert len(stored) == 1
    assert stored[0].id == payload["run_id"]


def test_model_train_validates_split_ratio(client):
    response = client.post(
        "/api/model/train",
        json={"ticker": "RELIANCE.NS", "split_ratio": 0.95},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "request_validation_error"
    assert "split_ratio" in body["error"]["message"]


def test_model_metrics_endpoint_returns_equations(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    response = client.get("/api/model/metrics", params={"ticker": "TEST.NS", "split_ratio": 0.7})

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_label"] == "Previous-close Simple Linear Regression"
    assert "Y =" in payload["coefficients"]["equation"]
    assert payload["metrics"]["test"]["mape"] is not None
    assert payload["meta"]["adjusted"] is True


def test_watchlist_rest_endpoints(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    created = client.post("/api/watchlist", json={"ticker": "test.ns"})
    assert created.status_code == 201
    item_id = created.json()["item"]["id"]

    duplicate = client.post("/api/watchlist", json={"ticker": "TEST.NS"})
    assert duplicate.status_code == 409

    listing = client.get("/api/watchlist")
    assert listing.status_code == 200
    assert listing.json()["items"][0]["ticker"] == "TEST.NS"
    assert listing.json()["items"][0]["quote"]["latest_price"] > 0

    removed = client.delete(f"/api/watchlist/{item_id}")
    assert removed.status_code == 204
    assert client.get("/api/watchlist").json()["items"] == []
    assert client.delete(f"/api/watchlist/{item_id}").status_code == 404


def test_prediction_rest_endpoints(client, patch_loader, exact_market_data):
    patch_loader(exact_market_data)

    created = client.post(
        "/api/predictions",
        json={"ticker": "TEST.NS", "period": "2y", "split_ratio": 0.7, "horizon": 1},
    )
    assert created.status_code == 201
    prediction = created.json()["prediction"]
    assert prediction["status"] == "pending"

    listing = client.get("/api/predictions")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["stats"]["total"] == 1
    assert payload["stats"]["pending"] == 1

    single = client.get(f"/api/predictions/{prediction['id']}")
    assert single.status_code == 200
    assert single.json()["id"] == prediction["id"]
    assert client.get("/api/predictions/9999").status_code == 404


def test_alert_rest_endpoints(client):
    invalid = client.post("/api/alerts", json={"alert_type": "not_a_type"})
    assert invalid.status_code == 422

    created = client.post(
        "/api/alerts",
        json={"alert_type": "price_change_pct", "ticker": "TEST.NS", "threshold": 1.5},
    )
    assert created.status_code == 201
    alert = created.json()["alert"]
    assert alert["threshold"] == 1.5
    assert alert["enabled"] is True

    disabled = client.patch(f"/api/alerts/{alert['id']}", json={"enabled": False})
    assert disabled.status_code == 200
    assert disabled.json()["alert"]["enabled"] is False

    events = client.post("/api/alerts/evaluate", params={"ticker": "TEST.NS"})
    assert events.status_code == 200
    assert events.json()["checked"] == 0, "disabled alerts are not evaluated"

    assert client.delete(f"/api/alerts/{alert['id']}").status_code == 204
    assert client.delete(f"/api/alerts/{alert['id']}").status_code == 404
    assert client.get("/api/alerts").json()["alerts"] == []
