from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ml.data_loader import MarketDataError, load_market_data
from models.entities import ModelRun, WatchlistItem
from utils import iso_utc, normalize_ticker, safe_round


def _latest_model_run(db: Session, ticker: str) -> ModelRun | None:
    return db.execute(
        select(ModelRun).where(ModelRun.ticker == ticker).order_by(ModelRun.training_ts.desc()).limit(1)
    ).scalar_one_or_none()


def _quote(ticker: str) -> dict[str, Any] | None:
    try:
        data = load_market_data(ticker, period="6mo")
    except MarketDataError:
        return None
    close = data.df["Close"].astype(float)
    if len(close) < 2:
        return None
    rets = close.pct_change().dropna()
    spark = close.iloc[-40:]
    return {
        "ticker": ticker,
        "name": data.meta.get("name"),
        "currency": data.meta.get("currency"),
        "currency_symbol": data.meta.get("currency_symbol", "$"),
        "latest_price": safe_round(float(close.iloc[-1]), 4),
        "change": safe_round(float(close.iloc[-1] - close.iloc[-2]), 4),
        "change_pct": safe_round(float(close.iloc[-1] / close.iloc[-2] - 1) * 100, 2),
        "total_return_pct": safe_round(float(close.iloc[-1] / close.iloc[0] - 1) * 100, 2),
        "volatility_pct": safe_round(float(rets.std(ddof=1) * np.sqrt(252) * 100), 2),
        "sparkline": [safe_round(float(v), 3) for v in spark.to_numpy()],
        "sparkline_dates": [d.strftime("%Y-%m-%d") for d in spark.index],
        "normalized": [
            {"date": idx.strftime("%Y-%m-%d"), "value": safe_round(float(v), 3)}
            for idx, v in (close / close.iloc[0] * 100).items()
        ],
        "last_date": close.index[-1].strftime("%Y-%m-%d"),
        "retrieved_at": data.retrieved_at.isoformat(),
    }


def list_watchlist(db: Session) -> dict[str, Any]:
    items = db.execute(select(WatchlistItem).order_by(WatchlistItem.date_added)).scalars().all()
    tickers = [item.ticker for item in items]
    quotes: dict[str, dict[str, Any]] = {}
    if tickers:
        with ThreadPoolExecutor(max_workers=min(4, len(tickers))) as pool:
            for result in pool.map(_quote, tickers):
                if result:
                    quotes[result["ticker"]] = result

    rows = []
    for item in items:
        q = quotes.get(item.ticker)
        run = _latest_model_run(db, item.ticker)
        model = None
        if run:
            model = {
                "run_id": run.id,
                "trained_at": iso_utc(run.training_ts),
                "mae": safe_round(run.mae, 4),
                "r2": safe_round(run.r2, 4),
                "mape": safe_round(run.mape, 4),
                "directional_accuracy": safe_round(run.directional_accuracy, 2),
                "train_start": run.train_start,
                "train_end": run.train_end,
            }
        rows.append(
            {
                "id": item.id,
                "ticker": item.ticker,
                "date_added": iso_utc(item.date_added),
                "quote": q,
                "model_status": model,
            }
        )

    available = [r for r in rows if r["quote"]]
    best = max(available, key=lambda r: r["quote"]["total_return_pct"], default=None)
    worst = min(available, key=lambda r: r["quote"]["total_return_pct"], default=None)
    most_volatile = max(available, key=lambda r: r["quote"]["volatility_pct"], default=None)

    insights = []
    if available:
        insights.append(
            f"{len(available)} of {len(rows)} watchlist stocks have fresh price data. "
            f"Across the 6-month window, {best['ticker']} is the strongest performer ({best['quote']['total_return_pct']:+.2f}%) "
            f"and {worst['ticker']} the weakest ({worst['quote']['total_return_pct']:+.2f}%)."
        )
        insights.append(
            f"{most_volatile['ticker']} has the highest annualised historical volatility "
            f"({most_volatile['quote']['volatility_pct']:.2f}%). High volatility widens the likely forecast error."
        )
        with_model = len([r for r in rows if r["model_status"]])
        insights.append(
            f"{with_model} stock(s) have a stored model evaluation. Train a model in the Model Lab to populate missing evaluation status."
        )
        insights.append(
            "This is a research watchlist stored in SQLite — not a brokerage portfolio, and no ownership of securities is implied."
        )
    else:
        insights.append("Add tickers to the watchlist to see live quotes, volatility and model evaluation status.")

    scatter = [
        {
            "ticker": r["ticker"],
            "volatility_pct": r["quote"]["volatility_pct"],
            "return_pct": r["quote"]["total_return_pct"],
        }
        for r in available
    ]

    return {
        "items": rows,
        "analytics": {
            "count": len(rows),
            "with_quotes": len(available),
            "best": best["ticker"] if best else None,
            "worst": worst["ticker"] if worst else None,
            "most_volatile": most_volatile["ticker"] if most_volatile else None,
            "last_update": max((r["quote"]["retrieved_at"] for r in available), default=None),
            "volatility_ranking": [
                {"ticker": r["ticker"], "volatility_pct": r["quote"]["volatility_pct"]}
                for r in sorted(available, key=lambda r: r["quote"]["volatility_pct"], reverse=True)
            ],
        },
        "series": {
            "normalized": [
                {"ticker": r["ticker"], "points": r["quote"]["normalized"]}
                for r in available
            ],
            "returns_bar": [
                {"ticker": r["ticker"], "total_return_pct": r["quote"]["total_return_pct"]}
                for r in available
            ],
            "risk_return": scatter,
        },
        "insights": insights,
    }


def add_watchlist(db: Session, ticker_raw: str) -> dict[str, Any]:
    ticker = normalize_ticker(ticker_raw)
    existing = db.execute(select(WatchlistItem).where(WatchlistItem.ticker == ticker)).scalar_one_or_none()
    if existing:
        raise ValueError(f"{ticker} is already on the watchlist.")
    data = load_market_data(ticker, period="1mo")
    item = WatchlistItem(ticker=ticker)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "ticker": item.ticker,
        "date_added": iso_utc(item.date_added),
        "name": data.meta.get("name"),
    }


def remove_watchlist(db: Session, item_id: int) -> None:
    item = db.get(WatchlistItem, item_id)
    if not item:
        raise LookupError("Watchlist item not found.")
    db.execute(delete(WatchlistItem).where(WatchlistItem.id == item_id))
    db.commit()


def watchlist_tickers(db: Session) -> list[dict[str, Any]]:
    items = db.execute(select(WatchlistItem).order_by(WatchlistItem.date_added)).scalars().all()
    return [{"id": i.id, "ticker": i.ticker} for i in items]
