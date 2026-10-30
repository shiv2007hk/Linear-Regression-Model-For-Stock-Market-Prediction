from __future__ import annotations

import numpy as np
import pytest

from ml.evaluation import (
    directional_accuracy,
    downsample,
    mae,
    mape,
    metric_bundle,
    mse,
    r2,
    rmse,
)


def test_error_metrics_match_hand_computed_values():
    y_true = [10.0, 20.0, 30.0]
    y_pred = [12.0, 18.0, 30.0]

    assert mae(y_true, y_pred) == pytest.approx(4.0 / 3.0)
    assert mse(y_true, y_pred) == pytest.approx(8.0 / 3.0)
    assert rmse(y_true, y_pred) == pytest.approx(np.sqrt(8.0 / 3.0))
    # |2|/10 + |2|/20 + 0 = 0.3 -> 30%
    assert mape(y_true, y_pred) == pytest.approx(100 * (0.2 + 0.1 + 0.0) / 3)


def test_r2_is_one_for_a_perfect_fit_and_none_for_constant_truth():
    y = [1.0, 2.0, 3.0, 4.0]
    assert r2(y, y) == pytest.approx(1.0)
    assert r2([5.0, 5.0, 5.0], [4.0, 5.0, 6.0]) is None


def test_r2_can_be_negative_when_worse_than_the_mean():
    y_true = [1.0, 2.0, 3.0, 4.0]
    y_pred = [4.0, 3.0, 2.0, 1.0]
    assert r2(y_true, y_pred) < 0


def test_mape_ignores_zero_actuals():
    assert mape([0.0, 100.0], [10.0, 90.0]) == pytest.approx(10.0)
    assert mape([0.0, 0.0], [1.0, 2.0]) is None


def test_directional_accuracy_counts_matching_signs():
    previous = [100.0, 100.0, 100.0, 100.0]
    actual = [101.0, 99.0, 103.0, 98.0]
    predicted = [102.0, 98.0, 104.0, 99.0]
    assert directional_accuracy(previous, actual, predicted) == pytest.approx(100.0)

    predicted_wrong = [99.0, 101.0, 99.0, 101.0]
    assert directional_accuracy(previous, actual, predicted_wrong) == pytest.approx(0.0)


def test_directional_accuracy_is_none_for_a_naive_forecast():
    previous = [100.0, 100.0]
    actual = [101.0, 99.0]
    assert directional_accuracy(previous, actual, previous) is None


def test_metric_bundle_contains_every_reported_metric():
    bundle = metric_bundle([9.0, 11.0], [10.0, 12.0], [10.5, 11.5], "Test")

    assert bundle["label"] == "Test"
    assert bundle["n"] == 2
    for key in ("mae", "mse", "rmse", "r2", "mape", "directional_accuracy"):
        assert key in bundle
    assert bundle["mae"] == pytest.approx(0.5)


def test_downsample_keeps_all_rows_below_limit_and_preserves_last():
    rows = [{"i": i} for i in range(50)]
    assert downsample(rows, max_points=100) == rows

    sampled = downsample(rows, max_points=10)
    assert len(sampled) <= 11
    assert sampled[-1] == rows[-1]
