from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ml.data_loader import MarketData, load_market_data
from ml.evaluation import downsample
from ml.forecasting import build_forecast
from ml.regression_model import train_and_evaluate
from services.analytics import _series
from utils import safe_round


def basic_summary(data: MarketData) -> dict[str, Any]:
    df = data.df
    close = df["Close"].astype(float)
    latest = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) > 1 else latest
    change = latest - prev
    change_pct = change / prev * 100 if prev else 0.0

    year = df[df.index >= df.index.max() - pd.Timedelta(days=365)]
    high_52 = float(year["Close"].max())
    low_52 = float(year["Close"].min())
    high_52_date = year["Close"].idxmax().strftime("%Y-%m-%d")
    low_52_date = year["Close"].idxmin().strftime("%Y-%m-%d")
    rets = close.pct_change().dropna()
    ann_vol = float(rets.std(ddof=1) * np.sqrt(252) * 100) if len(rets) > 2 else None

    return {
        "ticker": data.ticker,
        "name": data.meta.get("name"),
        "currency": data.meta.get("currency"),
        "currency_symbol": data.meta.get("currency_symbol", "$"),
        "exchange": data.meta.get("exchange"),
        "sector": data.meta.get("sector"),
        "latest_price": safe_round(latest, 4),
        "previous_close": safe_round(prev, 4),
        "change": safe_round(change, 4),
        "change_pct": safe_round(change_pct, 4),
        "high_52w": safe_round(high_52, 4),
        "low_52w": safe_round(low_52, 4),
        "high_52w_date": high_52_date,
        "low_52w_date": low_52_date,
        "total_records": int(len(df)),
        "annualized_volatility_pct": safe_round(ann_vol, 2),
        "average_volume": safe_round(float(df["Volume"].mean()), 0),
        "latest_volume": safe_round(float(df["Volume"].iloc[-1]), 0),
        "period_start": df.index[0].strftime("%Y-%m-%d"),
        "period_end": df.index[-1].strftime("%Y-%m-%d"),
    }


