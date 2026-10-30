from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ml.data_loader import MarketDataError, load_market_data
from ml.forecasting import build_forecast
from ml.regression_model import train_and_evaluate
from models.entities import ModelRun, PredictionHistory
from utils import iso_utc, normalize_ticker, safe_round


def _serialize(p: PredictionHistory) -> dict[str, Any]:
    return {
        "id": p.id,
        "ticker": p.ticker,
        "model_run_id": p.model_run_id,
        "base_date": p.base_date,
        "input_price": safe_round(p.input_price, 4),
        "predicted_price": safe_round(p.predicted_price, 4),
        "predicted_change_pct": safe_round(p.predicted_change_pct, 4),
        "forecast_date": p.forecast_date,
        "forecast_date_verified": p.forecast_date_verified,
        "coefficients": {"intercept": safe_round(p.intercept, 6), "slope": safe_round(p.slope, 6)},
        "train_range": {"start": p.train_start, "end": p.train_end},
        "metrics": {
            "mae": safe_round(p.test_mae, 4),
            "rmse": safe_round(p.test_rmse, 4),
            "r2": safe_round(p.test_r2, 4),
            "mape": safe_round(p.test_mape, 4),
        },
        "prediction_ts": iso_utc(p.prediction_ts),
        "actual_price": safe_round(p.actual_price, 4),
        "absolute_error": safe_round(p.absolute_error, 4),
        "percentage_error": safe_round(p.percentage_error, 4),
        "resolved_at": iso_utc(p.resolved_at),
        "status": "resolved" if p.actual_price is not None else "pending",
    }


