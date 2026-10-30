from __future__ import annotations

from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import get_settings
from database.session import get_db
from ml.data_loader import load_market_data
from ml.diagnostics import residual_diagnostics
from ml.forecasting import build_forecast
from ml.regression_model import walk_forward
from models.entities import ModelRun
from schemas.requests import ForecastRequest, TrainRequest
from services.model_service import insights_payload, persist_run, run_training
from utils import iso_utc, jsonable, normalize_ticker, safe_round

router = APIRouter(prefix="/api/model", tags=["machine-learning"])
settings = get_settings()


@router.post("/train")
def train(payload: TrainRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    data = load_market_data(payload.ticker, period=payload.period)
    result = run_training(data, split_ratio=payload.split_ratio, model_type=payload.model_type)
    run = persist_run(db, payload.ticker, payload.model_type, result, payload.split_ratio)
    result["run_id"] = run.id
    result["persisted"] = True
    return jsonable(result)


@router.get("/metrics")
def metrics(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    split_ratio: float = Query(default=0.7, ge=0.5, le=0.9),
    model_type: str = Query(default="lag", pattern="^(lag|trend)$"),
) -> dict[str, Any]:
    data = load_market_data(normalize_ticker(ticker), period=period)
    result = run_training(data, split_ratio=split_ratio, model_type=model_type)
    return jsonable(
        {
            "ticker": result["ticker"],
            "meta": result["meta"],
            "model_label": result["model_label"],
            "coefficients": result["coefficients"],
            "operational_coefficients": result["operational_coefficients"],
            "sample": result["sample"],
            "metrics": result["metrics"],
            "residual_stats": result["residual_stats"],
            "trained_at": result["trained_at"],
            "insights": result["insights"],
        }
    )


@router.get("/backtest")
def backtest(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    split_ratio: float = Query(default=0.7, ge=0.5, le=0.9),
    model_type: str = Query(default="lag", pattern="^(lag|trend)$"),
    include_walk_forward: bool = Query(default=False),
) -> dict[str, Any]:
    data = load_market_data(normalize_ticker(ticker), period=period)
    result = run_training(data, split_ratio=split_ratio, model_type=model_type)

    test_rows = result["series"]["test"]
    residuals = [r["error"] for r in test_rows if r.get("error") is not None]
    symbol = data.meta.get("currency_symbol", "$")

    volatile_insight = "Not enough test observations to split by volatility."
    if len(test_rows) >= 20:
        moves = [abs((r["actual"] or 0) - (r["previous"] or 0)) / (r["previous"] or 1) for r in test_rows]
        median = float(np.median(moves))
        high = [r for r, m in zip(test_rows, moves) if m >= median]
        low = [r for r, m in zip(test_rows, moves) if m < median]
        high_mae = float(np.mean([r["abs_error"] for r in high])) if high else None
        low_mae = float(np.mean([r["abs_error"] for r in low])) if low else None
        if high_mae is not None and low_mae is not None:
            volatile_insight = (
                f"On test days with above-median absolute moves, MAE is {symbol}{high_mae:,.2f}; on calmer days it is "
                f"{symbol}{low_mae:,.2f}. Errors expand when the market moves more."
            )

    pred_vs_actual = [
        {"date": r["date"], "actual": r["actual"], "predicted": r["predicted"], "previous": r["previous"]}
        for r in test_rows
    ]
    direction_rows = [
        {"date": r["date"], "actual_direction": (1 if (r["actual"] or 0) > (r["previous"] or 0) else -1),
         "predicted_direction": (1 if (r["predicted"] or 0) > (r["previous"] or 0) else -1),
         "correct": r["direction_correct"]}
        for r in test_rows
        if r.get("previous") is not None
    ]

    insights = list(result["insights"])
    if residuals:
        mean_resid = float(np.mean(residuals))
        over = float(np.mean(np.asarray(residuals) < 0) * 100)
        insights.append(
            f"Mean signed error is {symbol}{mean_resid:+.2f}; {over:.1f}% of test predictions were above the actual value "
            f"(over-predictions) and {100 - over:.1f}% were below it."
        )
    insights.append(volatile_insight)
    test_r2 = result["metrics"]["test"]["r2"]
    train_r2 = result["metrics"]["train"]["r2"]
    if test_r2 is not None and train_r2 is not None:
        insights.append(
            f"Training R² {train_r2:.4f} versus test R² {test_r2:.4f}: the gap of {train_r2 - test_r2:+.4f} is a direct "
            "measure of how much the in-sample fit overstates out-of-sample skill."
        )

    wf = None
    if include_walk_forward:
        wf = walk_forward(data.df, split_ratio=split_ratio, model_type=model_type)
        wf_insight = (
            f"Expanding-window walk-forward MAE is {symbol}{wf['metrics']['mae']:,.2f} across {wf['n_predictions']} one-step "
            "predictions, each fitted only on information available before that date."
        )
        insights.append(wf_insight)

    return jsonable(
        {
            "ticker": result["ticker"],
            "meta": result["meta"],
            "model_label": result["model_label"],
            "coefficients": result["coefficients"],
            "sample": result["sample"],
            "metrics": result["metrics"],
            "series": {
                "test": test_rows,
                "predictions_vs_actual": pred_vs_actual,
                "direction": direction_rows,
                "residuals": result["series"]["residuals"],
            },
            "walk_forward": wf,
            "insights": insights,
            "trained_at": result["trained_at"],
            "disclaimer": "Out-of-sample results only. Past errors do not guarantee future performance.",
        }
    )


@router.post("/forecast")
def forecast(payload: ForecastRequest) -> dict[str, Any]:
    data = load_market_data(payload.ticker, period=payload.period)
    result = run_training(data, split_ratio=payload.split_ratio, model_type="lag")
    fc = build_forecast(data.df, payload.ticker, data.meta, result, horizon=payload.horizon)
    result["meta"] = data.payload_meta()
    return jsonable(
        {
            **fc,
            "meta": data.payload_meta(),
            "model": {
                "equation": result["coefficients"]["equation"],
                "holdout_intercept": result["coefficients"]["intercept"],
                "holdout_slope": result["coefficients"]["slope"],
                "operational_intercept": result["operational_coefficients"]["intercept"],
                "operational_slope": result["operational_coefficients"]["slope"],
                "sample": result["sample"],
                "test_metrics": result["metrics"]["test"],
                "naive_metrics": result["metrics"]["naive"],
            },
        }
    )


@router.get("/diagnostics")
def diagnostics(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    split_ratio: float = Query(default=0.7, ge=0.5, le=0.9),
) -> dict[str, Any]:
    data = load_market_data(normalize_ticker(ticker), period=period)
    result = run_training(data, split_ratio=split_ratio, model_type="lag")
    diag = residual_diagnostics(result)
    diag["ticker"] = result["ticker"]
    diag["meta"] = data.payload_meta()
    diag["sample"] = result["sample"]
    diag["coefficients"] = result["coefficients"]
    return jsonable(diag)


@router.get("/insights")
def insights(
    ticker: str = Query(default=settings.default_ticker),
    period: str = Query(default="2y"),
    split_ratio: float = Query(default=0.7, ge=0.5, le=0.9),
) -> dict[str, Any]:
    data = load_market_data(normalize_ticker(ticker), period=period)
    result = run_training(data, split_ratio=split_ratio, model_type="lag")
    return jsonable(insights_payload(data, result))


@router.get("/runs")
def runs(
    ticker: str = Query(default=settings.default_ticker),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    normalized = normalize_ticker(ticker)
    rows = db.execute(
        select(ModelRun).where(ModelRun.ticker == normalized).order_by(ModelRun.training_ts.desc()).limit(limit)
    ).scalars().all()
    return jsonable(
        {
            "ticker": normalized,
            "runs": [
                {
                    "id": r.id,
                    "model_type": r.model_type,
                    "trained_at": iso_utc(r.training_ts),
                    "train_range": [r.train_start, r.train_end],
                    "test_range": [r.test_start, r.test_end],
                    "slope": safe_round(r.slope, 6),
                    "intercept": safe_round(r.intercept, 6),
                    "mae": safe_round(r.mae, 4),
                    "rmse": safe_round(r.rmse, 4),
                    "r2": safe_round(r.r2, 4),
                    "mape": safe_round(r.mape, 4),
                    "directional_accuracy": safe_round(r.directional_accuracy, 2),
                    "baseline_mae": safe_round(r.baseline_mae, 4),
                    "train_size": r.train_size,
                    "test_size": r.test_size,
                }
                for r in rows
            ],
        }
    )
