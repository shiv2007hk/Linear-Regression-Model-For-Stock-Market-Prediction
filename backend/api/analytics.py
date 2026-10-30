from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from config import get_settings
from database.session import SessionLocal
from ml.data_loader import load_market_data
from services.analytics import comparison_analysis, data_quality, returns_analysis, trend_analysis
from services.dashboard import dashboard_payload
from services.watchlist import watchlist_tickers
from utils import jsonable, normalize_ticker

router = APIRouter(prefix="/api", tags=["analytics"])
settings = get_settings()


def _ticker(ticker: str) -> str:
    return normalize_ticker(ticker)


@router.get("/dashboard")
def dashboard(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    split_ratio: float = Query(default=0.7, ge=0.5, le=0.9),
) -> dict[str, Any]:
    data = load_market_data(_ticker(ticker), period=period)
    with SessionLocal() as db:
        watch = watchlist_tickers(db)
    return jsonable(dashboard_payload(data, split_ratio=split_ratio, watchlist=watch))


@router.get("/analytics/trend")
def trend(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    data = load_market_data(_ticker(ticker), period=period, start=start, end=end)
    return jsonable(trend_analysis(data))


@router.get("/analytics/returns")
def returns(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> dict[str, Any]:
    data = load_market_data(_ticker(ticker), period=period)
    return jsonable(returns_analysis(data))


@router.get("/analytics/volatility")
def volatility(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> dict[str, Any]:
    data = load_market_data(_ticker(ticker), period=period)
    payload = returns_analysis(data)
    payload["focus"] = "volatility"
    return jsonable(payload)


@router.get("/analytics/comparison")
def comparison(
    tickers: str = Query(default="RELIANCE.NS,TCS.NS"),
    period: str = Query(default="1y"),
    start: str | None = None,
    end: str | None = None,
    benchmark: str | None = None,
) -> dict[str, Any]:
    selected = [t for t in (tickers or "").split(",") if t.strip()]
    return jsonable(comparison_analysis(selected, period=period, start=start, end=end, benchmark=benchmark))


@router.get("/analytics/data-quality")
def quality(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> dict[str, Any]:
    data = load_market_data(_ticker(ticker), period=period)
    return jsonable(data_quality(data))
