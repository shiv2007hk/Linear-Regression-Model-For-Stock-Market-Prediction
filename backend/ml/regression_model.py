from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from ml.evaluation import downsample, metric_bundle
from ml.preprocessing import build_supervised, chronological_split, split_dates
from utils import safe_round

MODEL_LABELS = {
    "lag": "Previous-close Simple Linear Regression",
    "trend": "Time-index trend Simple Linear Regression (educational)",
}


def _fit(x: np.ndarray, y: np.ndarray) -> LinearRegression:
    model = LinearRegression()
    model.fit(x.reshape(-1, 1), y)
    return model


def _equation(intercept: float, slope: float, symbol: str = "Y") -> str:
    b0 = f"−{abs(intercept):.4f}" if intercept < 0 else f"{intercept:.4f}"
    operator = "−" if slope < 0 else "+"
    return f"{symbol} = {b0} {operator} {abs(slope):.4f} · X"


def train_and_evaluate(
    df: pd.DataFrame,
    ticker: str,
    split_ratio: float = 0.7,
    model_type: str = "lag",
    currency_symbol: str = "$",
    price_label: str = "adjusted close",
) -> dict[str, Any]:
    data = build_supervised(df, model_type)
    n = len(data)
    n_train = chronological_split(n, split_ratio)
    train = data.iloc[:n_train]
    test = data.iloc[n_train:]

    X_train = train["x"].to_numpy(dtype=float)
    y_train = train["y"].to_numpy(dtype=float)
    X_test = test["x"].to_numpy(dtype=float)
    y_test = test["y"].to_numpy(dtype=float)

    model = _fit(X_train, y_train)
    test_pred = model.predict(X_test.reshape(-1, 1))
    train_pred = model.predict(X_train.reshape(-1, 1))

    if model_type == "lag":
        previous_all = data["x"].to_numpy(dtype=float)
    else:
        previous_all = pd.Series(data["y"]).shift(1).to_numpy(dtype=float)
    previous_test = previous_all[n_train:]

    valid = ~np.isnan(previous_test)
    prev_v = previous_test[valid]
    y_v = y_test[valid]
    pred_v = test_pred[valid]

    naive_pred = np.where(np.isnan(previous_test), np.nan, previous_test)

    model_metrics = metric_bundle(prev_v, y_v, pred_v, "Linear Regression")
    naive_mask = ~np.isnan(naive_pred)
    naive_metrics = metric_bundle(
        previous_test[naive_mask], y_test[naive_mask], naive_pred[naive_mask], "Naive baseline"
    )
    train_metrics = metric_bundle(
        previous_all[:n_train], y_train, train_pred, "Training fit"
    )

    operational = _fit(data["x"].to_numpy(dtype=float), data["y"].to_numpy(dtype=float))

    dates = split_dates(data, n_train)
    test_rows: list[dict[str, Any]] = []
    for i, (_, row) in enumerate(test.iterrows()):
        prev = float(previous_all[n_train + i]) if not np.isnan(previous_all[n_train + i]) else None
        pred = float(test_pred[i])
        actual = float(row["y"])
        err = actual - pred
        entry = {
            "date": row["date"].strftime("%Y-%m-%d"),
            "x": safe_round(float(row["x"]), 4),
            "actual": safe_round(actual, 4),
            "predicted": safe_round(pred, 4),
            "naive": safe_round(prev, 4) if prev is not None else None,
            "previous": safe_round(prev, 4) if prev is not None else None,
            "error": safe_round(err, 4),
            "abs_error": safe_round(abs(err), 4),
            "pct_error": safe_round(abs(err) / actual * 100, 4) if actual else None,
            "direction_correct": (
                bool(np.sign(actual - prev) == np.sign(pred - prev)) if prev is not None else None
            ),
        }
        test_rows.append(entry)

    scatter_train = downsample(
        [
            {"x": safe_round(float(r.x), 4), "y": safe_round(float(r.y), 4), "date": r.date.strftime("%Y-%m-%d")}
            for r in train.itertuples()
        ],
        max_points=700,
    )
    scatter_test = downsample(
        [
            {"x": safe_round(float(r.x), 4), "y": safe_round(float(r.y), 4), "date": r.date.strftime("%Y-%m-%d")}
            for r in test.itertuples()
        ],
        max_points=500,
    )

    b0 = safe_round(float(model.intercept_), 6)
    b1 = safe_round(float(model.coef_[0]), 6)
    op_b0 = safe_round(float(operational.intercept_), 6)
    op_b1 = safe_round(float(operational.coef_[0]), 6)

    x_min = float(np.nanmin(data["x"].to_numpy(dtype=float)))
    x_max = float(np.nanmax(data["x"].to_numpy(dtype=float)))
    line_points = 40
    xs = np.linspace(x_min, x_max, line_points)
    line = [
        {"x": safe_round(float(xv), 4), "y": safe_round(float(model.coef_[0] * xv + model.intercept_), 4)}
        for xv in xs
    ]

    residuals = [entry["error"] for entry in test_rows if entry["error"] is not None]
    insights = build_model_insights(
        ticker=ticker,
        model_type=model_type,
        intercept=b0,
        slope=b1,
        model_metrics=model_metrics,
        naive_metrics=naive_metrics,
        train_metrics=train_metrics,
        split_ratio=split_ratio,
        n_train=n_train,
        n_test=n - n_train,
        currency_symbol=currency_symbol,
        test_rows=test_rows,
    )

    return {
        "ticker": ticker,
        "model_type": model_type,
        "model_label": MODEL_LABELS[model_type],
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "split_ratio": split_ratio,
        "coefficients": {
            "intercept": b0,
            "slope": b1,
            "equation": _equation(b0, b1),
            "training_r2": safe_round(float(model.score(X_train.reshape(-1, 1), y_train)), 4),
        },
        "operational_coefficients": {
            "intercept": op_b0,
            "slope": op_b1,
            "equation": _equation(op_b0, op_b1),
            "n_observations": int(n),
            "fitted_through": data.loc[n - 1, "date"].strftime("%Y-%m-%d"),
        },
        "sample": {
            "train_size": int(n_train),
            "test_size": int(n - n_train),
            "train_start": dates["train_start"],
            "train_end": dates["train_end"],
            "test_start": dates["test_start"],
            "test_end": dates["test_end"],
            "total_rows": int(n),
        },
        "metrics": {
            "test": model_metrics,
            "naive": naive_metrics,
            "train": train_metrics,
            "improvement": {
                "mae_pct": safe_round(
                    (naive_metrics["mae"] - model_metrics["mae"]) / naive_metrics["mae"] * 100, 2
                )
                if naive_metrics.get("mae")
                else None,
                "rmse_pct": safe_round(
                    (naive_metrics["rmse"] - model_metrics["rmse"]) / naive_metrics["rmse"] * 100, 2
                )
                if naive_metrics.get("rmse")
                else None,
            },
        },
        "series": {
            "test": downsample(test_rows, 1200),
            "residuals": [
                {"date": row["date"], "residual": row["error"]}
                for row in downsample(test_rows, 1200)
                if row["error"] is not None
            ],
        },
        "scatter": {"train": scatter_train, "test": scatter_test, "line": line},
        "residual_stats": residual_summary(residuals),
        "insights": insights,
        "currency_symbol": currency_symbol,
        "feature_label": (
            "Previous trading day's adjusted close"
            if model_type == "lag"
            else "Sequential trading-day index"
        ),
        "target_label": f"Current trading day's {price_label}",
    }


