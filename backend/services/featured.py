from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from ml.data_loader import MarketData, load_market_data
from services.cache import cache
from utils import normalize_ticker, safe_round

FEATURED_COMPANIES: list[dict[str, str]] = [
    {"ticker": "RELIANCE.NS", "name": "Reliance Industries", "exchange": "NSE", "region": "India"},
    {"ticker": "TCS.NS", "name": "Tata Consultancy Services", "exchange": "NSE", "region": "India"},
    {"ticker": "HDFCBANK.NS", "name": "HDFC Bank", "exchange": "NSE", "region": "India"},
    {"ticker": "INFY.NS", "name": "Infosys", "exchange": "NSE", "region": "India"},
    {"ticker": "ICICIBANK.NS", "name": "ICICI Bank", "exchange": "NSE", "region": "India"},
    {"ticker": "BHARTIARTL.NS", "name": "Bharti Airtel", "exchange": "NSE", "region": "India"},
    {"ticker": "ITC.NS", "name": "ITC", "exchange": "NSE", "region": "India"},
    {"ticker": "TATAMOTORS.NS", "name": "Tata Motors", "exchange": "NSE", "region": "India"},
    {"ticker": "AAPL", "name": "Apple", "exchange": "NASDAQ", "region": "United States"},
    {"ticker": "MSFT", "name": "Microsoft", "exchange": "NASDAQ", "region": "United States"},
    {"ticker": "NVDA", "name": "NVIDIA", "exchange": "NASDAQ", "region": "United States"},
    {"ticker": "TSLA", "name": "Tesla", "exchange": "NASDAQ", "region": "United States"},
]

CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "HKD": "HK$", "CAD": "C$"}

CACHE_KEY = "featured:board:v1"
CACHE_TTL_SECONDS = 180


def _sparkline(close: pd.Series, points: int = 30) -> list[float]:
    tail = close.tail(points)
    return [safe_round(float(value), 4) for value in tail if pd.notna(value)]


def _quote(company: dict[str, str]) -> dict[str, Any]:
    ticker = normalize_ticker(company["ticker"])
    data: MarketData = load_market_data(ticker, period="1mo")
    closes = data.df["Close"].astype(float).dropna()
    if len(closes) < 2:
        raise ValueError(f"{ticker} returned fewer than two observations.")
    latest = float(closes.iloc[-1])
    previous = float(closes.iloc[-2])
    change = latest - previous
    change_pct = (change / previous * 100) if previous else None
    currency = str(data.meta.get("currency") or "USD")
    return {
        "ticker": ticker,
        "name": company["name"],
        "exchange": company["exchange"],
        "region": company["region"],
        "currency": currency,
        "currency_symbol": CURRENCY_SYMBOLS.get(currency, currency),
        "price": safe_round(latest, 4),
        "previous_close": safe_round(previous, 4),
        "change": safe_round(change, 4),
        "change_pct": safe_round(change_pct, 2),
        "as_of": pd.Timestamp(closes.index[-1]).strftime("%Y-%m-%d"),
        "retrieved_at": data.retrieved_at.isoformat(),
        "source": data.source,
        "stale": data.stale,
        "sparkline": _sparkline(closes),
    }


def get_featured_quotes() -> dict[str, Any]:
    cached = cache.get(CACHE_KEY, CACHE_TTL_SECONDS)
    if cached is not None:
        return {**cached, "cached": True}

    quotes: list[dict[str, Any]] = []
    unavailable: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_quote, company): company for company in FEATURED_COMPANIES}
        results: dict[str, dict[str, Any]] = {}
        for future, company in futures.items():
            try:
                results[company["ticker"]] = future.result()
            except Exception as exc:  # one failed symbol must not empty the board
                unavailable.append({"ticker": company["ticker"], "reason": type(exc).__name__})

    for company in FEATURED_COMPANIES:
        quote = results.get(company["ticker"])
        if quote is not None:
            quotes.append(quote)

    payload = {
        "quotes": quotes,
        "unavailable": unavailable,
        "available": bool(quotes),
        "count": len(quotes),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
        "message": (
            "Live quotes via yfinance. Values may be delayed and are shown exactly as returned by Yahoo Finance."
            if quotes
            else "No live quotes could be retrieved. Start the backend with network access to Yahoo Finance."
        ),
        "disclaimer": "Educational market data only. Not investment advice.",
    }
    if quotes:
        cache.set(CACHE_KEY, payload)
    return payload
