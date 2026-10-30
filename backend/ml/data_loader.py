from __future__ import annotations

import logging
import time
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from config import get_settings
from database.session import SessionLocal
from models.entities import StockData
from services.cache import cache
from services.runtime_state import runtime_state
from utils import jsonable, normalize_ticker

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", message=".*inplace keyword.*")

logger = logging.getLogger(__name__)
settings = get_settings()

PERIODS: dict[str, str] = {
    "5d": "5d",
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
    "max": "max",
}
INTERVALS = {"1d", "1wk", "1mo"}

CURRENCY_BY_SUFFIX = {
    ".NS": "INR",
    ".BO": "INR",
    ".NSE": "INR",
    ".L": "GBP",
    ".TO": "CAD",
    ".T": "JPY",
    ".HK": "HKD",
    ".DE": "EUR",
    ".PA": "EUR",
    ".AS": "EUR",
    ".MI": "EUR",
    ".AX": "AUD",
    ".SI": "SGD",
}


class MarketDataError(Exception):
    def __init__(
        self,
        message: str,
        code: str = "market_data_error",
        status: int = 422,
        ticker: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.ticker = ticker


@dataclass
class MarketData:
    ticker: str
    df: pd.DataFrame
    meta: dict[str, Any]
    retrieved_at: datetime
    source: str = "live"
    stale: bool = False
    warning: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def payload_meta(self) -> dict[str, Any]:
        meta = dict(self.meta)
        meta.update(
            {
                "ticker": self.ticker,
                "retrieved_at": self.retrieved_at.isoformat(),
                "source": self.source,
                "stale": self.stale,
                "warning": self.warning,
            }
        )
        return jsonable(meta)


def _cache_key(ticker: str, period: str, interval: str, start: str | None, end: str | None) -> str:
    return f"px:{ticker}:{period}:{interval}:{start or '-'}:{end or '-'}"


def _infer_currency(ticker: str) -> str:
    for suffix, currency in CURRENCY_BY_SUFFIX.items():
        if ticker.endswith(suffix):
            return currency
    return "USD"


def _normalise_frame(raw: pd.DataFrame) -> pd.DataFrame:
    if raw is None or raw.empty:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    df = raw.copy()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [str(col[0]) for col in df.columns]

    rename = {}
    for col in df.columns:
        key = str(col).strip().lower()
        mapping = {
            "open": "Open",
            "high": "High",
            "low": "Low",
            "close": "Close",
            "adj close": "AdjClose",
            "volume": "Volume",
            "dividends": "Dividends",
            "stock splits": "StockSplits",
        }
        if key in mapping:
            rename[col] = mapping[key]
    df = df.rename(columns=rename)

    if "Close" not in df.columns and "AdjClose" in df.columns:
        df["Close"] = df["AdjClose"]
    if "AdjClose" in df.columns:
        df["Close"] = df["AdjClose"]

    for col in ("Open", "High", "Low", "Close", "Volume"):
        if col not in df.columns:
            df[col] = 0.0 if col == "Volume" else float("nan")
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df[~df.index.duplicated(keep="last")]
    idx = pd.to_datetime(df.index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    df.index = idx.normalize()
    df.index.name = "Date"
    df = df.sort_index()
    df = df.dropna(subset=["Close"])
    df = df[df["Close"] > 0]
    df["Volume"] = df["Volume"].fillna(0)
    return df


def _fetch_info(ticker_obj) -> dict[str, Any]:
    key = f"info:{ticker_obj.ticker}"
    cached = cache.get(key, settings.info_cache_ttl_seconds)
    if cached is not None:
        return cached
    info: dict[str, Any] = {}
    try:
        fast = ticker_obj.fast_info
        for k in ("currency", "exchange", "quoteType", "marketCap", "fiftyDayAverage"):
            try:
                info[k] = fast.get(k)
            except Exception:
                continue
    except Exception:
        pass
    try:
        full = ticker_obj.get_info() or {}
        for k in (
            "shortName",
            "longName",
            "currency",
            "exchange",
            "fullExchangeName",
            "quoteType",
            "sector",
            "industry",
            "country",
            "website",
            "longBusinessSummary",
            "marketCap",
            "fiftyTwoWeekHigh",
            "fiftyTwoWeekLow",
            "trailingPE",
            "beta",
        ):
            value = full.get(k)
            if value not in (None, "", "N/A"):
                info[k] = value
    except Exception as exc:  # quote metadata is optional, never fatal
        logger.info("info lookup failed for %s: %s", ticker_obj.ticker, exc)
    info["name"] = info.get("longName") or info.get("shortName") or ticker_obj.ticker
    cache.set(key, info)
    return info


def _persist_daily(ticker: str, df: pd.DataFrame, currency: str) -> None:
    if df.empty:
        return
    rows = []
    now = datetime.now(timezone.utc)
    for idx, row in df.iterrows():
        rows.append(
            {
                "ticker": ticker,
                "date": idx.strftime("%Y-%m-%d"),
                "open": float(row["Open"]) if pd.notna(row["Open"]) else None,
                "high": float(row["High"]) if pd.notna(row["High"]) else None,
                "low": float(row["Low"]) if pd.notna(row["Low"]) else None,
                "close": float(row["Close"]) if pd.notna(row["Close"]) else None,
                "volume": float(row["Volume"]) if pd.notna(row["Volume"]) else None,
                "currency": currency,
                "retrieval_ts": now,
            }
        )
    if not rows:
        return
    try:
        with SessionLocal() as db:
            stmt = sqlite_insert(StockData).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["ticker", "date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "currency": stmt.excluded.currency,
                    "retrieval_ts": stmt.excluded.retrieval_ts,
                },
            )
            db.execute(stmt)
            db.commit()
    except Exception as exc:  # persistence must never break live analytics
        logger.warning("could not persist %s rows: %s", ticker, exc)


def _load_from_database(ticker: str) -> pd.DataFrame:
    with SessionLocal() as db:
        rows = db.execute(
            select(StockData).where(StockData.ticker == ticker).order_by(StockData.date)
        ).scalars().all()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp(r.date),
                "Open": r.open,
                "High": r.high,
                "Low": r.low,
                "Close": r.close,
                "Volume": r.volume or 0,
            }
            for r in rows
        ]
    ).set_index("Date")
    return df


