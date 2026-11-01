"""Read-only tools the AI Copilot may call, all of them thin wrappers over existing services.

This module is the whole blast radius of the assistant:

* Dispatch is a strict allowlist. Only the eight tools in ``TOOL_REGISTRY`` can run, each
  mapped to a plain Python function that is already importable by the rest of the app.
  There is no ``eval``, no dynamic import, no attribute lookup from model-supplied text and
  no way to reach the database layer, the filesystem or the environment from here.
* Every argument set is validated by a Pydantic model with ``extra="forbid"`` before a
  handler runs. Ticker symbols go through the same ``normalize_ticker`` used by the HTTP
  layer, and period / split-ratio / horizon bounds match ``schemas.requests``.
* Handlers only read. Nothing here calls ``persist_run``, ``create_prediction``,
  ``add_watchlist`` or any other write path, and the results are summarised and size-bounded
  before they can be shown to the model or the browser.
* Failures come back as structured ``ok: false`` results so the assistant can tell the user
  the truth instead of inventing a number.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ml.data_loader import PERIODS, MarketDataError, load_market_data
from ml.evaluation import downsample
from ml.forecasting import build_forecast
from services.analytics import comparison_analysis, returns_analysis, trend_analysis
from services.dashboard import basic_summary
from services.model_service import insights_payload, run_training
from utils import jsonable, normalize_ticker, safe_round

logger = logging.getLogger(__name__)

MAX_TOOL_CHARACTERS = 6000
MAX_ARGUMENT_CHARACTERS = 2000
MAX_LIST_ITEMS = 40
MAX_INSIGHT_LINES = 6
MAX_CATALOG_DESCRIPTION_CHARACTERS = 200

AGGREGATIONS = ("auto", "raw", "weekly", "monthly")
CONTEXT_PERIODS = ("5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max")

MODEL_FACT_SHEET: dict[str, Any] = {
    "model_name": "Previous-close Simple Linear Regression",
    "equation_form": "Y = b0 + b1 * X",
    "feature_x": "Adjusted closing price of the previous trading day (one single feature).",
    "target_y": "Adjusted closing price of the current trading day.",
    "algorithm": "scikit-learn LinearRegression, least squares, one independent variable.",
    "training": (
        "Chronological (time-ordered) split, default 70% train / 30% test. Forecasting uses "
        "operational coefficients refitted on the whole usable sample."
    ),
    "evaluation_metrics": [
        "MAE",
        "MSE",
        "RMSE",
        "R-squared",
        "MAPE",
        "Directional accuracy",
        "Naive previous-value baseline comparison",
    ],
    "not_this_model": [
        "not an LSTM",
        "not any neural network or deep-learning model",
        "not a Random Forest or gradient-boosted ensemble",
        "not multiple regression (there is exactly one feature)",
        "not a model that reads news, sentiment, earnings, volume or macro data",
    ],
    "known_limits": [
        "One feature: yesterday's close. Nothing else can influence the prediction.",
        "Price persistence makes in-sample R-squared look high while out-of-sample skill stays small.",
        "Large errors concentrate on news-driven sessions the model cannot see.",
        "Recursive multi-step projections compound error; only the one-step forecast is defensible.",
        "Yahoo Finance data can be delayed, revised or incomplete.",
    ],
    "disclaimer": "Educational analytics only. Not investment advice.",
}


class ToolError(ValueError):
    """Raised inside a handler when a tool cannot produce a truthful answer."""

    def __init__(self, message: str, code: str = "tool_arguments_invalid") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


# --------------------------------------------------------------------------- argument models


class ToolArgs(BaseModel):
    """Base for every tool contract: unknown keys are rejected outright."""

    model_config = ConfigDict(extra="forbid")


def _clean_ticker(value: str) -> str:
    return normalize_ticker(value)


def _clean_period(value: str) -> str:
    cleaned = (value or "").strip()
    if cleaned not in PERIODS:
        raise ValueError(f"Unsupported period '{value}'. Choose one of: {', '.join(PERIODS)}.")
    return cleaned


def _clean_date(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    try:
        return pd.Timestamp(str(value)).strftime("%Y-%m-%d")
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid date '{value}'. Use YYYY-MM-DD.") from exc


class TickerArgs(ToolArgs):
    ticker: str = Field(description="Yahoo Finance symbol, e.g. RELIANCE.NS, AAPL, ^NSEI, BRK-B.")
    period: str = Field(default="1y", description=f"One of: {', '.join(CONTEXT_PERIODS)}.")

    _v_ticker = field_validator("ticker")(_clean_ticker)
    _v_period = field_validator("period")(_clean_period)


class HistoricalArgs(TickerArgs):
    interval: str = Field(default="1d", description="1d, 1wk or 1mo.")
    start: str | None = Field(default=None, description="Optional YYYY-MM-DD range start.")
    end: str | None = Field(default=None, description="Optional YYYY-MM-DD range end.")
    limit: int = Field(default=60, ge=5, le=250, description="Maximum rows to return.")
    aggregation: str = Field(
        default="auto",
        description="auto, raw, weekly or monthly. Long ranges are aggregated so the answer stays bounded.",
    )

    @field_validator("interval")
    @classmethod
    def _check_interval(cls, v: str) -> str:
        if v not in {"1d", "1wk", "1mo"}:
            raise ValueError("Unsupported interval. Use 1d, 1wk or 1mo.")
        return v

    @field_validator("start", "end")
    @classmethod
    def _check_dates(cls, v: str | None) -> str | None:
        return _clean_date(v)

    @field_validator("aggregation")
    @classmethod
    def _check_aggregation(cls, v: str) -> str:
        if v not in AGGREGATIONS:
            raise ValueError(f"Unsupported aggregation '{v}'. Choose one of: {', '.join(AGGREGATIONS)}.")
        return v


class ModelArgs(TickerArgs):
    period: str = Field(default="2y", description=f"One of: {', '.join(CONTEXT_PERIODS)}.")
    split_ratio: float = Field(default=0.7, ge=0.5, le=0.9, description="Chronological train share.")


class ForecastArgs(ModelArgs):
    horizon: int = Field(default=1, ge=1, le=5, description="Trading sessions to project.")


class CompareArgs(ToolArgs):
    tickers: list[str] = Field(
        description="Two to five Yahoo Finance symbols to compare over the same window."
    )
    period: str = Field(default="1y", description=f"One of: {', '.join(CONTEXT_PERIODS)}.")

    @field_validator("tickers", mode="before")
    @classmethod
    def _coerce_list(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [part for part in v.replace(";", ",").split(",") if part.strip()]
        return v

    @field_validator("tickers")
    @classmethod
    def _check_tickers(cls, v: list[str]) -> list[str]:
        cleaned = [_clean_ticker(str(item)) for item in v]
        unique: list[str] = []
        for item in cleaned:
            if item not in unique:
                unique.append(item)
        if len(unique) < 2:
            raise ValueError("Select at least two tickers to compare.")
        if len(unique) > 5:
            raise ValueError("Compare a maximum of five tickers at once.")
        return unique

    _v_period = field_validator("period")(_clean_period)


class ExplainArgs(ToolArgs):
    ticker: str | None = Field(
        default=None, description="Optional symbol; when given, the fitted equation for that symbol is included."
    )
    period: str = Field(default="2y", description=f"One of: {', '.join(CONTEXT_PERIODS)}.")

    @field_validator("ticker")
    @classmethod
    def _check_ticker(cls, v: str | None) -> str | None:
        return _clean_ticker(v) if v else None

    _v_period = field_validator("period")(_clean_period)


# --------------------------------------------------------------------------- handlers


def _meta_subset(data: Any) -> dict[str, Any]:
    meta = data.payload_meta()
    return {
        "name": meta.get("name"),
        "currency": meta.get("currency"),
        "currency_symbol": meta.get("currency_symbol"),
        "exchange": meta.get("exchange"),
        "price_label": meta.get("price_label", "Adjusted closing price"),
        "adjusted": meta.get("adjusted", True),
        "source": meta.get("source"),
        "retrieved_at": meta.get("retrieved_at"),
        "stale": meta.get("stale"),
        "warning": meta.get("warning"),
        "data_provider": "Yahoo Finance via yfinance",
    }


def _insights(payload: dict[str, Any]) -> list[str]:
    return [str(line) for line in (payload.get("insights") or [])][:MAX_INSIGHT_LINES]


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    previous: float | None = None
    for idx, row in df.iterrows():
        close = float(row["Close"]) if pd.notna(row["Close"]) else None
        record = {
            "date": idx.strftime("%Y-%m-%d"),
            "open": safe_round(float(row["Open"]), 4) if pd.notna(row["Open"]) else None,
            "high": safe_round(float(row["High"]), 4) if pd.notna(row["High"]) else None,
            "low": safe_round(float(row["Low"]), 4) if pd.notna(row["Low"]) else None,
            "close": safe_round(close, 4),
            "volume": safe_round(float(row["Volume"]), 0) if pd.notna(row["Volume"]) else None,
        }
        record["change_pct"] = (
            safe_round((close / previous - 1) * 100, 4) if close is not None and previous else None
        )
        previous = close
        out.append(record)
    return out


def _resample(df: pd.DataFrame, rule: str, label: str) -> tuple[pd.DataFrame, str]:
    frame = df[["Open", "High", "Low", "Close", "Volume"]].resample(rule).agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
    )
    return frame.dropna(subset=["Close"]), label


def _sample_frame(
    df: pd.DataFrame, *, aggregation: str, limit: int
) -> tuple[list[dict[str, Any]], str, str]:
    total = len(df)
    if total == 0:
        return [], "raw", "No observations in the requested range."

    if aggregation == "raw":
        return downsample(_records(df), limit), "raw", "Raw daily rows, thinned to fit the row limit."

    span_days = int((df.index.max() - df.index.min()).days)
    rule = aggregation
    if rule == "auto":
        if total <= limit:
            return _records(df), "raw", "Every observation in the range is listed (no thinning needed)."
        rule = "monthly" if span_days > 400 else "weekly"

    if rule == "weekly":
        frame, label = _resample(df, "W-FRI", "weekly")
        note = (
            f"Weekly aggregation over {total} daily observations: open=first, high=max, low=min, "
            "close=last, volume=sum. Coarse buckets — the regression itself only ever uses daily closes."
        )
    else:
        frame, label = _resample(df, "ME", "monthly")
        note = (
            f"Monthly aggregation over {total} daily observations: open=first, high=max, low=min, "
            "close=last, volume=sum. Coarse buckets — the regression itself only ever uses daily closes."
        )

    if frame.empty:
        return downsample(_records(df), limit), "raw", "Aggregation produced no bucket; raw rows are shown."
    return downsample(_records(frame), limit), label, note


def _get_stock_summary(args: TickerArgs) -> dict[str, Any]:
    data = load_market_data(args.ticker, period=args.period)
    summary = basic_summary(data)
    return {
        "ticker": summary["ticker"],
        "period": args.period,
        "summary": summary,
        "headline": (
            f"{data.ticker} last adjusted close {summary['currency_symbol']}{summary['latest_price']:,.2f} "
            f"on {summary['period_end']} ({summary['change_pct']:+.2f}% versus the previous session), "
            f"{summary['total_records']} daily observations from {summary['period_start']}."
        ),
        "meta": _meta_subset(data),
        "note": "Prices are adjusted closes from Yahoo Finance, not live tick data.",
    }


def _get_historical_data(args: HistoricalArgs) -> dict[str, Any]:
    data = load_market_data(
        args.ticker, period=args.period, interval=args.interval, start=args.start, end=args.end
    )
    # The same budget _compact() would enforce anyway, applied up front so rows_returned always
    # describes the rows the model actually receives.
    row_limit = min(args.limit, MAX_LIST_ITEMS)
    rows, label, note = _sample_frame(data.df, aggregation=args.aggregation, limit=row_limit)
    if args.limit > row_limit:
        note += f" Requested {args.limit} rows; the tool budget returns at most {row_limit}."
    return {
        "ticker": data.ticker,
        "interval": args.interval,
        "range": {
            "start": data.df.index[0].strftime("%Y-%m-%d"),
            "end": data.df.index[-1].strftime("%Y-%m-%d"),
        },
        "aggregation": label,
        "observations_available": int(len(data.df)),
        "rows_returned": len(rows),
        "row_limit": row_limit,
        "columns": ["date", "open", "high", "low", "close", "volume", "change_pct"],
        "rows": rows,
        "note": note,
        "meta": _meta_subset(data),
    }


def _get_trend_analysis(args: TickerArgs) -> dict[str, Any]:
    data = load_market_data(args.ticker, period=args.period)
    payload = trend_analysis(data)
    return {
        "ticker": data.ticker,
        "period": args.period,
        "metrics": payload["metrics"],
        "trends": payload["trends"],
        "insights": _insights(payload),
        "meta": _meta_subset(data),
        "note": "Moving averages are descriptive overlays and are never model inputs.",
    }


def _get_volatility_analysis(args: TickerArgs) -> dict[str, Any]:
    data = load_market_data(args.ticker, period=args.period)
    payload = returns_analysis(data)
    if not payload.get("available"):
        raise ToolError(
            str(payload.get("message") or "Not enough observations for a volatility reading."),
            code="tool_data_unavailable",
        )
    return {
        "ticker": data.ticker,
        "period": args.period,
        "focus": "volatility",
        "metrics": payload["metrics"],
        "insights": _insights(payload),
        "meta": _meta_subset(data),
        "note": "Volatility here is historical, annualised from daily returns (std x sqrt(252)).",
    }


def _get_model_metrics(args: ModelArgs) -> dict[str, Any]:
    data = load_market_data(args.ticker, period=args.period)
    result = run_training(data, split_ratio=args.split_ratio, model_type="lag")
    return {
        "ticker": result["ticker"],
        "period": args.period,
        "model_label": result["model_label"],
        "coefficients": result["coefficients"],
        "operational_coefficients": result["operational_coefficients"],
        "sample": result["sample"],
        "metrics": result["metrics"],
        "residual_stats": result["residual_stats"],
        "trained_at": result["trained_at"],
        "insights": _insights(result),
        "meta": _meta_subset(data),
        "disclaimer": "Out-of-sample metrics only. Past errors do not guarantee future performance.",
    }


def _get_stock_forecast(args: ForecastArgs) -> dict[str, Any]:
    data = load_market_data(args.ticker, period=args.period)
    result = run_training(data, split_ratio=args.split_ratio, model_type="lag")
    forecast = build_forecast(data.df, data.ticker, data.meta, result, horizon=args.horizon)
    fc = forecast["forecast"]
    symbol = forecast.get("currency_symbol", "$")
    return {
        "ticker": forecast["ticker"],
        "horizon": forecast["horizon"],
        "last_observation": forecast["last_observation"],
        "forecast": fc,
        "steps": forecast["steps"],
        "equation": forecast["equation"],
        "coefficients": forecast["coefficients"],
        "residual_stats": forecast["residual_stats"],
        "test_metrics": forecast["metrics"],
        "model_sample": forecast["model_sample"],
        "insights": _insights(forecast),
        "headline": (
            f"PREDICTION (not a fact): the one-feature regression estimates "
            f"{symbol}{fc['predicted_price']:,.2f} for {fc['date']} versus a latest actual close of "
            f"{symbol}{forecast['last_observation']['close']:,.2f}."
        ),
        "meta": _meta_subset(data),
        "disclaimer": "Educational forecast. Not investment advice.",
    }


def _compare_stocks(args: CompareArgs) -> dict[str, Any]:
    payload = comparison_analysis(args.tickers, period=args.period)
    return {
        "tickers": payload["tickers"],
        "benchmark": payload["benchmark"],
        "period": args.period,
        "best": payload["best"],
        "worst": payload["worst"],
        "common_observations": payload["common_observations"],
        "date_range": payload["date_range"],
        "average_pairwise_correlation": payload["average_pairwise_correlation"],
        "metrics": payload["metrics"],
        "correlation_matrix": payload["series"]["correlation"],
        "insights": _insights(payload),
        "note": "Compared on normalised returns, never on raw price levels.",
    }


def _explain_model(args: ExplainArgs) -> dict[str, Any]:
    payload: dict[str, Any] = {
        **MODEL_FACT_SHEET,
        "note": (
            "This description is fixed application fact, not a guess. Any answer about the model must "
            "agree with it."
        ),
    }
    if args.ticker:
        data = load_market_data(args.ticker, period=args.period)
        result = run_training(data, split_ratio=0.7, model_type="lag")
        explained = insights_payload(data, result)
        payload["fitted_example"] = {
            "ticker": data.ticker,
            "period": args.period,
            "equation": explained["equation"],
            "coefficients": explained["coefficients"],
            "feature": explained["feature"],
            "target": explained["target"],
            "sample": explained["sample"],
            "metrics": explained["metrics"],
            "example": explained["example"],
            "explanations": [str(line) for line in explained["explanations"]][:MAX_INSIGHT_LINES],
        }
    return payload


# --------------------------------------------------------------------------- registry


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    args_model: type[BaseModel]
    handler: Callable[[Any], dict[str, Any]]


TOOL_DEFINITIONS: tuple[ToolDefinition, ...] = (
    ToolDefinition(
        name="get_stock_summary",
        description=(
            "Latest real quote for one symbol from Yahoo Finance: last adjusted close, day change and "
            "percent, 52-week high/low, annualised historical volatility, volumes and observation count."
        ),
        args_model=TickerArgs,
        handler=_get_stock_summary,
    ),
    ToolDefinition(
        name="get_historical_data",
        description=(
            "Actual historical OHLCV rows for one symbol. Long ranges are weekly or monthly aggregated and "
            "the row count is capped, so the answer is always a sample of the stored series, never a claim "
            "about every session."
        ),
        args_model=HistoricalArgs,
        handler=_get_historical_data,
    ),
    ToolDefinition(
        name="get_trend_analysis",
        description=(
            "Descriptive trend reading for one symbol: 20/50/200-day averages, distance from range high/low, "
            "short/medium/long trend labels and plain-language insights. Not a forecast."
        ),
        args_model=TickerArgs,
        handler=_get_trend_analysis,
    ),
    ToolDefinition(
        name="get_volatility_analysis",
        description=(
            "Historical return and volatility statistics for one symbol: daily return mean and standard "
            "deviation, annualised volatility, cumulative return, maximum drawdown, best and worst sessions."
        ),
        args_model=TickerArgs,
        handler=_get_volatility_analysis,
    ),
    ToolDefinition(
        name="get_model_metrics",
        description=(
            "The fitted Simple Linear Regression (previous close -> current close) for one symbol: equation, "
            "intercept, slope, chronological sample sizes, out-of-sample MAE/MSE/RMSE/R-squared/MAPE/"
            "directional accuracy and the naive previous-value baseline it is judged against."
        ),
        args_model=ModelArgs,
        handler=_get_model_metrics,
    ),
    ToolDefinition(
        name="get_stock_forecast",
        description=(
            "The regression's next-session (or up to 5-session recursive) prediction for one symbol, with the "
            "empirical error band from holdout residuals and calendar-verified forecast date. These are "
            "predictions, never facts."
        ),
        args_model=ForecastArgs,
        handler=_get_stock_forecast,
    ),
    ToolDefinition(
        name="compare_stocks",
        description=(
            "Compare two to five symbols over one shared window on normalised returns: total return, "
            "annualised volatility, start/end price, best and worst performer and the correlation matrix."
        ),
        args_model=CompareArgs,
        handler=_compare_stocks,
    ),
    ToolDefinition(
        name="explain_model",
        description=(
            "Authoritative description of the predictive model actually used by this app (Simple Linear "
            "Regression on the previous close), what it cannot see, and — with an optional ticker — the fitted "
            "equation for that symbol. Use this before answering any 'how does the model work' question."
        ),
        args_model=ExplainArgs,
        handler=_explain_model,
    ),
)

TOOL_REGISTRY: dict[str, ToolDefinition] = {tool.name: tool for tool in TOOL_DEFINITIONS}
TOOL_NAMES: tuple[str, ...] = tuple(TOOL_REGISTRY)


def tool_schemas() -> list[dict[str, Any]]:
    """OpenAI/DeepSeek function-spec list generated from the validated models (single source of truth)."""
    schemas: list[dict[str, Any]] = []
    for tool in TOOL_DEFINITIONS:
        parameters = jsonable(tool.args_model.model_json_schema())
        parameters["additionalProperties"] = False
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": parameters,
                },
            }
        )
    return schemas


def _summarise(text: str, limit: int = MAX_CATALOG_DESCRIPTION_CHARACTERS) -> str:
    """First sentence of a tool description, word-clipped, for the UI-facing catalogue."""
    cleaned = " ".join((text or "").split())
    sentence = cleaned.split(". ")[0].rstrip(".") + "." if ". " in cleaned else cleaned
    if len(sentence) > limit:
        sentence = sentence[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return sentence


def tool_catalog() -> list[dict[str, Any]]:
    """Compact catalogue for the status endpoint, so the UI can describe what the Copilot can do."""
    return [
        {"name": tool.name, "description": _summarise(tool.description), "read_only": True}
        for tool in TOOL_DEFINITIONS
    ]


def _success(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"ok": True, "tool": name, "data": _compact(payload)}


def _failure(name: str, code: str, message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "tool": name,
        "error": {"code": code, "message": (message or "Tool failed.")[:600]},
    }


def _compact(payload: dict[str, Any], limit: int = MAX_TOOL_CHARACTERS) -> dict[str, Any]:
    data = jsonable(payload)
    if not isinstance(data, dict):
        data = {"result": data}
    for key, value in list(data.items()):
        if isinstance(value, list) and len(value) > MAX_LIST_ITEMS:
            data[key] = downsample(value, MAX_LIST_ITEMS)
            data[f"{key}_truncated"] = True
    text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) > limit:
        data = {
            key: (value[:800] + "…") if isinstance(value, str) and len(value) > 800 else value
            for key, value in data.items()
        }
        text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) > limit:
        data = {"note": "Tool result exceeded the size budget and was reduced.", "preview": text[:limit]}
    return data


def _coerce_arguments(raw: Any) -> dict[str, Any]:
    if raw is None or raw == "":
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        if len(raw) > MAX_ARGUMENT_CHARACTERS:
            raise ToolError("Tool arguments were too large.", code="tool_arguments_invalid")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ToolError(
                f"Tool arguments are not valid JSON: {type(exc).__name__}.", code="tool_arguments_invalid"
            ) from exc
        if not isinstance(parsed, dict):
            raise ToolError("Tool arguments must be a JSON object.", code="tool_arguments_invalid")
        return parsed
    raise ToolError("Tool arguments must be a JSON object.", code="tool_arguments_invalid")


def _validation_message(exc: ValidationError) -> str:
    parts: list[str] = []
    for issue in exc.errors()[:4]:
        field = ".".join(str(loc) for loc in issue.get("loc", [])) or "arguments"
        parts.append(f"{field}: {issue.get('msg', 'invalid')}")
    return "Invalid tool arguments — " + "; ".join(parts)


def execute_tool(name: str, arguments: Any) -> dict[str, Any]:
    """Run one allowlisted tool. Never raises: the outcome is a structured result."""
    tool = TOOL_REGISTRY.get(str(name or "").strip())
    if tool is None:
        return _failure(
            str(name)[:48],
            "tool_not_allowed",
            f"'{name}' is not an allowed tool. Allowed tools are: {', '.join(TOOL_NAMES)}.",
        )

    try:
        payload = _coerce_arguments(arguments)
        args = tool.args_model.model_validate(payload)
    except ToolError as exc:
        return _failure(tool.name, exc.code, exc.message)
    except ValidationError as exc:
        return _failure(tool.name, "tool_arguments_invalid", _validation_message(exc))
    except ValueError as exc:
        return _failure(tool.name, "tool_arguments_invalid", str(exc))

    try:
        return _success(tool.name, tool.handler(args))
    except MarketDataError as exc:
        return _failure(tool.name, "tool_data_unavailable", exc.message)
    except ToolError as exc:
        return _failure(tool.name, exc.code, exc.message)
    except ValueError as exc:
        return _failure(tool.name, "tool_arguments_invalid", str(exc))
    except Exception:  # pragma: no cover - defensive; never leak internals to the model
        logger.warning("chat tool '%s' raised unexpectedly", tool.name)
        return _failure(
            tool.name,
            "tool_execution_failed",
            f"{tool.name} could not complete. The error was logged server-side without message content.",
        )


def tool_content(envelope: dict[str, Any]) -> str:
    """Serialise a tool envelope for the upstream ``tool`` message, size-bounded."""
    text = json.dumps(envelope, ensure_ascii=False, default=str)
    if len(text) > MAX_TOOL_CHARACTERS:
        trimmed = dict(envelope)
        trimmed["data"] = {"note": "Result truncated for the model context.", "preview": text[:1000]}
        text = json.dumps(trimmed, ensure_ascii=False, default=str)
    return text[:MAX_TOOL_CHARACTERS]
