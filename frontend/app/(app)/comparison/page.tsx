"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid } from "@/components/page-kit";
import { DataTable, type Column } from "@/components/data-table";
import { Badge, Button, EmptyState, Input, Label, Select } from "@/components/ui/primitives";
import { useTheme, useTicker } from "@/components/providers";
import { apiGet, qs } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { baseLayout, lineTrace, palette, scatterTrace, seriesColor } from "@/lib/chart-theme";
import { formatDate, formatNumber, formatPct, formatPrice } from "@/lib/format";
import type { ComparisonPayload } from "@/lib/analytics-types";

type MetricRow = { ticker: string } & Record<string, unknown>;

export default function ComparisonPage() {
  const { ticker, period, refreshToken } = useTicker();
  const [tickers, setTickers] = useState<string[]>(() => [ticker]);
  const [draft, setDraft] = useState("");
  const [benchmark, setBenchmark] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const { isDark } = useTheme();
  const pal = palette(isDark);

  useEffect(() => {
    setTickers((current) => (current.length === 0 ? [ticker] : current));
  }, [ticker]);

  useEffect(() => {
    setBenchmark((current) => (tickers.includes(current) ? current : tickers[0] ?? ""));
  }, [tickers]);

  const key =
    tickers.length >= 2
      ? `/api/analytics/comparison${qs({
          tickers: tickers.join(","),
          period,
          benchmark: benchmark || tickers[0],
          _r: refreshToken,
        })}`
      : null;
  const { data, error, isLoading, mutate } = useApi<ComparisonPayload>(key);

  const addTicker = () => {
    const symbol = draft.trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z0-9.^=_-]{1,24}$/.test(symbol)) {
      setFormError("Use a valid Yahoo Finance symbol (letters, digits, ., ^, =, -, _).");
      return;
    }
    if (tickers.includes(symbol)) {
      setFormError(`${symbol} is already in the comparison.`);
      return;
    }
    if (tickers.length >= 5) {
      setFormError("Compare at most five tickers at once.");
      return;
    }
    setFormError(null);
    setDraft("");
    setTickers((current) => [...current, symbol]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Comparison"
        title="Comparative stock analysis"
        description="Compare 2–5 stocks over a shared period using normalized performance, return correlations and risk/return metrics. Absolute price levels are never treated as relative performance."
        meta={
          data ? (
            <>
              {data.tickers.map((item) => (
                <Badge key={item} tone="neutral" className="font-mono">
                  {item}
                </Badge>
              ))}
              <Badge tone="accent">{data.common_observations.toLocaleString()} shared observations</Badge>
            </>
          ) : null
        }
      />

      <section className="panel-flat space-y-3 px-3.5 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label className="mb-1.5 block">Add a stock</Label>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTicker();
                  }
                }}
                placeholder="e.g. INFY.NS, MSFT, ^NSEI"
                className="h-8 font-mono uppercase"
                aria-label="Ticker to add"
              />
              <Button variant="primary" onClick={addTicker} disabled={tickers.length >= 5}>
                <Plus size={12} /> Add
              </Button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <Label className="block">Benchmark</Label>
            <Select value={benchmark} onChange={(event) => setBenchmark(event.target.value)} className="w-[170px] font-mono">
              {tickers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-[10px] text-faint">Period follows the top-bar selector · shared trading dates only</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tickers.map((item, index) => (
            <span key={item} className="chip font-mono">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: seriesColor(index, pal) }} />
              {item}
              {tickers.length > 2 ? (
                <button
                  type="button"
                  onClick={() => setTickers((current) => current.filter((value) => value !== item))}
                  className="ml-1 text-faint hover:text-negative"
                  aria-label={`Remove ${item}`}
                >
                  <X size={10} />
                </button>
              ) : null}
            </span>
          ))}
          {tickers.length < 2 ? <Badge tone="warn">Add at least one more ticker</Badge> : null}
        </div>
        {formError ? <p className="text-[10.5px] text-negative">{formError}</p> : null}
      </section>

      {tickers.length < 2 ? (
        <EmptyState
          title="Select at least two tickers"
          description="Comparisons need two or more symbols sharing the same historical period. Add a stock above or use the top-bar search."
        />
      ) : (
        <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={340} rows={3} />}>
          {data ? <ComparisonContent payload={data} pal={pal} /> : null}
        </DataBoundary>
      )}
    </div>
  );
}

