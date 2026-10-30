"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, Gauge, Sparkles } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid, MetaBadges, SourceStrip, useTickerApi } from "@/components/page-kit";
import { Sparkline } from "@/components/sparkline";
import { Badge, Button, EmptyState, Label } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { baseLayout, barTrace, gradientFill, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatNumber, formatPct, formatPrice, formatSigned, toneFor } from "@/lib/format";
import type { DashboardPayload } from "@/lib/analytics-types";

export default function DashboardPage() {
  const { data, error, isLoading, mutate } = useTickerApi<DashboardPayload>("/api/dashboard");
  const { isDark } = useTheme();
  const pal = palette(isDark);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Overview · 00"
        title="Market intelligence dashboard"
        description="A single view of price action, historical risk, model skill and the latest one-observation forecast — all computed from live Yahoo Finance history."
        actions={
          <>
            <Link href="/model-lab">
              <Button variant="secondary">
                <Sparkles size={12} /> Train a model
              </Button>
            </Link>
            <Link href="/forecast-studio">
              <Button variant="primary">
                <ArrowUpRight size={12} /> Forecast studio
              </Button>
            </Link>
          </>
        }
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary
        loading={isLoading}
        error={error}
        onRetry={() => mutate()}
        skeleton={<PanelSkeleton height={300} rows={3} />}
      >
        {data ? <DashboardContent payload={data} pal={pal} /> : null}
      </DataBoundary>
    </div>
  );
}

