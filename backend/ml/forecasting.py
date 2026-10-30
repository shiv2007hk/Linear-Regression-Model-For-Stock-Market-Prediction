from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from ml.evaluation import downsample
from utils import safe_round

CALENDAR_BY_EXCHANGE = {
    "NSI": "NSE",
    "NSE": "NSE",
    "BSE": "BSE",
    "BOM": "BSE",
    "NMS": "NYSE",
    "NGM": "NYSE",
    "NCM": "NYSE",
    "NYQ": "NYSE",
    "ASE": "NYSE",
    "PCX": "NYSE",
    "BTS": "NYSE",
    "LSE": "LSE",
    "TOR": "TSX",
    "JPX": "JPX",
    "HKG": "HKEX",
    "GER": "XETR",
    "PAR": "XPAR",
    "AMS": "XAMS",
    "MIL": "XMIL",
    "ASX": "ASX",
    "SES": "XSES",
}

EXCHANGE_LABEL = {
    "NSI": "National Stock Exchange of India",
    "NSE": "National Stock Exchange of India",
    "BSE": "Bombay Stock Exchange",
    "NMS": "NASDAQ",
    "NYQ": "New York Stock Exchange",
    "LSE": "London Stock Exchange",
    "TOR": "Toronto Stock Exchange",
}


def next_trading_session(exchange_code: str | None, last_date: str) -> dict[str, Any]:
    calendar_name = CALENDAR_BY_EXCHANGE.get((exchange_code or "").upper())
    last = pd.Timestamp(last_date)
    fallback = last + pd.Timedelta(days=1)
    while fallback.weekday() >= 5:
        fallback += pd.Timedelta(days=1)

    if calendar_name:
        try:
            import pandas_market_calendars as mcal

            cal = mcal.get_calendar(calendar_name)
            schedule = cal.schedule(start_date=last + pd.Timedelta(days=1), end_date=last + pd.Timedelta(days=45))
            if not schedule.empty:
                session = schedule.index[0]
                return {
                    "date": session.strftime("%Y-%m-%d"),
                    "verified": True,
                    "calendar": calendar_name,
                    "note": f"Next session from the {calendar_name} exchange calendar. Holiday sessions are excluded; "
                    "unexpected closures are not.",
                }
        except Exception:
            pass
    return {
        "date": fallback.strftime("%Y-%m-%d"),
        "verified": False,
        "calendar": None,
        "note": "Exchange calendar unavailable for this listing. The date is the next weekday and is unverified for holidays.",
    }


def empirical_band(residuals: list[float], predicted: float) -> dict[str, Any]:
    if len(residuals) < 5:
        return {"low": None, "high": None, "label": "Empirical band unavailable (too few test residuals)."}
    arr = np.asarray(residuals, dtype=float)
    std = float(np.std(arr, ddof=1))
    q05, q95 = np.percentile(arr, [5, 95])
    return {
        "low": safe_round(float(predicted + q05), 4),
        "high": safe_round(float(predicted + q95), 4),
        "std": safe_round(std, 4),
        "label": "Empirical 5–95% band from out-of-sample test residuals — not a statistically guaranteed confidence interval.",
    }


