from __future__ import annotations

import pytest

from ml.forecasting import build_forecast, empirical_band, next_trading_session
from ml.regression_model import train_and_evaluate


def _result(frame):
    return train_and_evaluate(frame, "TEST.NS", currency_symbol="₹")


def test_next_trading_session_skips_weekends_even_without_a_calendar():
    session = next_trading_session("UNKNOWN_EXCHANGE", "2026-10-30")  # Friday

    assert session["date"] == "2026-11-02"
    assert session["verified"] is False
    assert session["calendar"] is None


def test_next_trading_session_uses_exchange_calendar_for_nse():
    session = next_trading_session("NSI", "2026-10-29")

    assert session["date"] > "2026-10-29"
    assert session["verified"] is True
    assert session["calendar"] == "NSE"


def test_empirical_band_requires_enough_residuals():
    assert empirical_band([1.0, 2.0], 100.0)["low"] is None
    band = empirical_band([-3.0, -1.0, 0.0, 1.0, 3.0, 0.5], 100.0)
    assert band["low"] < 100.0 < band["high"]
    assert "not a statistically guaranteed" in band["label"]


def test_forecast_uses_operational_coefficients_on_the_latest_close(noisy_frame):
    result = _result(noisy_frame)
    meta = {
        "name": "Test Industries",
        "currency": "INR",
        "currency_symbol": "₹",
        "exchange_code": "NSI",
    }
    forecast = build_forecast(noisy_frame, "TEST.NS", meta, result, horizon=1)

    last_close = float(noisy_frame["Close"].iloc[-1])
    operational = result["operational_coefficients"]
    expected = operational["intercept"] + operational["slope"] * last_close

    assert forecast["last_observation"]["close"] == pytest.approx(last_close, abs=1e-4)
    assert forecast["forecast"]["predicted_price"] == pytest.approx(expected, abs=1e-3)
    assert forecast["forecast"]["direction"] in {"up", "down", "flat"}
    assert forecast["forecast"]["error_band_low"] <= forecast["forecast"]["error_band_high"]
    assert forecast["horizon"] == 1
    assert len(forecast["steps"]) == 1
    assert forecast["steps"][0]["step"] == 1
    assert forecast["history"][-1]["forecast"] == forecast["steps"][0]["predicted_price"]
    assert forecast["history"][-1]["close"] is None


def test_multi_step_forecast_feeds_predictions_back_in(noisy_frame):
    result = _result(noisy_frame)
    meta = {"currency_symbol": "₹", "currency": "INR", "exchange_code": "NSI"}
    forecast = build_forecast(noisy_frame, "TEST.NS", meta, result, horizon=3)

    steps = forecast["steps"]
    assert len(steps) == 3
    for previous, following in zip(steps, steps[1:]):
        assert following["forecast_date"] > previous["forecast_date"]
        assert following["input_price"] == pytest.approx(previous["predicted_price"], abs=1e-6)
    assert any("projection" in line.lower() for line in forecast["insights"])


def test_horizon_is_clamped_between_one_and_five(noisy_frame):
    result = _result(noisy_frame)
    meta = {"currency_symbol": "₹", "exchange_code": "NSI"}

    assert build_forecast(noisy_frame, "TEST.NS", meta, result, horizon=0)["horizon"] == 1
    assert build_forecast(noisy_frame, "TEST.NS", meta, result, horizon=99)["horizon"] == 5


def test_forecast_never_fabricates_actual_prices(noisy_frame):
    result = _result(noisy_frame)
    forecast = build_forecast(noisy_frame, "TEST.NS", {"currency_symbol": "₹"}, result)

    actual_history = [point for point in forecast["history"] if point.get("close") is not None]
    assert actual_history, "history should include observed closes"
    assert all(point["date"] <= forecast["last_observation"]["date"] for point in actual_history)
