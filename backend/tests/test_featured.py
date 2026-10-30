from __future__ import annotations

from dataclasses import replace

import pytest

from services import featured as featured_service
from services.cache import cache


@pytest.fixture(autouse=True)
def clear_featured_cache():
    cache.invalidate("featured:")
    yield
    cache.invalidate("featured:")


def test_featured_quotes_are_live_and_ordered(client, monkeypatch, exact_market_data):
    def fake_loader(ticker, period="1mo", **_):
        currency = "INR" if ticker.endswith(".NS") else "USD"
        return replace(exact_market_data, ticker=ticker, meta={**exact_market_data.meta, "currency": currency})

    monkeypatch.setattr(featured_service, "load_market_data", fake_loader)

    response = client.get("/api/market-data/featured")

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["cached"] is False
    assert payload["count"] == len(featured_service.FEATURED_COMPANIES)
    assert [quote["ticker"] for quote in payload["quotes"]] == [
        company["ticker"] for company in featured_service.FEATURED_COMPANIES
    ]
    reliance = payload["quotes"][0]
    assert reliance["name"] == "Reliance Industries"
    assert reliance["currency"] == "INR"
    assert reliance["currency_symbol"] == "₹"
    assert reliance["price"] > 0
    assert reliance["change_pct"] is not None
    assert len(reliance["sparkline"]) == 30
    apple = next(quote for quote in payload["quotes"] if quote["ticker"] == "AAPL")
    assert apple["currency"] == "USD"
    assert apple["currency_symbol"] == "$"


def test_featured_response_is_cached(client, monkeypatch, exact_market_data):
    calls: list[str] = []

    def fake_loader(ticker, period="1mo", **_):
        calls.append(ticker)
        currency = "INR" if ticker.endswith(".NS") else "USD"
        return replace(exact_market_data, ticker=ticker, meta={**exact_market_data.meta, "currency": currency})

    monkeypatch.setattr(featured_service, "load_market_data", fake_loader)

    client.get("/api/market-data/featured")
    second = client.get("/api/market-data/featured")

    assert second.status_code == 200
    assert second.json()["cached"] is True
    assert len(calls) == len(featured_service.FEATURED_COMPANIES)


def test_featured_tolerates_a_failed_symbol(client, monkeypatch, exact_market_data):
    def fake_loader(ticker, period="1mo", **_):
        if ticker == "TSLA":
            raise RuntimeError("upstream unavailable")
        currency = "INR" if ticker.endswith(".NS") else "USD"
        return replace(exact_market_data, ticker=ticker, meta={**exact_market_data.meta, "currency": currency})

    monkeypatch.setattr(featured_service, "load_market_data", fake_loader)

    payload = client.get("/api/market-data/featured").json()

    assert payload["available"] is True
    assert payload["count"] == len(featured_service.FEATURED_COMPANIES) - 1
    assert [item["ticker"] for item in payload["unavailable"]] == ["TSLA"]
    assert all(quote["ticker"] != "TSLA" for quote in payload["quotes"])


def test_featured_never_fabricates_prices(client, monkeypatch):
    def fake_loader(ticker, period="1mo", **_):
        raise RuntimeError("offline")

    monkeypatch.setattr(featured_service, "load_market_data", fake_loader)

    payload = client.get("/api/market-data/featured").json()

    assert payload["available"] is False
    assert payload["quotes"] == []
    assert "Yahoo Finance" in payload["message"]
    assert "not investment advice" in payload["disclaimer"].lower()