function ComparisonContent({ payload, pal }: { payload: ComparisonPayload; pal: ReturnType<typeof palette> }) {
  const { tickers, metrics, series, metas, best, worst, benchmark } = payload;
  const normalizedDates = series.normalized.map((point) => String(point.date));
  const rollingKeys = Object.keys(series.rolling_correlation);

  const tableRows = useMemo<MetricRow[]>(
    () =>
      tickers.map((ticker) => ({
        ticker,
        name: metas[ticker]?.name ?? ticker,
        exchange: metas[ticker]?.exchange ?? "—",
        ...metrics[ticker],
      })),
    [tickers, metas, metrics],
  );

  const columns: Column<MetricRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      render: (row) => (
        <div>
          <p className="font-mono text-[11px] text-ink">{String(row.ticker)}</p>
          <p className="max-w-[220px] truncate text-[9.5px] text-faint">{String(row.name)}</p>
        </div>
      ),
    },
    { key: "exchange", header: "Exchange", render: (row) => <span className="text-[10.5px] text-muted">{String(row.exchange)}</span> },
    { key: "start_price", header: "Start", align: "right", render: (row) => formatPrice(row.start_price as number, String(row.currency_symbol)) },
    { key: "end_price", header: "End", align: "right", render: (row) => formatPrice(row.end_price as number, String(row.currency_symbol)) },
    {
      key: "total_return_pct",
      header: "Total return",
      align: "right",
      render: (row) => {
        const value = row.total_return_pct as number;
        return <span className={value >= 0 ? "text-positive" : "text-negative"}>{formatPct(value)}</span>;
      },
    },
    {
      key: "average_daily_return_pct",
      header: "Avg daily",
      align: "right",
      render: (row) => <span className="text-muted">{(row.average_daily_return_pct as number).toFixed(4)}%</span>,
    },
    {
      key: "annualized_volatility_pct",
      header: "Ann. vol",
      align: "right",
      render: (row) => <span className="text-muted">{(row.annualized_volatility_pct as number).toFixed(2)}%</span>,
    },
    { key: "currency", header: "CCY", align: "right", render: (row) => <span className="text-[10px] text-faint">{String(row.currency)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-faint">
        <span>
          {formatDate(payload.date_range.start)} → {formatDate(payload.date_range.end)}
        </span>
        <span className="text-border-strong">|</span>
        <span>{payload.common_observations.toLocaleString()} aligned trading observations</span>
        <span className="text-border-strong">|</span>
        <span>Normalized to 100 · daily returns · Yahoo Finance via yfinance</span>
        <Badge tone={payload.average_pairwise_correlation > 0.7 ? "warn" : "neutral"}>
          Avg pairwise corr {payload.average_pairwise_correlation.toFixed(3)}
        </Badge>
      </div>

      <KpiGrid
        columns={5}
        items={[
          { label: "Best performer", value: best, hint: "Highest total return over the common period.", tone: "positive", footer: formatPct(metrics[best]?.total_return_pct), emphasis: true },
          { label: "Weakest performer", value: worst, hint: "Lowest total return over the common period.", tone: "negative", footer: formatPct(metrics[worst]?.total_return_pct) },
          {
            label: "Average pairwise correlation",
            value: payload.average_pairwise_correlation.toFixed(3),
            hint: "Mean Pearson correlation of daily returns across all pairs. High values imply less diversification.",
            footer: "Daily return correlation",
          },
          {
            label: "Most volatile",
            value:
              [...tickers].sort((a, b) => metrics[b].annualized_volatility_pct - metrics[a].annualized_volatility_pct)[0] ?? "—",
            hint: "Highest annualised volatility of daily returns in the common period.",
            footer: `${Math.max(...tickers.map((item) => metrics[item].annualized_volatility_pct)).toFixed(2)}% ann. vol`,
          },
          {
            label: "Benchmark",
            value: benchmark,
            hint: "Reference ticker selected for correlation commentary. No market index is fetched implicitly.",
            footer: `${payload.common_observations} aligned observations`,
          },
        ]}
      />

      <ChartCard
        eyebrow="Normalized performance"
        title="Relative performance (start = 100)"
        description="Every series is rebased to 100 on the first shared trading date, so currencies and absolute price levels do not distort the comparison."
        footer={<ChartFootnote>Only dates where every selected ticker has an observation are included.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Normalized performance comparison"
          height={340}
          data={tickers.map((ticker, index) =>
            lineTrace({
              x: normalizedDates,
              y: series.normalized.map((point) => (point[ticker] as number | null) ?? null),
              name: ticker,
              color: seriesColor(index, pal),
              width: 1.6,
              hovertemplate: `${ticker}: %{y:.2f}<extra></extra>`,
            }),
          )}
          layout={baseLayout(pal, { height: 340, yKind: "number", hovermode: "x unified" })}
          resetKey={`compare-normalized-${tickers.join("-")}`}
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Return correlation"
          title="Correlation heatmap"
          description="Pearson correlation of daily returns. +1 moves together, 0 unrelated, −1 opposite."
          footer={<ChartFootnote>Average pairwise correlation {payload.average_pairwise_correlation.toFixed(3)}.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Correlation heatmap"
            height={300}
            data={[
              {
                type: "heatmap",
                x: series.correlation.x,
                y: series.correlation.y,
                z: series.correlation.z,
                zmin: -1,
                zmax: 1,
                colorscale: [
                  [0, pal.red],
                  [0.5, pal.isDark ? "#121c29" : "#f3f6fa"],
                  [1, pal.accent],
                ],
                text: series.correlation.z.map((row) => row.map((value) => value.toFixed(2))),
                texttemplate: "%{text}",
                textfont: { size: 10.5, color: pal.ink },
                hovertemplate: "%{x} vs %{y}: %{z:.3f}<extra></extra>",
                colorbar: { thickness: 8, tickfont: { size: 9, color: pal.faint }, outlinewidth: 0 },
              },
            ]}
            layout={{
              ...baseLayout(pal, { height: 300, xKind: "category", yKind: "number", showLegend: false, hovermode: "closest" }),
              yaxis: { ...baseLayout(pal, { height: 300, xKind: "category" }).xaxis, type: "category", autorange: "reversed" },
              margin: { l: 70, r: 20, t: 10, b: 50 },
            }}
            resetKey={`compare-heat-${tickers.join("-")}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Risk / return"
          title="Volatility versus total return"
          description="Each point is a stock over the common period. Upper-left is more return per unit of risk."
        >
          <PlotlyChart
            ariaLabel="Volatility versus return scatter"
            height={300}
            data={[
              scatterTrace({
                x: tickers.map((ticker) => metrics[ticker].annualized_volatility_pct),
                y: tickers.map((ticker) => metrics[ticker].total_return_pct),
                name: "Stocks",
                color: pal.violet,
                size: 13,
                opacity: 0.85,
                text: tickers,
                hovertemplate: "%{text}<br>Vol %{x:.2f}%<br>Return %{y:.2f}%<extra></extra>",
                mode: "markers+text",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 300, xKind: "number", yKind: "percent", showLegend: false, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 300, xKind: "number" }).xaxis,
                ticksuffix: "%",
                title: { text: "Annualised volatility", font: { size: 10.5, color: pal.faint } },
              },
              yaxis: {
                ...baseLayout(pal, { height: 300, yKind: "percent" }).yaxis,
                ticksuffix: "%",
                title: { text: "Total return", font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`compare-risk-${tickers.join("-")}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Co-movement"
          title="Rolling 63-observation correlation"
          description="Correlation changes over time; a single full-period number hides regime shifts."
          footer={<ChartFootnote>63 observations ≈ one trading quarter of daily data.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Rolling correlation chart"
            height={280}
            data={rollingKeys.map((pair, index) =>
              lineTrace({
                x: series.rolling_correlation[pair].map((point) => point.date),
                y: series.rolling_correlation[pair].map((point) => point.correlation),
                name: pair.replace("|", " ↔ "),
                color: seriesColor(index, pal),
                width: 1.4,
                hovertemplate: `${pair.replace("|", " vs ")}: %{y:.3f}<extra></extra>`,
              }),
            )}
            layout={{
              ...baseLayout(pal, { height: 280, yKind: "number", hovermode: "x unified" }),
              yaxis: {
                ...baseLayout(pal, { height: 280, yKind: "number" }).yaxis,
                range: [-1, 1],
                zeroline: true,
                zerolinecolor: pal.axis,
              },
            }}
            resetKey={`compare-rolling-${tickers.join("-")}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Daily moves"
          title="Daily return comparison"
          description="Observation-level percentage returns for every selected ticker on common dates."
          footer={<ChartFootnote>Noisy by design: this shows co-movement, not cumulative performance.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Daily return comparison chart"
            height={280}
            data={tickers.map((ticker, index) =>
              lineTrace({
                x: series.returns.map((point) => String(point.date)),
                y: series.returns.map((point) => (point[ticker] as number | null) ?? null),
                name: ticker,
                color: seriesColor(index, pal),
                width: 0.9,
                opacity: 0.75,
                hovertemplate: `${ticker}: %{y:.2f}%<extra></extra>`,
              }),
            )}
            layout={baseLayout(pal, { height: 280, yKind: "percent", hovermode: "x unified" })}
            resetKey={`compare-returns-${tickers.join("-")}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Totals"
        title="Comparative performance"
        description="Total return over the common window, in each stock's own currency."
        footer={<ChartFootnote>Currency differences are handled by normalisation and percentage returns.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Comparative total return bar chart"
          height={260}
          data={[
            {
              type: "bar",
              x: tickers,
              y: tickers.map((ticker) => metrics[ticker].total_return_pct),
              name: "Total return",
              marker: { color: tickers.map((ticker) => (metrics[ticker].total_return_pct >= 0 ? pal.accent : pal.red)) },
              hovertemplate: "%{x}: %{y:.2f}%<extra></extra>",
            },
          ]}
          layout={baseLayout(pal, { height: 260, xKind: "category", yKind: "percent", showLegend: false, hovermode: "closest" })}
          resetKey={`compare-total-${tickers.join("-")}`}
        />
      </ChartCard>

      <ChartCard eyebrow="Metrics" title="Comparison table" description="Common-period metrics for each selected stock." bodyClassName="px-3 pb-3">
        <DataTable
          columns={columns}
          rows={tableRows}
          getRowKey={(row) => String(row.ticker)}
          dense
          footer={`${formatNumber(payload.common_observations, { bare: true })} aligned trading observations · benchmark ${benchmark}`}
        />
      </ChartCard>

      <InsightPanel
        insights={payload.insights}
        title="Comparative findings"
        disclaimer="Correlation and relative performance describe the selected historical window only. Different currencies, trading calendars and liquidity can affect comparability."
        columns={2}
      />
    </div>
  );
}
