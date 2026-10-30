from __future__ import annotations

from typing import Any

import numpy as np
from scipy import stats

from utils import safe_round


def _histogram(values: list[float], bins: int = 24) -> list[dict[str, Any]]:
    if not values:
        return []
    counts, edges = np.histogram(np.asarray(values, dtype=float), bins=bins)
    return [
        {
            "bin_start": safe_round(float(edges[i]), 4),
            "bin_end": safe_round(float(edges[i + 1]), 4),
            "center": safe_round(float((edges[i] + edges[i + 1]) / 2), 4),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]


def residual_diagnostics(model_result: dict[str, Any]) -> dict[str, Any]:
    rows = [r for r in model_result["series"]["test"] if r.get("error") is not None and r.get("predicted") is not None]
    if len(rows) < 8:
        return {
            "available": False,
            "message": "At least 8 out-of-sample residuals are required for diagnostics. Use a longer history or a larger test split.",
            "insights": [],
        }

    residuals = np.asarray([r["error"] for r in rows], dtype=float)
    fitted = np.asarray([r["predicted"] for r in rows], dtype=float)
    dates = [r["date"] for r in rows]
    n = len(residuals)

    mean = float(np.mean(residuals))
    std = float(np.std(residuals, ddof=1))
    skew = float(stats.skew(residuals, bias=False))
    kurt = float(stats.kurtosis(residuals, fisher=True, bias=False))

    jb_stat, jb_p = stats.jarque_bera(residuals)

    bp_stat, bp_p = (None, None)
    try:
        import statsmodels.api as sm
        from statsmodels.stats.diagnostic import het_breuschpagan

        exog = sm.add_constant(fitted)
        bp_stat, bp_p, _, _ = het_breuschpagan(residuals, exog)
    except Exception:
        pass

    acf_values: list[float] = []
    try:
        from statsmodels.tsa.stattools import acf

        nlags = int(min(40, max(5, n // 2)))
        acf_values = [float(v) for v in acf(residuals, nlags=nlags, fft=True)]
    except Exception:
        acf_values = []
    band = 1.96 / np.sqrt(n)
    significant_lags = [i for i, v in enumerate(acf_values) if i > 0 and abs(v) > band]

    qq = stats.probplot(residuals, dist="norm", fit=True)
    theoretical, ordered = qq[0]
    qq_rows = [
        {"theoretical": safe_round(float(theoretical[i]), 4), "sample": safe_round(float(ordered[i]), 4)}
        for i in range(len(theoretical))
    ]
    slope, intercept = qq[1][0], qq[1][1]

    threshold = 2.5 * std if std > 0 else 0
    outliers = sorted(
        [
            {
                "date": row["date"],
                "residual": safe_round(row["error"], 4),
                "actual": row["actual"],
                "predicted": row["predicted"],
                "z_score": safe_round(row["error"] / std, 3) if std else None,
            }
            for row in rows
            if abs(row["error"]) > threshold
        ],
        key=lambda r: abs(r["residual"]),
        reverse=True,
    )[:10]

    insights: list[str] = []
    if abs(mean) < std * 0.25:
        insights.append(
            f"Residuals average {mean:+.4f}, close to zero relative to their spread ({std:.4f}); the model shows no large overall bias."
        )
    else:
        direction = "over-predicting" if mean < 0 else "under-predicting"
        insights.append(
            f"Residuals average {mean:+.4f} against a spread of {std:.4f}; the model is systematically {direction} by a non-trivial margin."
        )
    insights.append(
        f"Skewness {skew:+.3f} and excess kurtosis {kurt:+.3f}. "
        + ("Errors are skewed and/or heavy-tailed, so typical error metrics hide occasional large misses." if abs(skew) > 0.8 or kurt > 1.5 else "The error shape is roughly symmetric and not unusually heavy-tailed.")
    )
    if significant_lags:
        insights.append(
            f"Residual autocorrelation exceeds the ±{band:.3f} 95% band at {len(significant_lags)} lag(s) "
            f"(first at lag {significant_lags[0]}). Errors carry information the one-feature model leaves unused — "
            "the naive benchmark may be hard to beat."
        )
    else:
        insights.append(
            f"No residual autocorrelation exceeds the ±{band:.3f} 95% band, but this does not prove independence or forecasting skill."
        )
    if bp_p is not None:
        if bp_p < 0.05:
            insights.append(
                f"Breusch–Pagan test p-value {bp_p:.4f} suggests heteroscedasticity: error variance changes with the fitted price level, "
                "so a single error band will understate risk in volatile regimes."
            )
        else:
            insights.append(
                f"Breusch–Pagan test p-value {bp_p:.4f} gives no significant evidence of heteroscedasticity at the 5% level."
            )
    if jb_p < 0.05:
        insights.append(
            f"Jarque–Bera p-value {jb_p:.4f} rejects residual normality; normal-theory confidence intervals would be unreliable."
        )
    else:
        insights.append(f"Jarque–Bera p-value {jb_p:.4f} does not reject residual normality at the 5% level.")
    insights.append(
        "Passing diagnostics does not make the forecast reliable: a one-feature model still cannot see news, earnings or regime shifts."
    )

    return {
        "available": True,
        "stats": {
            "n": n,
            "mean": safe_round(mean, 6),
            "std": safe_round(std, 6),
            "skewness": safe_round(skew, 4),
            "excess_kurtosis": safe_round(kurt, 4),
            "jarque_bera_stat": safe_round(float(jb_stat), 4),
            "jarque_bera_p": safe_round(float(jb_p), 6),
            "breusch_pagan_stat": safe_round(float(bp_stat), 4) if bp_stat is not None else None,
            "breusch_pagan_p": safe_round(float(bp_p), 6) if bp_p is not None else None,
            "acf_band": safe_round(float(band), 4),
            "significant_acf_lags": significant_lags,
            "outlier_threshold": safe_round(float(threshold), 4),
        },
        "series": {
            "vs_fitted": [
                {"fitted": safe_round(fitted[i], 4), "residual": safe_round(residuals[i], 4), "date": dates[i]}
                for i in range(n)
            ],
            "over_time": [
                {"date": dates[i], "residual": safe_round(residuals[i], 4), "band": safe_round(float(band * std), 4)}
                for i in range(n)
            ],
            "histogram": _histogram(residuals.tolist()),
            "qq": {
                "points": qq_rows,
                "slope": safe_round(float(slope), 4),
                "intercept": safe_round(float(intercept), 4),
            },
            "acf": [
                {"lag": i, "value": safe_round(v, 4)} for i, v in enumerate(acf_values)
            ],
        },
        "outliers": outliers,
        "insights": insights,
    }