function DashboardContent({ payload, pal }: { payload: DashboardPayload; pal: ReturnType<typeof palette> }) {
  const { summary, series, model, forecast, meta } = payload;
  const symbol = summary.currency_symbol;
  const priceDates = series.price.map((p) => p.date);
  const priceLayout = baseLayout(pal, {
    height: 330,
    currencySymbol: symbol,
    yTitle: "Adjusted close",
    yKind: "currency",
    hovermode: "x unified",
  });
  const returnLayout = baseLayout(pal, {
    height: 230,
    yKind: "percent",
    yTitle: "Daily return",
    hovermode: "x unified",
  });
  const volumeLayout = baseLayout(pal, {
    height: 230,
    yKind: "compact",
    yTitle: "Shares",
    hovermode: "x unified",
    showLegend: false,
  });

  const watchlistRows = payload.watchlist_overview.rows;
  const normalized = payload.watchlist_overview.normalized;

  return (
    <div className="space-y-4">
      <SourceStrip meta={meta} extra={<Badge tone="neutral">Model trained {formatDate(model.trained_at, { short: true })}</Badge>} />

      <KpiGrid
        items={[
          {
            label: "Latest adjusted close",
            value: formatPrice(summary.latest_price, symbol),
            delta: summary.change_pct,
            deltaLabel: `${formatSigned(summary.change, symbol)} vs previous session`,
            hint: "The last available adjusted close from the selected window. Yahoo Finance data can be delayed.",
            emphasis: true,
            footer: `As of ${formatDate(summary.period_end)}`,
          },
          {
            label: "Daily price change",
            value: formatSigned(summary.change, symbol),
            tone: toneFor(summary.change),
            hint: "Absolute difference between the latest close and the prior close.",
            footer: `Previous close ${formatPrice(summary.previous_close, symbol)}`,
          },
          {
            label: "Daily change",
            value: formatPct(summary.change_pct),
            tone: toneFor(summary.change_pct),
            hint: "Percentage change of the latest close versus the previous close.",
            footer: "Not annualised",
          },
          {
            label: "52-week high",
            value: formatPrice(summary.high_52w, symbol),
            hint: "Highest adjusted close inside the trailing 365 days of retrieved data.",
            footer: formatDate(summary.high_52w_date),
          },
          {
            label: "52-week low",
            value: formatPrice(summary.low_52w, symbol),
            hint: "Lowest adjusted close inside the trailing 365 days of retrieved data.",
            footer: formatDate(summary.low_52w_date),
          },
          {
            label: "Historical records",
            value: formatNumber(summary.total_records, { bare: true, digits: 0 }),
            hint: "Cleaned daily observations available for analysis in the selected window.",
            footer: `${formatDate(summary.period_start)} → ${formatDate(summary.period_end)}`,
          },
          {
            label: "Test MAE",
            value: formatPrice(model.mae, symbol),
            hint: "Mean absolute error on the held-out chronological test segment, in price units.",
            footer: `Naive baseline ${formatPrice(model.naive_mae, symbol)}`,
            tone: model.beats_naive ? "positive" : "negative",
            deltaLabel: model.beats_naive ? "Beats naive baseline" : "Does not beat naive baseline",
          },
          {
            label: "Out-of-sample R²",
            value: model.r2 === null ? "—" : model.r2.toFixed(4),
            hint: "Share of test-period price variance explained by the regression. Negative values are valid.",
            footer: `Train R² ${series.r2_comparison.train_r2?.toFixed(4) ?? "—"} · ${series.r2_comparison.test_label}`,
            emphasis: (model.r2 ?? 0) > 0.9,
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Price action"
          title="Adjusted closing price"
          description="Line shows the adjusted close; thin overlays are the 20- and 50-day simple moving averages."
          actions={<Badge tone="accent">Adjusted</Badge>}
          footer={<ChartFootnote>Data via Yahoo Finance (yfinance) · {summary.exchange} · prices in {summary.currency}</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Historical adjusted closing price chart"
            height={330}
            data={[
              lineTrace({
                x: priceDates,
                y: series.price.map((p) => p.Close),
                name: "Adjusted close",
                color: pal.accent,
                width: 1.8,
                fill: "tozeroy",
                fillColor: gradientFill(pal),
                hovertemplate: "Close: %{y:,.2f}<extra></extra>",
              }),
              lineTrace({
                x: priceDates,
                y: series.price.map((p) => p.sma20),
                name: "SMA 20",
                color: pal.blue,
                width: 1.1,
                dash: "dot",
              }),
              lineTrace({
                x: priceDates,
                y: series.price.map((p) => p.sma50),
                name: "SMA 50",
                color: pal.amber,
                width: 1.1,
                dash: "dash",
              }),
            ]}
            layout={priceLayout}
            resetKey={`dashboard-price-${summary.ticker}`}
          />
        </ChartCard>

        <div className="space-y-3">
          <section className="panel relative overflow-hidden px-4 py-4">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
            <div className="flex items-start justify-between">
              <div>
                <Label>Next-observation forecast</Label>
                <p className="mt-1 text-[11px] text-faint">Operational model fitted on the full valid history</p>
              </div>
              <Badge tone={forecast.direction === "up" ? "accent" : "negative"}>
                {forecast.direction === "up" ? "▲ up" : "▼ down"}
              </Badge>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className="tnum font-mono text-[1.75rem] font-medium leading-none tracking-[-0.03em] text-ink">
                  {formatPrice(forecast.predicted_price, symbol)}
                </p>
                <p className="mt-1.5 text-[11px] text-muted">
                  {formatPct(forecast.percentage_change)} vs latest close {formatPrice(summary.latest_price, symbol)}
                </p>
              </div>
              <div className="text-right text-[10px] text-faint">
                <p className="flex items-center justify-end gap-1">
                  <CalendarClock size={10} /> {formatDate(forecast.date)}
                </p>
                <p className="mt-0.5">{forecast.date_verified ? "Exchange calendar verified" : "Unverified date"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface/50 px-2.5 py-2">
                <p className="micro-label">Empirical band</p>
                <p className="tnum mt-1 font-mono text-[11px] text-muted">
                  {formatPrice(forecast.error_band_low, symbol)} – {formatPrice(forecast.error_band_high, symbol)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface/50 px-2.5 py-2">
                <p className="micro-label">Operational equation</p>
                <p className="mt-1 font-mono text-[10.5px] leading-tight text-muted">
                  Y = {model.intercept.toFixed(2)} + {model.slope.toFixed(4)}·X
                </p>
              </div>
            </div>
            <p className="mt-2.5 text-[9.5px] leading-relaxed text-faint">
              {forecast.band_label} Forecasts are educational estimates, not guarantees or investment advice.
            </p>
            <Link
              href="/forecast-studio"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              Open forecast studio <ArrowUpRight size={11} />
            </Link>
          </section>

          <section className="panel px-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Model snapshot</Label>
              <Gauge size={13} className="text-faint" />
            </div>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              {[
                ["Equation", model.equation],
                ["Train / test", `${model.sample.train_size} / ${model.sample.test_size} obs`],
                ["Test RMSE", formatPrice(model.rmse, symbol)],
                ["MAPE", model.mape === null ? "—" : `${model.mape.toFixed(2)}%`],
                ["Directional accuracy", model.directional_accuracy === null ? "—" : `${model.directional_accuracy.toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-faint">{label}</dt>
                  <dd className="tnum text-right font-mono text-muted">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 border-t border-border/60 pt-2 text-[9.5px] leading-relaxed text-faint">
              {model.beats_naive
                ? "Regression MAE is slightly lower than the naive persistence baseline on these test observations."
                : "Regression does not beat the naive persistence baseline on these test observations. Treat point forecasts cautiously."}
            </p>
          </section>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Holdout evaluation"
          title="Actual versus predicted adjusted close"
          description="Only the final chronological segment is shown; the model was fitted on earlier observations only."
          footer={<ChartFootnote>{model.model_label} · split {Math.round((model.sample.train_size / model.sample.total_rows) * 100)}% train / {Math.round((model.sample.test_size / model.sample.total_rows) * 100)}% test</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Actual versus predicted price chart"
            height={280}
            data={[
              lineTrace({
                x: series.actual_vs_predicted.map((p) => p.date),
                y: series.actual_vs_predicted.map((p) => p.actual),
                name: "Actual",
                color: pal.ink,
                width: 1.6,
              }),
              lineTrace({
                x: series.actual_vs_predicted.map((p) => p.date),
                y: series.actual_vs_predicted.map((p) => p.predicted),
                name: "Predicted",
                color: pal.accent,
                width: 1.4,
                dash: "dot",
              }),
            ]}
            layout={baseLayout(pal, { height: 280, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
            resetKey={`dashboard-avp-${summary.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Benchmark"
          title="Model versus naive baseline"
          description="Same test observations. The naive benchmark predicts that the next close equals the previous close."
          footer={<ChartFootnote>MAPE is shown in percent; MAE and RMSE are in {summary.currency}.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Model versus naive baseline metrics"
            height={280}
            data={[
              barTrace({
                x: series.model_performance.map((p) => p.metric),
                y: series.model_performance.map((p) => p.model),
                name: "Linear regression",
                color: pal.accent,
                hovertemplate: "%{x}: %{y:,.2f}<extra>Regression</extra>",
              }),
              barTrace({
                x: series.model_performance.map((p) => p.metric),
                y: series.model_performance.map((p) => p.naive),
                name: "Naive baseline",
                color: pal.gray,
                hovertemplate: "%{x}: %{y:,.2f}<extra>Naive</extra>",
              }),
            ]}
            layout={baseLayout(pal, {
              height: 280,
              xKind: "category",
              yKind: "number",
              barmode: "group",
              hovermode: "closest",
              showLegend: true,
            })}
            resetKey={`dashboard-bench-${summary.ticker}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Liquidity"
          title="Trading volume"
          description="Daily shares traded. Spikes often accompany news, earnings and index events."
          footer={<ChartFootnote>Average volume {formatNumber(summary.average_volume, { bare: true, compact: true })} shares</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Trading volume chart"
            height={230}
            data={[
              barTrace({
                x: series.volume.map((p) => p.date),
                y: series.volume.map((p) => p.volume),
                name: "Volume",
                color: pal.blue,
                opacity: 0.55,
                hovertemplate: "Volume: %{y:,.0f}<extra></extra>",
              }),
            ]}
            layout={volumeLayout}
            resetKey={`dashboard-volume-${summary.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Dispersion"
          title="Daily percentage returns"
          description="Observation-level returns computed from adjusted closes; green bars are positive sessions, red bars negative."
          footer={<ChartFootnote>{summary.total_records - 1} return observations · not a forecast</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Daily percentage return chart"
            height={230}
            data={[
              {
                type: "bar",
                x: series.returns.map((p) => p.date),
                y: series.returns.map((p) => p.return_pct),
                name: "Daily return",
                marker: { color: series.returns.map((p) => (p.return_pct >= 0 ? pal.accent : pal.red)) },
                hovertemplate: "%{y:.2f}%<extra></extra>",
              },
            ]}
            layout={returnLayout}
            resetKey={`dashboard-returns-${summary.ticker}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Relative performance"
          title="Watchlist normalized performance"
          description="Each saved stock is rebased to 100 over the last 60 shared observations. Absolute price levels are never compared directly."
          actions={
            <Link href="/watchlist">
              <Button variant="ghost">Manage</Button>
            </Link>
          }
        >
          {watchlistRows.length === 0 || normalized.length === 0 ? (
            <EmptyState
              compact
              title="Watchlist is empty"
              description="Add tickers in the Watchlist module to see relative performance here."
              action={
                <Link href="/watchlist">
                  <Button variant="primary">Add a ticker</Button>
                </Link>
              }
            />
          ) : (
            <PlotlyChart
              ariaLabel="Watchlist normalized performance chart"
              height={240}
              data={watchlistRows.map((row, i) =>
                lineTrace({
                  x: normalized.map((point) => String(point.date)),
                  y: normalized.map((point) => (point[row.ticker] as number | null) ?? null),
                  name: row.ticker,
                  color: [pal.accent, pal.blue, pal.amber, pal.violet, pal.red][i % 5],
                  width: 1.5,
                  hovertemplate: `${row.ticker}: %{y:.2f}<extra></extra>`,
                }),
              )}
              layout={baseLayout(pal, { height: 240, yKind: "number", hovermode: "x unified" })}
              resetKey="dashboard-watchlist"
            />
          )}
        </ChartCard>

        <ChartCard
          eyebrow="Watchlist"
          title="Saved stocks at a glance"
          description="Latest quotes and short-term momentum for saved tickers."
        >
          {watchlistRows.length === 0 ? (
            <EmptyState compact title="No stocks saved yet" description="Open the Watchlist module to add your first ticker." />
          ) : (
            <ul className="divide-y divide-border/70">
              {watchlistRows.map((row) => (
                <li key={row.ticker} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-medium text-ink">{row.ticker}</p>
                    <p className="truncate text-[10px] text-faint">{row.name}</p>
                  </div>
                  <Sparkline values={row.sparkline} positive={row.change_pct >= 0} width={72} height={24} />
                  <div className="w-[86px] text-right">
                    <p className="tnum font-mono text-[11px] text-ink">{formatPrice(row.latest_price, row.currency_symbol)}</p>
                    <p className={`tnum text-[10px] ${row.change_pct >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatPct(row.change_pct)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard eyebrow="Risk" title="Recent volatility context" description="Annualised volatility and the 52-week positioning for the selected window.">
          <div className="grid grid-cols-2 gap-2.5">
            <MiniPanel label="Annualised volatility" value={summary.annualized_volatility_pct === null ? "—" : `${summary.annualized_volatility_pct}%`} hint="Daily return standard deviation × √252" />
            <MiniPanel
              label="Position in 52w range"
              value={`${(((summary.latest_price - summary.low_52w) / Math.max(summary.high_52w - summary.low_52w, 0.0001)) * 100).toFixed(1)}%`}
              hint="0% at the 52-week low, 100% at the high"
            />
            <MiniPanel label="Latest volume" value={formatNumber(summary.latest_volume, { bare: true, compact: true })} hint="Most recent trading session" />
            <MiniPanel label="Window average close" value={formatPrice((summary.high_52w + summary.low_52w) / 2, symbol)} hint="Midpoint of the 52-week range" />
          </div>
        </ChartCard>

        <InsightPanel
          insights={payload.insights}
          title="Computed dashboard summary"
          disclaimer={payload.disclaimer}
          columns={1}
        />
      </div>
    </div>
  );
}

function MiniPanel({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
      <p className="micro-label">{label}</p>
      <p className="tnum mt-1 font-mono text-[15px] text-ink">{value}</p>
      <p className="mt-0.5 text-[9.5px] leading-snug text-faint">{hint}</p>
    </div>
  );
}

