from __future__ import annotations

import math
import re
from datetime import date, datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

_TICKER_RE = re.compile(r"^[A-Za-z0-9.^=_-]{1,24}$")


def normalize_ticker(raw: str) -> str:
    ticker = (raw or "").strip().upper()
    if not ticker:
        raise ValueError("Ticker symbol is required.")
    if not _TICKER_RE.match(ticker):
        raise ValueError(
            "Invalid ticker symbol. Use letters, numbers and characters such as . ^ - = (e.g. RELIANCE.NS, ^NSEI, BRK-B)."
        )
    return ticker


def scalar(value: Any) -> Any:
    """Convert numpy/pandas scalars into JSON-safe Python primitives."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, 6)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.isoformat()
    return value


def jsonable(obj: Any) -> Any:
    """Recursively sanitise payloads so FastAPI never emits invalid JSON (NaN/Inf)."""
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, pd.DataFrame):
        return jsonable(obj.to_dict(orient="records"))
    if isinstance(obj, pd.Series):
        return jsonable(obj.tolist())
    return scalar(obj)


def frame_records(df: pd.DataFrame, date_col: str = "date") -> list[dict[str, Any]]:
    out = df.copy()
    if isinstance(out.index, pd.DatetimeIndex):
        out = out.reset_index()
        first = out.columns[0]
        if first != date_col:
            out = out.rename(columns={first: date_col})
    if date_col in out.columns:
        out[date_col] = pd.to_datetime(out[date_col]).dt.strftime("%Y-%m-%d")
    return jsonable(out.to_dict(orient="records"))


def safe_round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)


def iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()
