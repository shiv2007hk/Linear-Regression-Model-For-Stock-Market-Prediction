"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw, TriangleAlert } from "lucide-react";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { useInView } from "@/components/marketing/motion";
import { useApi } from "@/lib/hooks";
import { qs } from "@/lib/api";
import { baseLayout, barTrace, gradientFill, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/components/ui/cn";
import type { DashboardPayload } from "@/lib/analytics-types";

const COMPANIES = [
  { ticker: "RELIANCE.NS", label: "Reliance", market: "NSE" },
  { ticker: "TCS.NS", label: "TCS", market: "NSE" },
  { ticker: "AAPL", label: "Apple", market: "NASDAQ" },
  { ticker: "NVDA", label: "NVIDIA", market: "NASDAQ" },
];

type View = "price" | "fit" | "volume";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "price", label: "Price & trend" },
  { value: "fit", label: "Actual vs predicted" },
  { value: "volume", label: "Volume" },
];

export function AnalyticsShowcase() {
  const [ticker, setTicker] = useState(COMPANIES[0].ticker);
  const [view, setView] = useState<View>("price");
  const { ref, inView } = useInView<HTMLElement>("0px 0px -16% 0px");
  const key = inView ? `/api/dashboard${qs({ ticker, period: "2y", split_ratio: 0.7 })}` : null;
  const { data, error, isLoading, isValidating, mutate } = useApi<DashboardPayload>(key);

  const pal = useMemo(() => palette(true), []);
  const company = COMPANIES.find((item) => item.ticker === ticker) ?? COMPANIES[0];

  const chart = useMemo(() => {
    if (!data) return null;
    const symbol = data.summary.currency_symbol;
    if (view === "price") {
      const x = data.series.price.map((row) => row.date);
      return {
        ariaLabel: `${ticker} adjusted closing price with 20 and 50 session moving averages over ${
          data.summary.period_start
        } to ${data.summary.period_end}.`,
        traces: [
          lineTrace({
            x,
            y: data.series.price.map((row) => row.Close),
            name: "Adjusted close",
            color: pal.accent,
            width: 1.8,
            fill: "tozeroy",
            fillColor: gradientFill(pal),
          }),
          lineTrace({ x, y: data.series.price.map((row) => row.sma20), name: "SMA 20", color: pal.blue, width: 1.1 }),
          lineTrace({ x, y: data.series.price.map((row) => row.sma50), name: "SMA 50", color: pal.amber, width: 1.1 }),
        ],
        layout: baseLayout(pal, {
          height: 330,
          currencySymbol: symbol,
          yTitle: "Adjusted close",
          yKind: "currency",
          hovermode: "x unified",
          margin: { l: 58, r: 16, t: 18, b: 34 },
        }),
      };
    }
    if (view === "fit") {
      const rows = data.series.actual_vs_predicted;
      const x = rows.map((row) => row.date);
      return {
        ariaLabel: `Actual and predicted ${ticker} adjusted close on ${rows.length} unseen holdout observations.`,
        traces: [
          lineTrace({ x, y: rows.map((row) => row.actual), name: "Actual", color: pal.ink, width: 1.6 }),
          lineTrace({
            x,
            y: rows.map((row) => row.predicted),
            name: "Predicted",
            color: pal.accent,
            width: 1.6,
            dash: "dash",
          }),
        ],
        layout: baseLayout(pal, {
          height: 330,
          currencySymbol: symbol,
          yTitle: "Adjusted close",
          yKind: "currency",
          hovermode: "x unified",
          margin: { l: 58, r: 16, t: 18, b: 34 },
        }),
      };
    }
    const x = data.series.volume.map((row) => row.date);
    return {
      ariaLabel: `Daily trading volume for ${ticker}, ${data.series.volume.length} observations.`,
      traces: [
        barTrace({
          x,
          y: data.series.volume.map((row) => row.volume),
          name: "Volume",
          color: pal.blue,
          opacity: 0.55,
        }),
      ],
      layout: baseLayout(pal, {
        height: 330,
        yTitle: "Shares",
        yKind: "compact",
        hovermode: "x unified",
        showLegend: false,
        margin: { l: 58, r: 16, t: 18, b: 34 },
      }),
    };
  }, [data, pal, ticker, view]);

  const metrics = data
    ? [
        { label: "R² on holdout", value: data.model.r2 === null ? "—" : data.model.r2.toFixed(4) },
        { label: "MAE", value: formatNumber(data.model.mae, { currency: data.summary.currency, symbol: data.summary.currency_symbol, digits: 2 }) },
        { label: "RMSE", value: formatNumber(data.model.rmse, { currency: data.summary.currency, symbol: data.summary.currency_symbol, digits: 2 }) },
        {
          label: "Direction",
          value: data.model.directional_accuracy === null ? "—" : `${data.model.directional_accuracy.toFixed(1)}%`,
        },
      ]
    : [];

  return (
    <section ref={ref} id="analytics" className="relative border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-[1280px] px-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[660px]">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              The charts are the demo.
            </h2>
            <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
              Switch companies and views. Each series, coefficient and score below is returned by the same FastAPI
              endpoints the workspace uses — three months to maximum history, no mock arrays.
            </p>
          </div>
          <Link
            href={`/dashboard?ticker=${encodeURIComponent(ticker)}`}
            className="group inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--muted)] transition-colors hover:text-ink"
          >
            Open {company.label} dashboard
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border transition-colors group-hover:border-accent/40 group-hover:text-accent">
              <ArrowUpRight size={12} />
            </span>
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {COMPANIES.map((item) => (
            <button
              key={item.ticker}
              type="button"
              onClick={() => setTicker(item.ticker)}
              aria-pressed={ticker === item.ticker}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors",
                ticker === item.ticker
                  ? "border-accent/40 bg-accent/10 text-ink"
                  : "border-border bg-white/[0.02] text-[var(--muted)] hover:border-border-strong hover:text-ink",
              )}
            >
              {item.label}
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--faint)]">{item.market}</span>
            </button>
          ))}
          {isValidating && data ? (
            <span className="ml-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--faint)]">
              <RefreshCw size={9} className="animate-spin" /> updating
            </span>
          ) : null}
        </div>

        <div className="chart-frame mt-3 overflow-hidden rounded-3xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.006))] shadow-[0_40px_100px_-60px_rgba(0,0,0,1)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              <span className="font-mono text-[11.5px] font-medium text-ink">{ticker}</span>
              <span className="text-[11px] text-[var(--muted)]">{data?.meta.name ?? company.label}</span>
              <span className="hidden rounded-full border border-border/80 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--faint)] sm:inline">
                {data?.meta.exchange ?? company.market}
              </span>
            </div>
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-[#070b12] p-0.5" role="group" aria-label="Chart view">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={view === item.value}
                  onClick={() => setView(item.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors",
                    view === item.value ? "bg-surface-3 text-ink" : "text-[var(--faint)] hover:text-[var(--muted)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
              <TriangleAlert size={20} className="text-warn" />
              <p className="text-[13px] font-medium text-ink">The analytics API is unreachable</p>
              <p className="max-w-md text-[11.5px] leading-relaxed text-muted">{error.message}</p>
              <button
                type="button"
                onClick={() => mutate()}
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[11.5px] text-ink hover:border-border-strong"
              >
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          ) : !data || isLoading ? (
            <div className="px-4 py-4 sm:px-5" aria-hidden="true">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
                ))}
              </div>
              <div className="mt-3 h-[330px] animate-pulse rounded-xl bg-white/[0.035]" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-px border-b border-border/70 bg-border/50 md:grid-cols-4">
                {metrics.map((metric, index) => (
                  <div
                    key={`${ticker}-${metric.label}`}
                    className="animate-fade-up bg-[#070b12]/80 px-4 py-3"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--faint)]">{metric.label}</p>
                    <p className="tnum mt-1 font-mono text-[14px] font-medium text-ink">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="px-2 pb-1 pt-2 sm:px-3">
                {chart ? (
                  <PlotlyChart
                    data={chart.traces}
                    layout={chart.layout}
                    height={330}
                    resetKey={`${ticker}-${view}`}
                    ariaLabel={chart.ariaLabel}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-2.5 text-[9.5px] text-[var(--faint)] sm:px-5">
                <p>
                  Holdout: {formatDate(data.model.sample.test_start)} → {formatDate(data.model.sample.test_end)} ·{" "}
                  {data.model.sample.test_size.toLocaleString()} unseen observations · trained {formatDate(data.model.trained_at)}
                </p>
                <p className="font-mono">
                  {data.model.beats_naive ? "Beats naive baseline on MAE" : "Naive baseline matches or beats model MAE"} ·{" "}
                  {data.meta.price_label}
                </p>
              </div>
            </>
          )}
        </div>

        <p className="mt-3 text-[10px] text-[var(--faint)]">
          Simple Linear Regression with one lagged feature. Metrics are out-of-sample; forecasts remain estimates.{" "}
          {data ? `Naive MAE ${formatNumber(data.model.naive_mae, { currency: data.summary.currency, symbol: data.summary.currency_symbol, digits: 2 })} vs model MAE ${formatNumber(data.model.mae, { currency: data.summary.currency, symbol: data.summary.currency_symbol, digits: 2 })}.` : ""}
        </p>
      </div>
    </section>
  );
}
