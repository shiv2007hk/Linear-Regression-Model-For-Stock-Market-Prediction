from __future__ import annotations

import numpy as np
import pytest

from ml.diagnostics import residual_diagnostics
from ml.regression_model import train_and_evaluate


def test_diagnostics_requires_at_least_eight_residuals():
    payload = {"series": {"test": [{"error": 1.0, "predicted": 10.0, "date": "2024-01-01"}] * 3}}

    result = residual_diagnostics(payload)

    assert result["available"] is False
    assert "8" in result["message"]
    assert result["insights"] == []


def test_diagnostics_reports_statistics_and_chart_series(noisy_frame):
    model = train_and_evaluate(noisy_frame, "TEST.NS", split_ratio=0.7)
    diagnostics = residual_diagnostics(model)

    assert diagnostics["available"] is True
    stats = diagnostics["stats"]
    n_test = model["sample"]["test_size"]

    assert stats["n"] == n_test
    assert stats["std"] > 0
    assert stats["jarque_bera_p"] is not None
    assert 0.0 <= stats["jarque_bera_p"] <= 1.0
    assert stats["acf_band"] == pytest.approx(1.96 / np.sqrt(n_test), abs=1e-3)
    assert isinstance(stats["significant_acf_lags"], list)

    series = diagnostics["series"]
    assert len(series["vs_fitted"]) == n_test
    assert len(series["over_time"]) == n_test
    assert len(series["qq"]["points"]) == n_test
    assert sum(bin_["count"] for bin_ in series["histogram"]) == n_test
    assert len(series["acf"]) >= 5

    assert len(diagnostics["outliers"]) <= 10
    for row in diagnostics["outliers"]:
        assert abs(row["residual"]) > stats["outlier_threshold"]
    assert len(diagnostics["insights"]) >= 4


def test_breusch_pagan_is_reported_when_statsmodels_is_available(noisy_frame):
    model = train_and_evaluate(noisy_frame, "TEST.NS")
    stats = residual_diagnostics(model)["stats"]

    assert stats["breusch_pagan_stat"] is not None
    assert 0.0 <= stats["breusch_pagan_p"] <= 1.0