def create_prediction(
    db: Session,
    ticker_raw: str,
    period: str = "2y",
    split_ratio: float = 0.7,
    horizon: int = 1,
) -> dict[str, Any]:
    ticker = normalize_ticker(ticker_raw)
    data = load_market_data(ticker, period=period)
    symbol = data.meta.get("currency_symbol", "$")
    model = train_and_evaluate(
        data.df, ticker, split_ratio=split_ratio, model_type="lag", currency_symbol=symbol,
        price_label=data.meta.get("price_label", "adjusted close"),
    )
    forecast = build_forecast(data.df, ticker, data.meta, model, horizon=horizon)
    fc = forecast["forecast"]

    run = ModelRun(
        ticker=ticker,
        model_type="lag",
        train_start=model["sample"]["train_start"],
        train_end=model["sample"]["train_end"],
        test_start=model["sample"]["test_start"],
        test_end=model["sample"]["test_end"],
        intercept=model["coefficients"]["intercept"],
        slope=model["coefficients"]["slope"],
        mae=model["metrics"]["test"]["mae"],
        mse=model["metrics"]["test"]["mse"],
        rmse=model["metrics"]["test"]["rmse"],
        r2=model["metrics"]["test"]["r2"],
        mape=model["metrics"]["test"]["mape"],
        directional_accuracy=model["metrics"]["test"]["directional_accuracy"],
        baseline_mae=model["metrics"]["naive"]["mae"],
        train_size=model["sample"]["train_size"],
        test_size=model["sample"]["test_size"],
        split_ratio=split_ratio,
    )
    db.add(run)
    db.flush()

    prediction = PredictionHistory(
        ticker=ticker,
        model_run_id=run.id,
        base_date=forecast["last_observation"]["date"],
        input_price=forecast["last_observation"]["close"],
        predicted_price=fc["predicted_price"],
        predicted_change_pct=fc["percentage_change"],
        forecast_date=fc["date"],
        forecast_date_verified=fc["date_verified"],
        intercept=model["coefficients"]["intercept"],
        slope=model["coefficients"]["slope"],
        train_start=model["sample"]["train_start"],
        train_end=model["sample"]["train_end"],
        test_mae=model["metrics"]["test"]["mae"],
        test_rmse=model["metrics"]["test"]["rmse"],
        test_r2=model["metrics"]["test"]["r2"],
        test_mape=model["metrics"]["test"]["mape"],
        prediction_ts=datetime.now(timezone.utc),
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    return {
        "prediction": _serialize(prediction),
        "forecast": forecast,
        "model": {
            "equation": model["coefficients"]["equation"],
            "sample": model["sample"],
            "metrics": model["metrics"],
        },
    }


def resolve_pending(db: Session) -> int:
    pending = db.execute(
        select(PredictionHistory).where(PredictionHistory.actual_price.is_(None))
    ).scalars().all()
    if not pending:
        return 0

    by_ticker: dict[str, list[PredictionHistory]] = {}
    for p in pending:
        by_ticker.setdefault(p.ticker, []).append(p)

    resolved = 0
    now = datetime.now(timezone.utc)
    for ticker, rows in by_ticker.items():
        start = min(r.base_date for r in rows)
        try:
            data = load_market_data(ticker, start=start, end=date.today().isoformat())
        except MarketDataError:
            continue
        closes = data.df["Close"].astype(float)
        dates = [d.strftime("%Y-%m-%d") for d in closes.index]
        for row in rows:
            candidates = [i for i, d in enumerate(dates) if d > row.base_date]
            if not candidates:
                continue
            idx = candidates[0]
            actual = float(closes.iloc[idx])
            row.actual_price = actual
            row.absolute_error = abs(actual - row.predicted_price)
            row.percentage_error = abs(actual - row.predicted_price) / actual * 100 if actual else None
            row.resolved_at = now
            resolved += 1
    if resolved:
        db.commit()
    return resolved


def list_predictions(db: Session, ticker: str | None = None) -> dict[str, Any]:
    auto_resolved = resolve_pending(db)
    stmt = select(PredictionHistory).order_by(PredictionHistory.prediction_ts.desc())
    if ticker:
        stmt = stmt.where(PredictionHistory.ticker == normalize_ticker(ticker))
    rows = db.execute(stmt).scalars().all()
    serialized = [_serialize(r) for r in rows]
    resolved = [r for r in serialized if r["status"] == "resolved"]
    pending = [r for r in serialized if r["status"] == "pending"]

    stats: dict[str, Any] = {
        "total": len(serialized),
        "resolved": len(resolved),
        "pending": len(pending),
        "mae": None,
        "mape": None,
        "directional_hit_rate": None,
    }
    if resolved:
        errors = [r["absolute_error"] for r in resolved]
        pct_errors = [r["percentage_error"] for r in resolved if r["percentage_error"] is not None]
        stats["mae"] = safe_round(float(np.mean(errors)), 4)
        stats["mape"] = safe_round(float(np.mean(pct_errors)), 4) if pct_errors else None
        hits = []
        for r in resolved:
            if r["input_price"] and r["actual_price"]:
                actual_dir = math.copysign(1, r["actual_price"] - r["input_price"])
                pred_dir = math.copysign(1, r["predicted_price"] - r["input_price"])
                hits.append(actual_dir == pred_dir)
        stats["directional_hit_rate"] = safe_round(float(np.mean(hits) * 100), 2) if hits else None

    by_ticker: dict[str, list[dict[str, Any]]] = {}
    for r in resolved:
        by_ticker.setdefault(r["ticker"], []).append(r)
    ticker_rows = [
        {
            "ticker": t,
            "count": len(items),
            "mae": safe_round(float(np.mean([i["absolute_error"] for i in items])), 4),
            "mape": safe_round(
                float(np.mean([i["percentage_error"] for i in items if i["percentage_error"] is not None])), 4
            )
            if any(i["percentage_error"] is not None for i in items)
            else None,
        }
        for t, items in by_ticker.items()
    ]

    by_month: dict[str, list[float]] = {}
    for r in resolved:
        month = (r["forecast_date"] or r["base_date"])[:7]
        by_month.setdefault(month, []).append(r["percentage_error"] or 0.0)
    monthly_rows = [
        {"month": m, "mape": safe_round(float(np.mean(v)), 4), "count": len(v)}
        for m, v in sorted(by_month.items())
    ]

    errors = [r["absolute_error"] for r in resolved]
    histogram = []
    pct = [r["percentage_error"] for r in resolved if r["percentage_error"] is not None]
    if pct:
        counts, edges = np.histogram(np.asarray(pct), bins=20)
        histogram = [
            {
                "center": safe_round(float((edges[i] + edges[i + 1]) / 2), 4),
                "count": int(counts[i]),
                "bin_start": safe_round(float(edges[i]), 4),
                "bin_end": safe_round(float(edges[i + 1]), 4),
            }
            for i in range(len(counts))
        ]

    series_rows = [
        {
            "date": r["base_date"],
            "ticker": r["ticker"],
            "input_price": r["input_price"],
            "predicted_price": r["predicted_price"],
            "actual_price": r["actual_price"],
            "percentage_error": r["percentage_error"],
            "resolved_at": r["resolved_at"],
        }
        for r in sorted(resolved, key=lambda x: x["base_date"])
    ]

    insights = []
    if resolved:
        insights.append(
            f"{len(resolved)} saved prediction(s) have been resolved against the next actual observation; "
            f"average absolute error is {stats['mae']} and average percentage error is {stats['mape']}%."
        )
        insights.append(
            f"Directional hit rate is {stats['directional_hit_rate']}% across resolved predictions — the same structural limitation "
            "seen in backtesting applies here."
        )
    else:
        insights.append(
            "No predictions have been resolved yet. A prediction resolves automatically once the next market observation is available."
        )
    if pending:
        insights.append(
            f"{len(pending)} prediction(s) are pending. They will resolve on the next data refresh after an actual observation exists."
        )
    insights.append(
        "Saved predictions store the input price, forecast, coefficients, sample range and evaluation metrics so the record can be audited later."
    )

    return {
        "predictions": serialized,
        "stats": stats,
        "by_ticker": ticker_rows,
        "monthly": monthly_rows,
        "series": {
            "predictions_vs_actual": series_rows,
            "error_over_time": [
                {"date": r["date"], "percentage_error": r["percentage_error"], "ticker": r["ticker"]}
                for r in series_rows
            ],
            "error_histogram": histogram,
        },
        "insights": insights,
        "auto_resolved_now": auto_resolved,
    }
