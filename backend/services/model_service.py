from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from ml.data_loader import MarketData
from ml.regression_model import train_and_evaluate
from models.entities import ModelRun
from utils import safe_round


def run_training(
    data: MarketData,
    split_ratio: float = 0.7,
    model_type: str = "lag",
) -> dict[str, Any]:
    result = train_and_evaluate(
        data.df,
        data.ticker,
        split_ratio=split_ratio,
        model_type=model_type,
        currency_symbol=data.meta.get("currency_symbol", "$"),
        price_label=data.meta.get("price_label", "adjusted close"),
    )
    result["meta"] = data.payload_meta()
    return result


def persist_run(db: Session, ticker: str, model_type: str, result: dict[str, Any], split_ratio: float) -> ModelRun:
    run = ModelRun(
        ticker=ticker,
        model_type=model_type,
        train_start=result["sample"]["train_start"],
        train_end=result["sample"]["train_end"],
        test_start=result["sample"]["test_start"],
        test_end=result["sample"]["test_end"],
        intercept=result["coefficients"]["intercept"],
        slope=result["coefficients"]["slope"],
        mae=result["metrics"]["test"]["mae"],
        mse=result["metrics"]["test"]["mse"],
        rmse=result["metrics"]["test"]["rmse"],
        r2=result["metrics"]["test"]["r2"],
        mape=result["metrics"]["test"]["mape"],
        directional_accuracy=result["metrics"]["test"]["directional_accuracy"],
        baseline_mae=result["metrics"]["naive"]["mae"],
        train_size=result["sample"]["train_size"],
        test_size=result["sample"]["test_size"],
        split_ratio=split_ratio,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def insights_payload(data: MarketData, result: dict[str, Any]) -> dict[str, Any]:
    intercept = float(result["coefficients"]["intercept"])
    slope = float(result["coefficients"]["slope"])
    latest = float(data.df["Close"].iloc[-1])
    symbol = data.meta.get("currency_symbol", "$")
    currency = data.meta.get("currency")

    example_x = latest
    example_y = intercept + slope * example_x
    sensitivity = []
    for pct in (-0.05, -0.02, 0.0, 0.02, 0.05):
        x = latest * (1 + pct)
        sensitivity.append(
            {
                "x": safe_round(x, 4),
                "predicted": safe_round(intercept + slope * x, 4),
                "difference_vs_latest": safe_round((intercept + slope * x) - example_y, 4),
                "x_change_pct": safe_round(pct * 100, 2),
            }
        )

    comparison = [
        {
            "input_price": row["x"],
            "predicted_price": row["predicted"],
        }
        for row in sensitivity
    ]

    return {
        "meta": data.payload_meta(),
        "equation": result["coefficients"]["equation"],
        "coefficients": result["coefficients"],
        "operational_coefficients": result["operational_coefficients"],
        "feature": {
            "name": result["feature_label"],
            "description": "The single independent variable X. No other feature is used, and moving averages are never silently added.",
        },
        "target": {
            "name": result["target_label"],
            "description": "The dependent variable Y: the current observation's adjusted closing price.",
        },
        "sample": result["sample"],
        "metrics": result["metrics"],
        "scatter": result["scatter"],
        "example": {
            "x": safe_round(example_x, 4),
            "intercept": safe_round(intercept, 6),
            "slope": safe_round(slope, 6),
            "predicted": safe_round(example_y, 4),
            "math": f"Y = {intercept:.4f} + ({slope:.4f} × {example_x:.2f}) = {example_y:.4f}",
            "one_unit_change": safe_round(slope, 6),
            "currency_symbol": symbol,
            "currency": currency,
        },
        "sensitivity": sensitivity,
        "prediction_comparison": comparison,
        "residual_histogram": _residual_histogram(result),
        "explanations": [
            f"The slope is {slope:.4f}. In this single-feature model, a {symbol}1.00 higher previous close is associated with a "
            f"{symbol}{slope:.4f} higher current close.",
            f"The intercept is {intercept:.4f}. It is the prediction when X = 0, which has no realistic financial meaning for a "
            "traded price — interpret the slope and the equation together rather than the intercept alone.",
            f"For the latest close of {symbol}{latest:,.2f}, the fitted model would predict {symbol}{example_y:,.2f} for the next observation "
            f"(before refitting on the full sample for the operational forecast).",
            "Correlation is not causation: prices co-move with yesterday's price because of persistence and market microstructure, "
            "not because yesterday's close mechanically causes today's close.",
            "The model cannot see earnings, news, policy decisions, sentiment, liquidity or macro shocks. Those unmodelled events "
            "are exactly where large errors come from.",
            "A high training R² mostly reflects price persistence. Judge the model on out-of-sample metrics and against the naive baseline.",
        ],
        "disclaimer": "Educational model explanation only. Not investment advice.",
    }


def _residual_histogram(result: dict[str, Any]) -> list[dict[str, Any]]:
    residuals = [r["error"] for r in result["series"]["test"] if r.get("error") is not None]
    if len(residuals) < 5:
        return []
    counts, edges = np.histogram(np.asarray(residuals, dtype=float), bins=20)
    return [
        {
            "center": safe_round(float((edges[i] + edges[i + 1]) / 2), 4),
            "count": int(counts[i]),
            "bin_start": safe_round(float(edges[i]), 4),
            "bin_end": safe_round(float(edges[i + 1]), 4),
        }
        for i in range(len(counts))
    ]


def forecast_insights(forecast: dict[str, Any]) -> list[str]:
    return forecast.get("insights", [])