def residual_summary(residuals: list[float]) -> dict[str, Any]:
    if not residuals:
        return {"count": 0}
    arr = np.asarray(residuals, dtype=float)
    return {
        "count": int(len(arr)),
        "mean": safe_round(float(np.mean(arr)), 6),
        "std": safe_round(float(np.std(arr, ddof=1)) if len(arr) > 1 else None, 6),
        "min": safe_round(float(np.min(arr)), 6),
        "max": safe_round(float(np.max(arr)), 6),
        "mean_abs": safe_round(float(np.mean(np.abs(arr))), 6),
        "overpredicted_share": safe_round(float(np.mean(arr < 0) * 100), 2),
        "underpredicted_share": safe_round(float(np.mean(arr > 0) * 100), 2),
    }


def build_model_insights(
    ticker: str,
    model_type: str,
    intercept: float,
    slope: float,
    model_metrics: dict[str, Any],
    naive_metrics: dict[str, Any],
    train_metrics: dict[str, Any],
    split_ratio: float,
    n_train: int,
    n_test: int,
    currency_symbol: str,
    test_rows: list[dict[str, Any]],
) -> list[str]:
    insights: list[str] = []
    mae_v = model_metrics.get("mae")
    rmse_v = model_metrics.get("rmse")
    r2_v = model_metrics.get("r2")
    mape_v = model_metrics.get("mape")
    dir_v = model_metrics.get("directional_accuracy")
    naive_mae = naive_metrics.get("mae")
    train_r2 = train_metrics.get("r2")

    if model_type == "lag":
        insights.append(
            f"Each {currency_symbol}1.00 increase in the previous trading day's adjusted close is associated with a "
            f"{currency_symbol}{slope:+.4f} change in the current day's adjusted close, holding this one-feature model fixed."
        )
    else:
        insights.append(
            f"The trend demonstration assigns each trading day a sequential index. Its fitted slope is "
            f"{slope:+.4f} price units per trading day; it describes a historical trend and is not the next-day forecast model."
        )
    insights.append(
        f"The fitted intercept is {intercept:+.4f}. On its own it represents the prediction when the previous close is zero, "
        "which is not a financially meaningful scenario — read the equation as a whole."
    )
    if r2_v is not None:
        if r2_v >= 0.95:
            strength = "very strong (prices are highly persistent)"
        elif r2_v >= 0.8:
            strength = "moderate"
        elif r2_v >= 0:
            strength = "weak"
        else:
            strength = "worse than simply predicting the test-period average"
        insights.append(
            f"Out-of-sample R² is {r2_v:.4f}: {strength}. It is computed only on the final "
            f"{int(round((1 - split_ratio) * 100))}% of observations, which the model never saw during fitting."
        )
    else:
        insights.append("R² is undefined because the test-period actual prices have no variation.")
    if mae_v is not None:
        insights.append(
            f"Typical test error is {currency_symbol}{mae_v:,.2f} MAE and {currency_symbol}{rmse_v:,.2f} RMSE across {n_test} unseen observations."
        )
    if mape_v is not None:
        insights.append(f"MAPE is {mape_v:.2f}%, i.e. the average absolute miss relative to the actual price.")
    if dir_v is not None:
        if dir_v >= 55:
            tone = "better than a coin flip at calling direction"
        elif dir_v >= 45:
            tone = "close to a coin flip at calling direction"
        else:
            tone = "worse than a coin flip at calling direction"
        insights.append(f"Directional accuracy is {dir_v:.1f}% — {tone}. Magnitude fit and direction fit are different skills.")
    if naive_mae is not None and mae_v is not None:
        delta = naive_mae - mae_v
        pct = (delta / naive_mae * 100) if naive_mae else 0
        if delta > 0:
            insights.append(
                f"The regression beats the naive 'tomorrow equals today' baseline on test MAE by {currency_symbol}{delta:,.2f} "
                f"({pct:.2f}%)."
            )
        elif delta < 0:
            insights.append(
                f"The naive baseline beats the regression on test MAE by {currency_symbol}{abs(delta):,.2f}. "
                "For highly persistent prices this is a common and important benchmark result."
            )
        else:
            insights.append("Regression and the naive baseline have identical test MAE on this sample.")
    if train_r2 is not None and r2_v is not None and train_r2 - r2_v > 0.15:
        insights.append(
            f"Training R² ({train_r2:.4f}) is far above test R² ({r2_v:.4f}); a high in-sample score does not guarantee "
            "out-of-sample forecasting power in a non-stationary market."
        )
    if test_rows:
        errors = [row["abs_error"] for row in test_rows if row["abs_error"] is not None]
        if errors:
            big = max(errors)
            insights.append(
                f"The largest single test error was {currency_symbol}{big:,.2f}; error sizes are not constant, and volatile periods "
                "tend to enlarge them."
            )
    insights.append(
        f"The model was trained on {n_train} chronological observations and evaluated on {n_test}. It uses one input only; "
        "news, earnings, macro shocks, liquidity and sentiment are unmodelled."
    )
    return insights