def dashboard_payload(
    data: MarketData,
    split_ratio: float = 0.7,
    watchlist: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    summary = basic_summary(data)
    symbol = summary["currency_symbol"]
    df = data.df

    model = train_and_evaluate(
        df,
        data.ticker,
        split_ratio=split_ratio,
        model_type="lag",
        currency_symbol=symbol,
        price_label=data.meta.get("price_label", "adjusted close"),
    )
    forecast = build_forecast(df, data.ticker, data.meta, model)

    dfc = df.copy()
    close = dfc["Close"].astype(float)
    dfc["sma20"] = close.rolling(20).mean()
    dfc["sma50"] = close.rolling(50).mean()
    dfc["return_pct"] = close.pct_change() * 100

    perf = model["metrics"]
    model_mae = perf["test"]["mae"]
    model_r2 = perf["test"]["r2"]
    naive_mae = perf["naive"]["mae"]
    beats_naive = model_mae is not None and naive_mae is not None and model_mae < naive_mae

    price_insights = [
        f"{data.ticker} closed at {symbol}{summary['latest_price']:,.2f} on {summary['period_end']}, "
        f"{'+' if summary['change'] >= 0 else ''}{summary['change']:,.2f} ({summary['change_pct']:+.2f}%) versus the previous session.",
        f"The 52-week range is {symbol}{summary['low_52w']:,.2f} to {symbol}{summary['high_52w']:,.2f}; "
        f"the latest close is {abs((summary['latest_price'] - summary['high_52w']) / summary['high_52w'] * 100):.2f}% below the 52-week high.",
        f"Annualised historical volatility across the selected window is {summary['annualized_volatility_pct']}% with "
        f"{summary['total_records']} trading observations.",
    ]

    model_insight = (
        f"The one-feature regression shows test MAE {symbol}{model_mae:,.2f} and out-of-sample R² {model_r2:.4f}. "
        f"It {'beats' if beats_naive else 'does not beat'} the naive baseline (MAE {symbol}{naive_mae:,.2f})."
        if model_mae is not None and naive_mae is not None and model_r2 is not None
        else "The model could not be evaluated on this sample; try a longer history."
    )

    fc = forecast["forecast"]
    forecast_insight = (
        f"Latest operational forecast: {symbol}{fc['predicted_price']:,.2f} for {fc['date']} "
        f"({fc['percentage_change']:+.2f}%), {fc['date_verified'] and 'verified against the exchange calendar' or 'unverified calendar date'}. "
        "This is an educational estimate, not investment advice."
    )

    watchlist_overview = build_watchlist_overview(watchlist or [])

    return {
        "meta": data.payload_meta(),
        "summary": summary,
        "series": {
            "price": _series(dfc, ["Close", "sma20", "sma50"]),
            "volume": downsample(
                [
                    {"date": idx.strftime("%Y-%m-%d"), "volume": safe_round(float(row["Volume"]), 0)}
                    for idx, row in dfc.iterrows()
                ],
                1200,
            ),
            "returns": downsample(
                [
                    {"date": idx.strftime("%Y-%m-%d"), "return_pct": safe_round(float(row["return_pct"]), 4)}
                    for idx, row in dfc.iterrows()
                    if pd.notna(row["return_pct"])
                ],
                1200,
            ),
            "actual_vs_predicted": model["series"]["test"],
            "model_performance": [
                {"metric": "MAE", "model": model_mae, "naive": naive_mae},
                {"metric": "RMSE", "model": perf["test"]["rmse"], "naive": perf["naive"]["rmse"]},
                {"metric": "MAPE (%)", "model": perf["test"]["mape"], "naive": perf["naive"]["mape"]},
            ],
            "r2_comparison": {
                "model_r2": model_r2,
                "train_r2": perf["train"]["r2"],
                "test_label": f"Out-of-sample ({model['sample']['test_size']} obs)",
            },
        },
        "model": {
            "equation": model["coefficients"]["equation"],
            "intercept": model["coefficients"]["intercept"],
            "slope": model["coefficients"]["slope"],
            "mae": model_mae,
            "rmse": perf["test"]["rmse"],
            "r2": model_r2,
            "mape": perf["test"]["mape"],
            "directional_accuracy": perf["test"]["directional_accuracy"],
            "naive_mae": naive_mae,
            "beats_naive": beats_naive,
            "sample": model["sample"],
            "trained_at": model["trained_at"],
            "model_label": model["model_label"],
        },
        "forecast": {
            "date": fc["date"],
            "date_verified": fc["date_verified"],
            "predicted_price": fc["predicted_price"],
            "percentage_change": fc["percentage_change"],
            "direction": fc["direction"],
            "error_band_low": fc["error_band_low"],
            "error_band_high": fc["error_band_high"],
            "band_label": fc["band_label"],
        },
        "watchlist_overview": watchlist_overview,
        "insights": [*price_insights, model_insight, forecast_insight],
        "disclaimer": "Educational analytics only. Yahoo Finance data may be delayed or incomplete. Not investment advice.",
    }


def build_watchlist_overview(watchlist: list[dict[str, Any]]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    normalized_rows: dict[str, dict[str, Any]] = {}
    for item in watchlist[:6]:
        ticker = item["ticker"]
        try:
            data = load_market_data(ticker, period="6mo")
        except Exception:
            continue
        close = data.df["Close"].astype(float)
        if len(close) < 2:
            continue
        change_pct = (close.iloc[-1] / close.iloc[-2] - 1) * 100
        total_return = (close.iloc[-1] / close.iloc[0] - 1) * 100
        spark = close.iloc[-40:]
        rows.append(
            {
                "ticker": ticker,
                "name": data.meta.get("name"),
                "currency_symbol": data.meta.get("currency_symbol", "$"),
                "latest_price": safe_round(float(close.iloc[-1]), 4),
                "change_pct": safe_round(float(change_pct), 2),
                "total_return_pct": safe_round(float(total_return), 2),
                "sparkline": [safe_round(float(v), 3) for v in spark.to_numpy()],
                "sparkline_dates": [d.strftime("%Y-%m-%d") for d in spark.index],
            }
        )
        norm = close.iloc[-60:] / close.iloc[-60] * 100
        for idx, val in norm.items():
            normalized_rows.setdefault(idx.strftime("%Y-%m-%d"), {})[ticker] = safe_round(float(val), 3)

    normalized = [
        {"date": date, **{k: v for k, v in values.items()}}
        for date, values in sorted(normalized_rows.items())
    ]
    return {"rows": rows, "normalized": normalized}
