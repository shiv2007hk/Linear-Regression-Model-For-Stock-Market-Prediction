from __future__ import annotations

import numpy as np
import pytest

from services.analytics import data_quality, returns_analysis, trend_analysis


def test_trend_analysis_matches_hand_computed_extremes(exact_market_data):
    frame = exact_market_data.df
    payload = trend_analysis(exact_market_data)

    metrics = payload["metrics"]
    assert metrics["latest"] == pytest.approx(float(frame["Close"].iloc[-1]), abs=1e-4)
    assert metrics["highest"] == pytest.approx(float(frame["Close"].max()), abs=1e-4)
    assert metrics["lowest"] == pytest.approx(float(frame["Close"].min()), abs=1e-4)
    assert metrics["observations"] == len(frame)
    assert metrics["distance_from_high_pct"] <= 0
    assert metrics["distance_from_low_pct"] >= 0
    assert len(payload["series"]) == len(frame)
    assert payload["series"][0]["sma200"] is None, "warm-up windows must not be fabricated"
    assert payload["insights"]


def test_returns_analysis_matches_arithmetic_and_handles_monotonic_windows(exact_market_data):
    frame = exact_market_data.df
    close = frame["Close"].astype(float)
    payload = returns_analysis(exact_market_data)

    metrics = payload["metrics"]
    expected_total = (close.iloc[-1] / close.iloc[0] - 1) * 100
    expected_daily_std = close.pct_change().dropna().std(ddof=1) * 100

    assert payload["available"] is True
    assert metrics["cumulative_return_pct"] == pytest.approx(expected_total, abs=1e-2)
    assert metrics["daily_std_pct"] == pytest.approx(expected_daily_std, abs=1e-3)
    assert metrics["annualized_volatility_pct"] == pytest.approx(expected_daily_std * np.sqrt(252), abs=1e-2)
    assert metrics["max_drawdown_pct"] <= 0
    assert metrics["observations"] == len(close) - 1

    # The synthetic series rises every day, so there are no losses to average.
    assert metrics["average_loss_pct"] is None
    assert metrics["average_gain_pct"] is not None
    assert any("no losing days" in line for line in payload["insights"])
    assert sum(bin_["count"] for bin_ in payload["series"]["histogram"]) == metrics["observations"]


def test_data_quality_reports_cleaned_dataset(exact_market_data):
    payload = data_quality(exact_market_data)
    metrics = payload["metrics"]

    assert metrics["cleaned_records"] == len(exact_market_data.df)
    assert metrics["unique_dates"] == len(exact_market_data.df)
    assert metrics["missing_total"] == 0
    assert metrics["first_date"] < metrics["last_date"]
    assert metrics["price_min"] <= metrics["price_mean"] <= metrics["price_max"]
    assert payload["series"]["monthly_counts"]
    assert len(payload["insights"]) >= 4


def test_returns_analysis_requires_enough_observations(exact_market_data):
    from dataclasses import replace

    short_data = replace(exact_market_data, df=exact_market_data.df.iloc[:4].copy())

    payload = returns_analysis(short_data)

    assert payload["available"] is False
    assert "6 price observations" in payload["message"]
