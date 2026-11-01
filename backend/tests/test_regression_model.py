from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.preprocessing import build_supervised, chronological_split
from ml.regression_model import _equation, residual_summary, train_and_evaluate, walk_forward


@pytest.fixture(scope="session")
def declining_frame() -> pd.DataFrame:
    """A steadily falling series, so the trend fit has a negative slope."""
    closes = np.linspace(500.0, 260.0, 200)
    index = pd.bdate_range(start="2023-01-02", periods=len(closes))
    index.name = "Date"
    return pd.DataFrame(
        {
            "Open": closes,
            "High": closes * 1.01,
            "Low": closes * 0.99,
            "Close": closes,
            "Volume": np.full(len(closes), 1_000_000.0),
        },
        index=index,
    )


def test_equation_keeps_the_sign_of_each_coefficient():
    assert _equation(18.3915, 0.9867) == "Y = 18.3915 + 0.9867 · X"
    assert _equation(-5.0, 0.95) == "Y = −5.0000 + 0.9500 · X"
    assert _equation(12.0, -0.45) == "Y = 12.0000 − 0.4500 · X"
    assert _equation(-3.0, -0.8) == "Y = −3.0000 − 0.8000 · X"


def test_declining_trend_fit_is_not_rendered_as_rising(declining_frame):
    result = train_and_evaluate(declining_frame, "TEST.NS", model_type="trend")
    coefficients = result["coefficients"]

    assert coefficients["slope"] < 0
    assert f"− {abs(coefficients['slope']):.4f} · X" in coefficients["equation"]


def test_equation_agrees_with_the_reported_coefficients(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS")
    for block in (result["coefficients"], result["operational_coefficients"]):
        assert f"{block['intercept']:.4f}" in block["equation"]
        assert f"{abs(block['slope']):.4f}" in block["equation"]


def test_lag_model_recovers_known_coefficients(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS", split_ratio=0.7, currency_symbol="₹")

    assert result["coefficients"]["slope"] == pytest.approx(1.0005, abs=1e-6)
    assert result["coefficients"]["intercept"] == pytest.approx(2.0, abs=1e-6)
    assert result["coefficients"]["training_r2"] == pytest.approx(1.0, abs=1e-9)
    # A perfect linear relationship must generalise: zero holdout error.
    assert result["metrics"]["test"]["mae"] == pytest.approx(0.0, abs=1e-4)
    assert result["metrics"]["test"]["r2"] == pytest.approx(1.0, abs=1e-4)
    assert result["metrics"]["test"]["directional_accuracy"] == pytest.approx(100.0)


def test_split_is_chronological_without_overlap(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS", split_ratio=0.7)
    sample = result["sample"]

    assert sample["train_size"] + sample["test_size"] == sample["total_rows"]
    assert sample["train_start"] < sample["train_end"] < sample["test_start"] <= sample["test_end"]
    n_expected = chronological_split(sample["total_rows"], 0.7)
    assert sample["train_size"] == n_expected

    test_dates = [row["date"] for row in result["series"]["test"]]
    assert test_dates == sorted(test_dates)


def test_naive_baseline_is_previous_close(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS")

    for row in result["series"]["test"]:
        assert row["naive"] == row["x"]
        assert row["previous"] == row["x"]


def test_operational_refit_uses_all_observations_and_last_date(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS")
    data = build_supervised(exact_frame, "lag")

    operational = result["operational_coefficients"]
    assert operational["n_observations"] == len(data)
    assert operational["fitted_through"] == data.loc[len(data) - 1, "date"].strftime("%Y-%m-%d")
    assert operational["slope"] == pytest.approx(1.0005, abs=1e-6)
    assert operational["intercept"] == pytest.approx(2.0, abs=1e-6)
    assert "X" in operational["equation"]


def test_forecast_helpers_and_residual_summary(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS")

    summary = residual_summary([1.0, -1.0, 2.0, -2.0])
    assert summary["count"] == 4
    assert summary["mean"] == pytest.approx(0.0)
    assert summary["mean_abs"] == pytest.approx(1.5)
    assert summary["overpredicted_share"] == pytest.approx(50.0)

    empty = residual_summary([])
    assert empty == {"count": 0}


def test_walk_forward_predicts_each_holdout_point_with_prior_data(exact_frame):
    result = walk_forward(exact_frame, split_ratio=0.7)
    n = len(build_supervised(exact_frame, "lag"))
    n_train = chronological_split(n, 0.7)

    assert result["n_predictions"] == n - n_train
    assert result["initial_train_size"] == n_train
    assert result["metrics"]["mae"] == pytest.approx(0.0, abs=1e-4)
    assert result["metrics"]["n"] == n - n_train
    assert result["series"][0]["date"] < result["series"][-1]["date"]


def test_trend_mode_is_flagged_as_educational(exact_frame):
    result = train_and_evaluate(exact_frame, "TEST.NS", model_type="trend")

    assert result["model_type"] == "trend"
    assert "educational" in result["model_label"].lower()
    assert result["feature_label"] == "Sequential trading-day index"
    assert result["sample"]["total_rows"] == len(exact_frame)
    assert result["metrics"]["train"]["r2"] is not None


def test_noisy_data_reports_an_honest_benchmark(noisy_frame):
    result = train_and_evaluate(noisy_frame, "TEST.NS")
    test_metrics = result["metrics"]["test"]
    naive = result["metrics"]["naive"]

    assert 0.5 < result["coefficients"]["slope"] < 1.0
    assert test_metrics["mae"] > 0
    assert test_metrics["n"] == result["sample"]["test_size"]
    assert naive["n"] == result["sample"]["test_size"]
    assert isinstance(result["insights"], list) and len(result["insights"]) >= 5
    assert any("naive" in line.lower() for line in result["insights"])