def _slice_period(df: pd.DataFrame, period: str, start: str | None, end: str | None) -> pd.DataFrame:
    if df.empty:
        return df
    if start or end:
        s = pd.Timestamp(start) if start else df.index.min()
        e = pd.Timestamp(end) if end else df.index.max()
        return df[(df.index >= s) & (df.index <= e)]
    if period == "max":
        return df
    offsets = {"5d": 10, "1mo": 31, "3mo": 92, "6mo": 183, "1y": 366, "2y": 732, "5y": 1830}
    days = offsets.get(period)
    if days is None:
        return df
    cutoff = df.index.max() - pd.Timedelta(days=days)
    return df[df.index >= cutoff]


def load_market_data(
    ticker_raw: str,
    period: str = "2y",
    interval: str = "1d",
    start: str | None = None,
    end: str | None = None,
    refresh: bool = False,
) -> MarketData:
    ticker = normalize_ticker(ticker_raw)
    if period not in PERIODS and not (start or end):
        raise MarketDataError(f"Unsupported period '{period}'. Choose one of: {', '.join(PERIODS)}, custom.")
    if interval not in INTERVALS:
        raise MarketDataError("Unsupported interval. Use 1d, 1wk or 1mo.")
    if start and end and pd.Timestamp(start) > pd.Timestamp(end):
        raise MarketDataError("Start date must be before end date.")

    key = _cache_key(ticker, period, interval, start, end)
    if not refresh:
        cached = cache.get(key, settings.cache_ttl_seconds)
        if cached is not None:
            cached.source = "cache"
            return cached

    import yfinance as yf

    kwargs: dict[str, Any] = {"interval": interval, "auto_adjust": True, "actions": True}
    if start or end:
        kwargs["start"] = start
        kwargs["end"] = (pd.Timestamp(end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d") if end else None
    else:
        kwargs["period"] = period if period != "custom" else "2y"

    raw: pd.DataFrame = pd.DataFrame()
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            handle = yf.Ticker(ticker)
            raw = handle.history(**kwargs)
            if raw is not None and not raw.empty:
                break
        except Exception as exc:
            last_error = exc
        if attempt == 0:
            time.sleep(0.8)

    raw_quality: dict[str, Any] = {
        "raw_records": 0,
        "missing_values": 0,
        "duplicate_dates": 0,
        "invalid_prices": 0,
    }
    if raw is not None and not raw.empty:
        cols = [c for c in ("Open", "High", "Low", "Close") if c in raw.columns]
        close_col = "Close" if "Close" in raw.columns else ("Adj Close" if "Adj Close" in raw.columns else None)
        raw_quality["raw_records"] = int(len(raw))
        raw_quality["missing_values"] = int(raw[cols].isna().sum().sum()) if cols else 0
        raw_quality["duplicate_dates"] = int(raw.index.duplicated(keep="last").sum())
        if close_col:
            closes = pd.to_numeric(raw[close_col], errors="coerce")
            raw_quality["invalid_prices"] = int(((closes.isna()) | (closes <= 0)).sum())

    df = _normalise_frame(raw)
    retrieved_at = datetime.now(timezone.utc)

    if df.empty:
        db_df = _load_from_database(ticker)
        db_df = _slice_period(db_df, period, start, end)
        if not db_df.empty:
            currency = _infer_currency(ticker)
            return MarketData(
                ticker=ticker,
                df=db_df,
                meta={
                    "ticker": ticker,
                    "name": ticker,
                    "currency": currency,
                    "currency_symbol": "₹" if currency == "INR" else "$",
                    "exchange": "unknown",
                    "adjusted": True,
                    "price_label": "Adjusted closing price",
                },
                retrieved_at=datetime.now(timezone.utc),
                source="database",
                stale=True,
                warning=(
                    "Yahoo Finance returned no new data. Showing the last data stored locally in SQLite; "
                    "it may be outdated."
                ),
            )
        detail = "Yahoo Finance returned no historical data."
        if last_error:
            raise MarketDataError(
                f"Yahoo Finance could not be reached or returned an error for '{ticker}'. "
                f"Last error: {type(last_error).__name__}. Try again shortly.",
                code="upstream_error",
                status=502,
                ticker=ticker,
            )
        raise MarketDataError(
            f"No data found for '{ticker}'. Check the symbol (e.g. RELIANCE.NS, AAPL, ^NSEI) or try again later. {detail}",
            code="no_data",
            status=404,
            ticker=ticker,
        )

    if len(df) < 3:
        raise MarketDataError(
            f"Only {len(df)} observation(s) available for '{ticker}' in this range. Choose a longer period.",
            code="insufficient_data",
            status=422,
        )

    handle = yf.Ticker(ticker)
    info = _fetch_info(handle)
    currency = str(info.get("currency") or _infer_currency(ticker)).upper()

    last_dividend = None
    last_split = None
    if "Dividends" in df.columns:
        div = df["Dividends"][df["Dividends"] > 0]
        if not div.empty:
            last_idx = div.index[-1]
            last_dividend = {"date": last_idx.strftime("%Y-%m-%d"), "amount": round(float(div.iloc[-1]), 4)}
    if "StockSplits" in df.columns:
        spl = df["StockSplits"][df["StockSplits"] > 0]
        if not spl.empty:
            last_idx = spl.index[-1]
            last_split = {"date": last_idx.strftime("%Y-%m-%d"), "ratio": float(spl.iloc[-1])}

    df = df.drop(columns=[c for c in ("AdjClose", "Dividends", "StockSplits") if c in df.columns])

    meta: dict[str, Any] = {
        "ticker": ticker,
        "name": info.get("name") or ticker,
        "currency": currency,
        "currency_symbol": "₹" if currency == "INR" else ("$" if currency == "USD" else currency + " "),
        "exchange": info.get("fullExchangeName") or info.get("exchange") or "unknown",
        "exchange_code": info.get("exchange") or "unknown",
        "quote_type": info.get("quoteType"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "country": info.get("country"),
        "website": info.get("website"),
        "summary": (info.get("longBusinessSummary") or "")[:1200],
        "market_cap": info.get("marketCap"),
        "trailing_pe": info.get("trailingPE"),
        "beta": info.get("beta"),
        "last_dividend": last_dividend,
        "last_split": last_split,
        "adjusted": True,
        "price_label": "Adjusted closing price",
        "interval": interval,
        "period": period if not (start or end) else "custom",
        "start": df.index.min().strftime("%Y-%m-%d"),
        "end": df.index.max().strftime("%Y-%m-%d"),
        "observations": int(len(df)),
        "data_provider": "Yahoo Finance via yfinance",
        "quality": {
            **raw_quality,
            "cleaned_records": int(len(df)),
            "rows_removed": int(raw_quality["raw_records"] - len(df)),
            "usable_pct": round(len(df) / raw_quality["raw_records"] * 100, 2) if raw_quality["raw_records"] else None,
        },
    }

    _persist_daily(ticker, df, currency) if interval == "1d" else None

    result = MarketData(ticker=ticker, df=df, meta=meta, retrieved_at=retrieved_at, source="live")
    cache.set(key, result)
    runtime_state.record_success(ticker, "live")

    if cache.get(meta_cache_key(ticker)) is None:
        cache.set(meta_cache_key(ticker), meta)
    return result


def meta_cache_key(ticker: str) -> str:
    return f"meta:{ticker}"


def refresh_ticker(ticker_raw: str, period: str = "2y", interval: str = "1d") -> MarketData:
    cache.invalidate("px:")
    return load_market_data(ticker_raw, period=period, interval=interval, refresh=True)


def latest_close(ticker: str, refresh: bool = False) -> tuple[float, str]:
    data = load_market_data(ticker, period="3mo", refresh=refresh)
    df = data.df
    return float(df["Close"].iloc[-1]), df.index[-1].strftime("%Y-%m-%d")
