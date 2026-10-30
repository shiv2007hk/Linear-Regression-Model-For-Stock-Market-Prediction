from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from utils import safe_round

PRICE_COLS = ["Open", "High", "Low", "Close", "Volume"]


def clean_prices(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Return a chronologically sorted, de-duplicated, positive-price dataframe plus a report."""
    if df is None or df.empty:
        return pd.DataFrame(columns=PRICE_COLS), {
            "raw_records": 0,
            "cleaned_records": 0,
            "missing_values": 0,
            "duplicate_dates": 0,
            "invalid_prices": 0,
            "rows_removed": 0,
        }

    raw_records = int(len(df))
    missing = int(df[["Open", "High", "Low", "Close"]].isna().sum().sum())
    duplicate_dates = int(df.index.duplicated(keep="last").sum())

    work = df.copy()
    work = work[~work.index.duplicated(keep="last")]
    work = work.sort_index()

    close = pd.to_numeric(work["Close"], errors="coerce")
    invalid = int(((close.isna()) | (close <= 0)).sum())
    work = work[(close.notna()) & (close > 0)]

    for col in ("Open", "High", "Low"):
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(work["Close"])
    work["Close"] = pd.to_numeric(work["Close"], errors="coerce")
    work["Volume"] = pd.to_numeric(work.get("Volume", 0), errors="coerce").fillna(0).clip(lower=0)

    cleaned_records = int(len(work))
    report = {
        "raw_records": raw_records,
        "cleaned_records": cleaned_records,
        "missing_values": missing,
        "duplicate_dates": duplicate_dates,
        "invalid_prices": invalid,
        "rows_removed": raw_records - cleaned_records,
        "usable_pct": safe_round(cleaned_records / raw_records * 100, 2) if raw_records else None,
    }
    return work, report


def build_supervised(df: pd.DataFrame, model_type: str = "lag") -> pd.DataFrame:
    """Build the one-feature supervised dataset.

    lag  : X = previous adjusted close, Y = current adjusted close (primary model).
    trend: X = sequential trading-day index, Y = adjusted close (educational demo only).
    """
    clean, _ = clean_prices(df)
    if model_type not in {"lag", "trend"}:
        raise ValueError("model_type must be 'lag' or 'trend'")

    if model_type == "lag":
        data = pd.DataFrame(
            {
                "date": clean.index,
                "x": clean["Close"].shift(1).to_numpy(),
                "y": clean["Close"].to_numpy(),
            }
        )
        data = data.dropna(subset=["x", "y"])
        data = data[(data["x"] > 0) & (data["y"] > 0)]
    else:
        data = pd.DataFrame(
            {
                "date": clean.index,
                "x": np.arange(len(clean), dtype=float),
                "y": clean["Close"].to_numpy(),
            }
        )
    data = data.reset_index(drop=True)
    if len(data) < 12:
        raise ValueError(
            f"Not enough usable observations ({len(data)}) to train the model. Select a longer date range."
        )
    return data


def chronological_split(n: int, split_ratio: float = 0.7) -> int:
    if not 0.5 <= split_ratio <= 0.9:
        raise ValueError("Train/test split must be between 50% and 90% of the chronological data.")
    n_train = int(round(n * split_ratio))
    n_train = max(6, min(n_train, n - 3))
    if n_train >= n:
        raise ValueError("Dataset is too small for the requested split.")
    return n_train


def split_dates(data: pd.DataFrame, n_train: int) -> dict[str, str]:
    return {
        "train_start": data.loc[0, "date"].strftime("%Y-%m-%d"),
        "train_end": data.loc[n_train - 1, "date"].strftime("%Y-%m-%d"),
        "test_start": data.loc[n_train, "date"].strftime("%Y-%m-%d"),
        "test_end": data.loc[len(data) - 1, "date"].strftime("%Y-%m-%d"),
    }
