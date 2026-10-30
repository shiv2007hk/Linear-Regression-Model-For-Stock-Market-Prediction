from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ml.data_loader import MarketData, load_market_data
from ml.evaluation import downsample
from utils import safe_round

TRADING_DAYS = 252


def _fmt(x: float | None, digits: int = 2) -> str:
    return "n/a" if x is None else f"{x:,.{digits}f}"


def _series(df: pd.DataFrame, columns: list[str], max_points: int = 1600) -> list[dict[str, Any]]:
    frame = df[columns].copy()
    records = []
    for idx, row in frame.iterrows():
        rec: dict[str, Any] = {"date": idx.strftime("%Y-%m-%d")}
        for col in columns:
            val = row[col]
            rec[col] = safe_round(float(val), 4) if pd.notna(val) else None
        records.append(rec)
    return downsample(records, max_points)


def _histogram(values: pd.Series, bins: int = 30) -> list[dict[str, Any]]:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if clean.empty:
        return []
    counts, edges = np.histogram(clean.to_numpy(dtype=float), bins=bins)
    return [
        {
            "bin_start": safe_round(float(edges[i]), 4),
            "bin_end": safe_round(float(edges[i + 1]), 4),
            "center": safe_round(float((edges[i] + edges[i + 1]) / 2), 4),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]


def _trend_label(diff_pct: float | None) -> str:
    if diff_pct is None:
        return "insufficient history"
    if diff_pct > 2:
        return "uptrend"
    if diff_pct < -2:
        return "downtrend"
    return "sideways"


def trend_analysis(data: MarketData) -> dict[str, Any]:
    df = data.df.copy()
    close = df["Close"].astype(float)
    symbol = data.meta.get("currency_symbol", "$")

    for window in (20, 50, 200):
        df[f"sma{window}"] = close.rolling(window).mean() if len(df) >= window else np.nan
    df["rolling_high"] = close.rolling(252, min_periods=20).max()
    df["rolling_low"] = close.rolling(252, min_periods=20).min()

    latest = float(close.iloc[-1])
    avg_close = float(close.mean())
    high = float(close.max())
    low = float(close.min())
    high_date = close.idxmax().strftime("%Y-%m-%d")
    low_date = close.idxmin().strftime("%Y-%m-%d")
    distance_from_high = (latest - high) / high * 100

    sma_values: dict[str, float | None] = {}
    for window in (20, 50, 200):
        series = df[f"sma{window}"]
        sma_values[f"sma{window}"] = safe_round(float(series.iloc[-1]), 4) if series.notna().any() else None

    diffs: dict[str, float | None] = {}
    for window in (20, 50, 200):
        value = sma_values[f"sma{window}"]
        diffs[f"close_vs_sma{window}"] = safe_round((latest - value) / value * 100, 2) if value else None

    sma20_slope = None
    if len(df) >= 26 and df["sma20"].notna().sum() >= 6:
        s = df["sma20"].dropna()
        sma20_slope = safe_round(float((s.iloc[-1] / s.iloc[-6] - 1) * 100), 2)

    sma_spread = (
        safe_round((sma_values["sma20"] - sma_values["sma50"]) / sma_values["sma50"] * 100, 2)
        if sma_values["sma20"] and sma_values["sma50"]
        else None
    )
    golden_cross = None
    if sma_values["sma50"] and sma_values["sma200"]:
        golden_cross = sma_values["sma50"] > sma_values["sma200"]

    short_label = _trend_label(diffs["close_vs_sma20"])
    medium_label = _trend_label(diffs["close_vs_sma50"])
    long_label = _trend_label(diffs["close_vs_sma200"])

    insights = [
        f"Latest adjusted close is {symbol}{latest:,.2f}, which is {diffs['close_vs_sma20']:+.2f}% versus the 20-day average "
        f"and {diffs['close_vs_sma50']:+.2f}% versus the 50-day average." if diffs["close_vs_sma20"] is not None and diffs["close_vs_sma50"] is not None else
        f"Latest adjusted close is {symbol}{latest:,.2f}.",
        f"Short-term reading: {short_label}; the 20-day average moved {_fmt(sma20_slope)}% over the last 5 sessions.",
        f"The stock sits {abs(distance_from_high):.2f}% below its highest close in the selected window ({symbol}{high:,.2f} on {high_date}) "
        f"and {((latest - low) / low * 100):.2f}% above the lowest close ({symbol}{low:,.2f} on {low_date}).",
        f"Historical average close across the window is {symbol}{avg_close:,.2f}; the 20-day and 50-day averages differ by "
        f"{_fmt(sma_spread)}%." if sma_spread is not None else
        "Not enough observations for the 20/50-day moving-average spread in this window.",
    ]
    if long_label != "insufficient history":
        insights.append(
            f"Long-term reading: {long_label} relative to the 200-day average. A 50-day average above the 200-day average "
            f"({'yes' if golden_cross else 'no'}) is a descriptive signal only and is not fed into the regression model."
        )
    insights.append(
        "Moving averages smooth past prices; they are descriptive overlays and are deliberately excluded from the Simple Linear Regression input."
    )

    return {
        "meta": data.payload_meta(),
        "series": _series(df, ["Close", "sma20", "sma50", "sma200", "rolling_high", "rolling_low"]),
        "metrics": {
            "latest": safe_round(latest, 4),
            "average_close": safe_round(avg_close, 4),
            "highest": safe_round(high, 4),
            "lowest": safe_round(low, 4),
            "highest_date": high_date,
            "lowest_date": low_date,
            "distance_from_high_pct": safe_round(distance_from_high, 2),
            "distance_from_low_pct": safe_round((latest - low) / low * 100, 2),
            "sma20": sma_values["sma20"],
            "sma50": sma_values["sma50"],
            "sma200": sma_values["sma200"],
            "close_vs_sma20_pct": diffs["close_vs_sma20"],
            "close_vs_sma50_pct": diffs["close_vs_sma50"],
            "close_vs_sma200_pct": diffs["close_vs_sma200"],
            "sma20_slope_5d_pct": sma20_slope,
            "sma20_sma50_spread_pct": sma_spread,
            "golden_cross": golden_cross,
            "observations": int(len(df)),
        },
        "trends": {"short_term": short_label, "medium_term": medium_label, "long_term": long_label},
        "insights": insights,
    }


def returns_analysis(data: MarketData) -> dict[str, Any]:
    df = data.df.copy()
    close = df["Close"].astype(float)
    ret = close.pct_change().dropna()
    symbol = data.meta.get("currency_symbol", "$")

    if len(ret) < 5:
        return {
            "meta": data.payload_meta(),
            "available": False,
            "message": "At least 6 price observations are required for return analysis.",
            "insights": [],
        }

    cumulative = ((1 + ret).cumprod() - 1) * 100
    running_max = close.cummax()
    drawdown = (close / running_max - 1) * 100
    rolling_vol = ret.rolling(21).std() * np.sqrt(TRADING_DAYS) * 100

    ann_vol = float(ret.std(ddof=1) * np.sqrt(TRADING_DAYS) * 100)
    avg_daily = float(ret.mean() * 100)
    best_idx = ret.idxmax()
    worst_idx = ret.idxmin()
    max_dd = float(drawdown.min())
    max_dd_date = drawdown.idxmin().strftime("%Y-%m-%d")
    positive_share = float((ret > 0).mean() * 100)
    total_return = float((close.iloc[-1] / close.iloc[0] - 1) * 100)

    ret_frame = pd.DataFrame(
        {
            "date": ret.index,
            "return_pct": ret.to_numpy() * 100,
        }
    ).set_index("date")
    cum_frame = pd.DataFrame({"cumulative_return_pct": cumulative})
    dd_frame = pd.DataFrame({"drawdown_pct": drawdown})
    vol_frame = pd.DataFrame({"rolling_volatility_pct": rolling_vol})

    gains = ret[ret > 0].to_numpy() * 100
    losses = ret[ret < 0].to_numpy() * 100
    avg_gain = float(np.mean(gains)) if len(gains) else None
    avg_loss = float(np.mean(losses)) if len(losses) else None
    if avg_gain is not None and avg_loss is not None:
        gain_loss_sentence = (
            f"Loss observations average {avg_loss:.2f}% versus {avg_gain:.2f}% for gains, so volatility is not symmetric."
        )
    elif avg_gain is not None:
        gain_loss_sentence = f"Every return observation in this window was positive, averaging {avg_gain:.2f}%; there were no losing days."
    else:
        gain_loss_sentence = f"Every return observation in this window was negative, averaging {avg_loss:.2f}%; there were no gaining days."

    insights = [
        f"Over {len(ret)} trading observations the stock returned {total_return:+.2f}% in total, averaging {avg_daily:+.4f}% per day.",
        f"Annualised historical volatility is {ann_vol:.2f}%, based on the daily standard deviation ({ret.std(ddof=1) * 100:.2f}%) times √252.",
        f"Maximum drawdown was {max_dd:.2f}% (trough on {max_dd_date}); the deepest peak-to-trough decline in the selected window.",
        f"{positive_share:.1f}% of trading observations were positive. Best day {ret.loc[best_idx] * 100:+.2f}% on {best_idx.strftime('%Y-%m-%d')}; "
        f"worst day {ret.loc[worst_idx] * 100:+.2f}% on {worst_idx.strftime('%Y-%m-%d')}.",
        gain_loss_sentence,
        "Historical returns and volatility describe what happened; they do not guarantee or bound future outcomes.",
    ]

    return {
        "meta": data.payload_meta(),
        "available": True,
        "series": {
            "returns": downsample(
                [{"date": idx.strftime("%Y-%m-%d"), "return_pct": safe_round(float(row.return_pct), 4)} for idx, row in ret_frame.iterrows()],
                1600,
            ),
            "cumulative": downsample(
                [{"date": idx.strftime("%Y-%m-%d"), "cumulative_return_pct": safe_round(float(row.cumulative_return_pct), 4)} for idx, row in cum_frame.iterrows()],
                1600,
            ),
            "drawdown": downsample(
                [{"date": idx.strftime("%Y-%m-%d"), "drawdown_pct": safe_round(float(row.drawdown_pct), 4)} for idx, row in dd_frame.iterrows()],
                1600,
            ),
            "rolling_volatility": downsample(
                [{"date": idx.strftime("%Y-%m-%d"), "rolling_volatility_pct": safe_round(float(row.rolling_volatility_pct), 4)} for idx, row in vol_frame.dropna().iterrows()],
                1600,
            ),
            "histogram": _histogram(ret * 100, bins=30),
            "gains": _histogram(ret[ret > 0] * 100, bins=16),
            "losses": _histogram(ret[ret < 0] * 100, bins=16),
        },
        "metrics": {
            "average_daily_return_pct": safe_round(avg_daily, 4),
            "daily_std_pct": safe_round(float(ret.std(ddof=1) * 100), 4),
            "annualized_volatility_pct": safe_round(ann_vol, 2),
            "cumulative_return_pct": safe_round(total_return, 2),
            "max_drawdown_pct": safe_round(max_dd, 2),
            "max_drawdown_date": max_dd_date,
            "best_day": {"date": best_idx.strftime("%Y-%m-%d"), "return_pct": safe_round(float(ret.loc[best_idx] * 100), 2)},
            "worst_day": {"date": worst_idx.strftime("%Y-%m-%d"), "return_pct": safe_round(float(ret.loc[worst_idx] * 100), 2)},
            "positive_share_pct": safe_round(positive_share, 2),
            "average_gain_pct": safe_round(avg_gain, 3),
            "average_loss_pct": safe_round(avg_loss, 3),
            "observations": int(len(ret)),
        },
        "insights": insights,
    }


def comparison_analysis(
    tickers: list[str],
    period: str = "1y",
    start: str | None = None,
    end: str | None = None,
    benchmark: str | None = None,
) -> dict[str, Any]:
    unique: list[str] = []
    for t in tickers:
        t = t.strip().upper()
        if t and t not in unique:
            unique.append(t)
    if len(unique) < 2:
        raise ValueError("Select at least two tickers to compare.")
    if len(unique) > 5:
        raise ValueError("Compare a maximum of five tickers at once.")

    metas: dict[str, Any] = {}
    closes: dict[str, pd.Series] = {}
    for ticker in unique:
        data = load_market_data(ticker, period=period, start=start, end=end)
        metros = data.meta
        metas[ticker] = {
            "ticker": ticker,
            "name": metros.get("name"),
            "currency": metros.get("currency"),
            "currency_symbol": metros.get("currency_symbol"),
            "exchange": metros.get("exchange"),
        }
        closes[ticker] = data.df["Close"].astype(float)

    frame = pd.concat(closes, axis=1, join="inner").dropna()
    if len(frame) < 10:
        raise ValueError("The selected tickers share too few common trading observations in this period.")

    normalized = frame / frame.iloc[0] * 100
    returns = frame.pct_change().dropna()
    corr = returns.corr()

    metrics: dict[str, dict[str, Any]] = {}
    for ticker in unique:
        series = frame[ticker]
        rets = returns[ticker]
        metrics[ticker] = {
            "total_return_pct": safe_round(float((series.iloc[-1] / series.iloc[0] - 1) * 100), 2),
            "average_daily_return_pct": safe_round(float(rets.mean() * 100), 4),
            "annualized_volatility_pct": safe_round(float(rets.std(ddof=1) * np.sqrt(TRADING_DAYS) * 100), 2),
            "start_price": safe_round(float(series.iloc[0]), 4),
            "end_price": safe_round(float(series.iloc[-1]), 4),
            "currency": metas[ticker]["currency"],
            "currency_symbol": metas[ticker]["currency_symbol"],
        }

    best = max(metrics, key=lambda t: metrics[t]["total_return_pct"] or -1e9)
    worst = min(metrics, key=lambda t: metrics[t]["total_return_pct"] or 1e9)

    bench = benchmark.upper() if benchmark else unique[0]
    if bench not in unique:
        bench = unique[0]

    pairs = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            pairs.append((cols[i], cols[j]))

    rolling = {}
    for a, b in pairs:
        r = returns[a].rolling(63).corr(returns[b]).dropna()
        rolling[f"{a}|{b}"] = downsample(
            [{"date": idx.strftime("%Y-%m-%d"), "correlation": safe_round(float(v), 4)} for idx, v in r.items()],
            1200,
        )

    insights = [
        f"Across {len(frame)} common trading observations, {best} delivered the best total return ({metrics[best]['total_return_pct']:+.2f}%) "
        f"and {worst} the weakest ({metrics[worst]['total_return_pct']:+.2f}%).",
        f"Normalised prices start at 100 for every stock, so relative performance is comparable even when currencies and price levels differ.",
        f"Average pairwise return correlation is {np.mean([corr.loc[a, b] for a, b in pairs]):.3f}. "
        + ("High positive correlation means the names tend to move together and offer little diversification." if np.mean([corr.loc[a, b] for a, b in pairs]) > 0.7 else "Correlations below roughly 0.7 indicate more independent movement."),
        f"Against benchmark {bench}, correlations range from {corr[bench].drop(bench).min():.3f} to {corr[bench].drop(bench).max():.3f}.",
        "Absolute price levels are never compared directly; charts use normalised values and returns.",
        "Correlation measures co-movement, not causation, and is unstable across market regimes.",
    ]

    heatmap = {
        "x": cols,
        "y": cols,
        "z": [[safe_round(float(corr.loc[r, c]), 4) for c in cols] for r in cols],
    }

    rolling_series = []
    for idx in normalized.index[:: max(1, len(normalized) // 1000)]:
        row: dict[str, Any] = {"date": idx.strftime("%Y-%m-%d")}
        for t in unique:
            row[t] = safe_round(float(normalized.loc[idx, t]), 3)
        rolling_series.append(row)

    return {
        "tickers": unique,
        "benchmark": bench,
        "metas": metas,
        "metrics": metrics,
        "best": best,
        "worst": worst,
        "common_observations": int(len(frame)),
        "date_range": {
            "start": frame.index.min().strftime("%Y-%m-%d"),
            "end": frame.index.max().strftime("%Y-%m-%d"),
        },
        "average_pairwise_correlation": safe_round(
            float(np.mean([corr.loc[a, b] for a, b in pairs])), 4
        ),
        "series": {
            "normalized": downsample(rolling_series, 1200),
            "returns": downsample(
                [
                    {"date": idx.strftime("%Y-%m-%d"), **{t: safe_round(float(returns.loc[idx, t]) * 100, 4) for t in unique}}
                    for idx in returns.index
                ],
                1200,
            ),
            "correlation": heatmap,
            "rolling_correlation": rolling,
        },
        "insights": insights,
    }


def data_quality(data: MarketData) -> dict[str, Any]:
    df = data.df
    raw_quality = data.meta.get("quality", {})
    close = df["Close"].astype(float)

    monthly = pd.Series(1, index=df.index).resample("ME").sum()
    monthly_rows = [
        {"month": idx.strftime("%Y-%m"), "observations": int(val)} for idx, val in monthly.items()
    ]

    daily_counts = pd.Series(1, index=df.index).resample("D").sum()
    daily_rows = [
        {"date": idx.strftime("%Y-%m-%d"), "observations": int(val)} for idx, val in daily_counts.items()
    ]
    daily_rows = downsample(daily_rows, 900)

    missing_by_field = {
        "Open": int(df["Open"].isna().sum()),
        "High": int(df["High"].isna().sum()),
        "Low": int(df["Low"].isna().sum()),
        "Close": int(df["Close"].isna().sum()),
        "Volume": int(df["Volume"].isna().sum()),
    }

    insights = [
        f"{len(df)} cleaned daily observations are available between {df.index[0].strftime('%Y-%m-%d')} and {df.index[-1].strftime('%Y-%m-%d')}.",
        f"The raw Yahoo Finance response contained {raw_quality.get('raw_records', len(df))} rows, "
        f"{raw_quality.get('missing_values', 0)} missing OHLC values, {raw_quality.get('duplicate_dates', 0)} duplicate dates and "
        f"{raw_quality.get('invalid_prices', 0)} non-positive/invalid closes before cleaning.",
        f"{missing_by_field['Close']} close values are missing after cleaning (cleaning drops unusable closes), and dates are sorted ascending with duplicates collapsed.",
        "The machine-learning dataset is built from the cleaned closes with a one-observation lag; the first row is dropped because it has no previous close.",
        "Yahoo Finance can deliver delayed, revised or incomplete history; treat this as research data, not exchange-grade data.",
    ]

    return {
        "meta": data.payload_meta(),
        "metrics": {
            "raw_records": raw_quality.get("raw_records", len(df)),
            "cleaned_records": int(len(df)),
            "quality": raw_quality,
            "missing_by_field": missing_by_field,
            "missing_total": int(sum(missing_by_field.values())),
            "duplicate_dates": raw_quality.get("duplicate_dates", 0),
            "invalid_prices": raw_quality.get("invalid_prices", 0),
            "first_date": df.index[0].strftime("%Y-%m-%d"),
            "last_date": df.index[-1].strftime("%Y-%m-%d"),
            "rows_removed": raw_quality.get("rows_removed", 0),
            "usable_pct": raw_quality.get("usable_pct"),
            "unique_dates": int(df.index.nunique()),
            "price_min": safe_round(float(close.min()), 4),
            "price_max": safe_round(float(close.max()), 4),
            "price_mean": safe_round(float(close.mean()), 4),
        },
        "series": {
            "price_histogram": _histogram(close, bins=30),
            "monthly_counts": monthly_rows,
            "daily_counts": daily_rows,
            "availability": monthly_rows,
        },
        "insights": insights,
    }
