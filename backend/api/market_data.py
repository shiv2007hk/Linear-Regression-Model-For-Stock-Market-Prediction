from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from config import get_settings
from ml.data_loader import PERIODS, load_market_data, refresh_ticker
from schemas.requests import RefreshRequest
from services.analytics import data_quality
from services.cache import cache
from services.dashboard import basic_summary
from services.featured import get_featured_quotes
from services.runtime_state import runtime_state
from utils import frame_records, jsonable, normalize_ticker, safe_round

router = APIRouter(prefix="/api/market-data", tags=["market-data"])
settings = get_settings()


@router.get("")
def market_data(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    interval: str = Query(default="1d"),
    start: str | None = None,
    end: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    normalized = normalize_ticker(ticker)
    data = (
        refresh_ticker(normalized, period=period, interval=interval)
        if refresh
        else load_market_data(normalized, period=period, interval=interval, start=start, end=end)
    )
    df = data.df
    ohlcv = df.reset_index().rename(
        columns={"Date": "date", "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
    )
    return {
        "meta": data.payload_meta(),
        "summary": basic_summary(data),
        "ohlcv": frame_records(ohlcv),
        "last_updated": data.retrieved_at.isoformat(),
    }


@router.get("/summary")
def summary(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> dict[str, Any]:
    data = load_market_data(ticker, period=period)
    df = data.df
    close = df["Close"].astype(float)
    returns = close.pct_change().dropna()
    latest = float(close.iloc[-1])
    high = float(close.max())
    low = float(close.min())
    avg_vol = float(df["Volume"].mean())
    payload = basic_summary(data)
    payload["range_high"] = safe_round(high, 4)
    payload["range_high_date"] = close.idxmax().strftime("%Y-%m-%d")
    payload["range_low"] = safe_round(low, 4)
    payload["range_low_date"] = close.idxmin().strftime("%Y-%m-%d")
    payload["distance_from_range_high_pct"] = safe_round((latest - high) / high * 100, 2)
    payload["average_volume"] = safe_round(avg_vol, 0)
    payload["median_volume"] = safe_round(float(df["Volume"].median()), 0)
    payload["annualized_volatility_pct"] = safe_round(float(returns.std(ddof=1) * (252 ** 0.5) * 100), 2)
    payload["positive_days_pct"] = safe_round(float((returns > 0).mean() * 100), 2)
    payload["meta"] = data.payload_meta()
    payload["volume_series"] = [
        {"date": idx.strftime("%Y-%m-%d"), "volume": safe_round(float(row), 0)}
        for idx, row in df["Volume"].iloc[-120:].items()
    ]
    payload["data_age_seconds"] = safe_round(
        (pd.Timestamp.now(tz="UTC") - data.retrieved_at).total_seconds(), 0
    )
    return jsonable(payload)


@router.get("/quality")
def quality(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> dict[str, Any]:
    data = load_market_data(ticker, period=period)
    return jsonable(data_quality(data))


@router.get("/dataset")
def dataset(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=200),
    q: str = Query(default=""),
    sort: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict[str, Any]:
    data = load_market_data(ticker, period=period)
    df = data.df.reset_index().rename(
        columns={"Date": "date", "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
    )
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    if q:
        df = df[df["date"].str.contains(q.strip(), case=False, na=False)]
    df = df.sort_values("date", ascending=(sort == "asc"))
    total = int(len(df))
    start = (page - 1) * page_size
    page_df = df.iloc[start : start + page_size]
    quality_metrics = data_quality(data)["metrics"]
    return jsonable(
        {
            "meta": data.payload_meta(),
            "rows": frame_records(page_df),
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
            "quality": quality_metrics,
            "dataset_definition": (
                "Rows are chronological daily observations of adjusted OHLCV. The model-ready dataset additionally lags Close "
                "by one observation and drops the first row."
            ),
        }
    )


@router.post("/refresh")
def refresh(payload: RefreshRequest) -> dict[str, Any]:
    data = refresh_ticker(payload.ticker, period=payload.period, interval=payload.interval)
    runtime_state.record_success(data.ticker, data.source)
    return jsonable(
        {
            "meta": data.payload_meta(),
            "summary": basic_summary(data),
            "message": f"Refreshed {data.ticker} from Yahoo Finance at {data.retrieved_at.isoformat()}.",
            "row_count": int(len(data.df)),
        }
    )


@router.get("/dataset.csv")
def dataset_csv(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
) -> Response:
    data = load_market_data(ticker, period=period)
    df = data.df.reset_index().rename(
        columns={"Date": "date", "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
    )
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    csv_body = df.to_csv(index=False)
    filename = f"{data.ticker.replace('^', '')}_{period}_cleaned.csv"
    return Response(
        content=csv_body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/search")
def search(q: str = Query(min_length=1, max_length=40)) -> dict[str, Any]:
    key = f"search:{q.lower()}"
    cached = cache.get(key, 900)
    if cached is not None:
        return {"results": cached, "cached": True}
    try:
        import yfinance as yf

        search_result = yf.Search(q, max_results=8, news_count=0)
        quotes = search_result.quotes or []
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail={"code": "search_unavailable", "message": f"Symbol search failed: {type(exc).__name__}"}
        ) from exc
    results = [
        {
            "symbol": item.get("symbol"),
            "name": item.get("longname") or item.get("shortname"),
            "exchange": item.get("exchDisp") or item.get("exchange"),
            "quote_type": item.get("typeDisp") or item.get("quoteType"),
            "sector": item.get("sector"),
            "industry": item.get("industry"),
        }
        for item in quotes
        if item.get("symbol") and item.get("isYahooFinance", True)
    ][:8]
    cache.set(key, results)
    return {"results": results, "cached": False}


@router.get("/featured")
def featured() -> dict[str, Any]:
    return jsonable(get_featured_quotes())


@router.get("/periods")
def periods() -> dict[str, Any]:
    return {
        "periods": [
            {"value": "3mo", "label": "3 months"},
            {"value": "6mo", "label": "6 months"},
            {"value": "1y", "label": "1 year"},
            {"value": "2y", "label": "2 years"},
            {"value": "5y", "label": "5 years"},
            {"value": "max", "label": "Maximum"},
            {"value": "custom", "label": "Custom range"},
        ],
        "intervals": [
            {"value": "1d", "label": "Daily"},
            {"value": "1wk", "label": "Weekly"},
            {"value": "1mo", "label": "Monthly"},
        ],
        "supported": list(PERIODS.keys()),
    }
