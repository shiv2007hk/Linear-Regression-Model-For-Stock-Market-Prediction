from __future__ import annotations

from typing import Any, Sequence

import numpy as np

from utils import safe_round


def _arr(values: Sequence[float]) -> np.ndarray:
    return np.asarray(values, dtype=float)


def mae(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    a, p = _arr(y_true), _arr(y_pred)
    return float(np.mean(np.abs(a - p)))


def mse(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    a, p = _arr(y_true), _arr(y_pred)
    return float(np.mean((a - p) ** 2))


def rmse(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    return float(np.sqrt(mse(y_true, y_pred)))


def r2(y_true: Sequence[float], y_pred: Sequence[float]) -> float | None:
    a, p = _arr(y_true), _arr(y_pred)
    ss_res = float(np.sum((a - p) ** 2))
    ss_tot = float(np.sum((a - np.mean(a)) ** 2))
    if ss_tot == 0:
        return None
    return float(1 - ss_res / ss_tot)


def mape(y_true: Sequence[float], y_pred: Sequence[float]) -> float | None:
    a, p = _arr(y_true), _arr(y_pred)
    mask = a != 0
    if not np.any(mask):
        return None
    return float(np.mean(np.abs((a[mask] - p[mask]) / a[mask])) * 100)


def directional_accuracy(
    previous: Sequence[float], y_true: Sequence[float], y_pred: Sequence[float]
) -> float | None:
    prev, a, p = _arr(previous), _arr(y_true), _arr(y_pred)
    if len(prev) == 0:
        return None
    if np.allclose(p, prev):
        return None  # a naive "tomorrow equals today" forecast makes no directional call
    actual_dir = np.sign(a - prev)
    predicted_dir = np.sign(p - prev)
    return float(np.mean(actual_dir == predicted_dir) * 100)


def metric_bundle(
    previous: Sequence[float],
    y_true: Sequence[float],
    y_pred: Sequence[float],
    label: str,
) -> dict[str, Any]:
    return {
        "label": label,
        "mae": safe_round(mae(y_true, y_pred), 4),
        "mse": safe_round(mse(y_true, y_pred), 4),
        "rmse": safe_round(rmse(y_true, y_pred), 4),
        "r2": safe_round(r2(y_true, y_pred), 4),
        "mape": safe_round(mape(y_true, y_pred), 4),
        "directional_accuracy": safe_round(directional_accuracy(previous, y_true, y_pred), 2),
        "n": len(list(y_true)),
    }


def downsample(rows: list[dict[str, Any]], max_points: int = 1200) -> list[dict[str, Any]]:
    n = len(rows)
    if n <= max_points:
        return rows
    step = int(np.ceil(n / max_points))
    sampled = rows[::step]
    if rows and sampled[-1] is not rows[-1]:
        sampled.append(rows[-1])
    return sampled