def walk_forward(df: pd.DataFrame, split_ratio: float = 0.7, model_type: str = "lag") -> dict[str, Any]:
    data = build_supervised(df, model_type)
    n = len(data)
    n_train = chronological_split(n, split_ratio)
    records: list[dict[str, Any]] = []
    y_true: list[float] = []
    y_pred: list[float] = []
    previous: list[float] = []

    x_all = data["x"].to_numpy(dtype=float)
    y_all = data["y"].to_numpy(dtype=float)
    prev_all = x_all if model_type == "lag" else pd.Series(y_all).shift(1).to_numpy(dtype=float)

    for i in range(n_train, n):
        model = _fit(x_all[:i], y_all[:i])
        pred = float(model.predict(np.array([[x_all[i]]]))[0])
        actual = float(y_all[i])
        prev = float(prev_all[i]) if not np.isnan(prev_all[i]) else None
        y_true.append(actual)
        y_pred.append(pred)
        if prev is not None:
            previous.append(prev)
        records.append(
            {
                "date": data.loc[i, "date"].strftime("%Y-%m-%d"),
                "actual": safe_round(actual, 4),
                "predicted": safe_round(pred, 4),
                "previous": safe_round(prev, 4) if prev is not None else None,
                "error": safe_round(actual - pred, 4),
                "abs_error": safe_round(abs(actual - pred), 4),
                "direction_correct": (
                    bool(np.sign(actual - prev) == np.sign(pred - prev)) if prev is not None else None
                ),
            }
        )

    metrics = metric_bundle(previous, y_true, y_pred, "Expanding-window walk-forward")
    return {
        "metrics": metrics,
        "n_predictions": len(records),
        "initial_train_size": n_train,
        "method": "Expanding window: each point is predicted by a model fitted only on earlier observations.",
        "series": downsample(records, 1200),
    }
