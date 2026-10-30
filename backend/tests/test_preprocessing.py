from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.preprocessing import build_supervised, chronological_split, clean_prices, split_dates


def test_clean_prices_sorts_dedupes_and_drops_invalid_rows():
    index = pd.to_datetime(["2024-01-03", "2024-01-02", "2024-01-02", "2024-01-04", "2024-01-05"])
    frame = pd.DataFrame(
        {
            "Open": [10.0, 9.0, np.nan, 11.0, 12.0],
            "High": [11.0, 10.0, 10.0, 12.0, 13.0],
            "Low": [9.0, 8.0, 8.0, 10.0, 11.0],
            "Close": [10.0, 9.5, 9.8, 0.0, 12.5],
            "Volume": [100, 200, 300, 400, np.nan],
        },
        index=index,
    )

    cleaned, report = clean_prices(frame)

    assert list(cleaned.index) == sorted(cleaned.index), "rows must be chronological"
    assert cleaned.index.is_unique
    assert (cleaned["Close"] > 0).all(), "non-positive closes must be dropped"
    assert len(cleaned) == 3
    assert report["raw_records"] == 5
    assert report["cleaned_records"] == 3
    assert report["duplicate_dates"] == 1
    assert report["invalid_prices"] == 1
    assert report["rows_removed"] == 2
    assert cleaned["Open"].isna().sum() == 0
    assert cleaned["Volume"].isna().sum() == 0


def test_clean_prices_handles_empty_frame():
    cleaned, report = clean_prices(pd.DataFrame())
    assert cleaned.empty
    assert report["raw_records"] == 0


def test_build_supervised_lag_uses_previous_close_as_feature(exact_frame):
    data = build_supervised(exact_frame, "lag")

    assert len(data) == len(exact_frame) - 1
    assert list(data.columns) == ["date", "x", "y"]
    expected_x = exact_frame["Close"].to_numpy()[:-1]
    expected_y = exact_frame["Close"].to_numpy()[1:]
    np.testing.assert_allclose(data["x"].to_numpy(), expected_x)
    np.testing.assert_allclose(data["y"].to_numpy(), expected_y)
    assert data["date"].is_monotonic_increasing


def test_build_supervised_trend_uses_sequential_index(exact_frame):
    data = build_supervised(exact_frame, "trend")

    assert len(data) == len(exact_frame)
    np.testing.assert_allclose(data["x"].to_numpy(), np.arange(len(exact_frame), dtype=float))
    np.testing.assert_allclose(data["y"].to_numpy(), exact_frame["Close"].to_numpy())


def test_build_supervised_rejects_unknown_model_type(exact_frame):
    with pytest.raises(ValueError, match="model_type"):
        build_supervised(exact_frame, "arima")


def test_build_supervised_rejects_short_history(exact_frame):
    with pytest.raises(ValueError, match="Not enough usable observations"):
        build_supervised(exact_frame.iloc[:10], "lag")


@pytest.mark.parametrize(
    ("n", "ratio", "expected"),
    [(100, 0.7, 70), (100, 0.5, 50), (100, 0.9, 90), (149, 0.7, 104)],
)
def test_chronological_split_rounding(n, ratio, expected):
    assert chronological_split(n, ratio) == expected


def test_chronological_split_respects_minimums():
    assert chronological_split(8, 0.7) == 6
    assert chronological_split(8, 0.9) == 6


def test_chronological_split_rejects_out_of_range_ratio():
    with pytest.raises(ValueError, match="between 50% and 90%"):
        chronological_split(100, 0.49)
    with pytest.raises(ValueError, match="between 50% and 90%"):
        chronological_split(100, 0.91)


def test_split_dates_uses_chronological_boundaries(exact_frame):
    data = build_supervised(exact_frame, "lag")
    n_train = chronological_split(len(data), 0.7)
    dates = split_dates(data, n_train)

    assert dates["train_start"] == data.loc[0, "date"].strftime("%Y-%m-%d")
    assert dates["train_end"] == data.loc[n_train - 1, "date"].strftime("%Y-%m-%d")
    assert dates["test_start"] == data.loc[n_train, "date"].strftime("%Y-%m-%d")
    assert dates["test_end"] == data.loc[len(data) - 1, "date"].strftime("%Y-%m-%d")
    assert dates["train_end"] < dates["test_start"], "the split must never overlap or shuffle"