def build_forecast(
    df: pd.DataFrame,
    ticker: str,
    meta: dict[str, Any],
    model_result: dict[str, Any],
    horizon: int = 1,
) -> dict[str, Any]:
    horizon = max(1, min(int(horizon), 5))
    operational = model_result["operational_coefficients"]
    intercept = float(operational["intercept"])
    slope = float(operational["slope"])
    last_date = df.index[-1].strftime("%Y-%m-%d")
    last_close = float(df["Close"].iloc[-1])

    residuals = [r["error"] for r in model_result["series"]["test"] if r.get("error") is not None]
    band = empirical_band(residuals, 0.0)

    session = next_trading_session(meta.get("exchange_code"), last_date)
    steps: list[dict[str, Any]] = []
    current_date = last_date
    input_price = last_close
    for step in range(horizon):
        predicted = intercept + slope * input_price
        steps.append(
            {
                "step": step + 1,
                "forecast_date": next_trading_session(meta.get("exchange_code"), current_date)["date"],
                "input_price": safe_round(input_price, 4),
                "predicted_price": safe_round(predicted, 4),
                "change": safe_round(predicted - input_price, 4),
                "change_pct": safe_round((predicted - input_price) / input_price * 100, 4) if input_price else None,
            }
        )
        current_date = steps[-1]["forecast_date"]
        input_price = predicted

    first = steps[0]
    low_band = safe_round(first["predicted_price"] + band["low"], 4) if band.get("low") is not None else None
    high_band = safe_round(first["predicted_price"] + band["high"], 4) if band.get("high") is not None else None

    recent = df.iloc[-90:]
    history = [
        {"date": idx.strftime("%Y-%m-%d"), "close": safe_round(float(row["Close"]), 4)}
        for idx, row in recent.iterrows()
    ]
    history.append({"date": first["forecast_date"], "close": None, "forecast": first["predicted_price"]})

    histogram = []
    if len(residuals) >= 5:
        counts, edges = np.histogram(np.asarray(residuals, dtype=float), bins=20)
        histogram = [
            {
                "center": safe_round(float((edges[i] + edges[i + 1]) / 2), 4),
                "count": int(counts[i]),
                "bin_start": safe_round(float(edges[i]), 4),
                "bin_end": safe_round(float(edges[i + 1]), 4),
            }
            for i in range(len(counts))
        ]

    delta = first["predicted_price"] - last_close
    direction = "above" if delta > 0 else ("below" if delta < 0 else "equal to")
    insights = [
        f"The operational model, refitted on all {operational['n_observations']} usable observations, predicts "
        f"{meta.get('currency_symbol', '$')}{first['predicted_price']:,.2f} for the next session — "
        f"{meta.get('currency_symbol', '$')}{abs(delta):,.2f} ({first['change_pct']:+.2f}%) {direction} the latest close of "
        f"{meta.get('currency_symbol', '$')}{last_close:,.2f}.",
        f"The regression is close to a random walk here: slope {slope:.4f} and intercept {intercept:.4f}. "
        "Small slope deviations from 1 compound into a persistent drift if extrapolated far beyond one step.",
        "The forecast date is "
        + ("verified against the exchange calendar." if session["verified"] else "not verified against an exchange calendar.")
        + f" {session['note']}",
        "The error band reflects how wrong this model was on historical holdout observations; it is not a promise about tomorrow.",
        "No future actual prices are invented. If an actual observation arrives, the journal resolves the prediction against it.",
    ]
    if horizon > 1:
        insights.append(
            f"Recursive {horizon}-step projection: each predicted price becomes the next input. Uncertainty compounds and the "
            "later steps are increasingly unreliable; they are shown as a projection, not a forecast."
        )

    return {
        "ticker": ticker,
        "name": meta.get("name"),
        "currency": meta.get("currency"),
        "currency_symbol": meta.get("currency_symbol", "$"),
        "last_observation": {"date": last_date, "close": safe_round(last_close, 4)},
        "forecast": {
            "date": first["forecast_date"],
            "date_verified": session["verified"],
            "calendar": session["calendar"],
            "calendar_note": session["note"],
            "predicted_price": first["predicted_price"],
            "absolute_change": safe_round(delta, 4),
            "percentage_change": first["change_pct"],
            "direction": "up" if delta > 0 else ("down" if delta < 0 else "flat"),
            "error_band_low": low_band,
            "error_band_high": high_band,
            "band_label": band["label"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "equation": operational["equation"],
        "coefficients": {"intercept": intercept, "slope": slope},
        "horizon": horizon,
        "steps": steps,
        "history": history,
        "error_histogram": histogram,
        "residual_stats": model_result["residual_stats"],
        "insights": insights,
        "model_sample": model_result["sample"],
        "metrics": model_result["metrics"]["test"],
    }
