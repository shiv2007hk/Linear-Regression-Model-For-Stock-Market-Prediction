"use client";

import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid, MetaBadges, SourceStrip, useTickerApi } from "@/components/page-kit";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { METRIC_HELP } from "@/lib/metrics";
import { baseLayout, barTrace, gradientFill, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatPct } from "@/lib/format";
import type { ReturnsPayload } from "@/lib/analytics-types";

export default function ReturnsVolatilityPage() {
  const { data, error, isLoading, mutate } = useTickerApi<ReturnsPayload>("/api/analytics/returns");
  const { isDark } = useTheme();
  const pal = palette(isDark);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Returns & Volatility"
        title="Returns and volatility analysis"
        description="Historical return behaviour, drawdowns and risk characteristics computed from adjusted closes. Past volatility does not bound future outcomes."
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={300} rows={3} />}>
        {data && !data.available ? (
          <EmptyState
            title="Not enough history for return analysis"
            description={data.message ?? "Choose a longer historical window to compute returns and volatility."}
          />
        ) : null}
        {data && data.available ? <ReturnsContent payload={data} pal={pal} /> : null}
      </DataBoundary>
    </div>
  );
}

function ReturnsContent({ payload, pal }: { payload: ReturnsPayload; pal: ReturnType<typeof palette> }) {
  const { meta, metrics, series } = payload;
  if (!metrics || !series) return null;
  const symbol = meta.currency_symbol;

  return (
    <div className="space-y-4">
      <SourceStrip meta={meta} extra={<Badge tone="neutral">{metrics.observations.toLocaleString()} daily returns</Badge>} />

      <KpiGrid
        columns={4}
        items={[
          {
            label: "Cumulative return",
            value: formatPct(metrics.cumulative_return_pct),
            tone: metrics.cumulative_return_pct >= 0 ? "positive" : "negative",
            hint: "Total price return from the first to the last close in the window.",
            footer: `${formatDate(meta.start)} → ${formatDate(meta.end)}`,
            emphasis: true,
          },
          {
            label: "Average daily return",
            value: `${metrics.average_daily_return_pct.toFixed(4)}%`,
            tone: metrics.average_daily_return_pct >= 0 ? "positive" : "negative",
            hint: "Arithmetic mean of daily percentage returns.",
            footer: `Daily standard deviation ${metrics.daily_std_pct.toFixed(3)}%`,
          },
          {
            label: "Annualised volatility",
            value: `${metrics.annualized_volatility_pct.toFixed(2)}%`,
            hint: METRIC_HELP.volatility,
            footer: "Daily σ × √252",
          },
          {
            label: "Maximum drawdown",
            value: formatPct(metrics.max_drawdown_pct),
            tone: "negative",
            hint: METRIC_HELP.drawdown,
            footer: `Trough ${formatDate(metrics.max_drawdown_date)}`,
          },
          {
            label: "Positive observations",
            value: `${metrics.positive_share_pct.toFixed(1)}%`,
            hint: "Share of daily returns above zero.",
            footer: `${(100 - metrics.positive_share_pct).toFixed(1)}% negative or flat`,
          },
          {
            label: "Best observation",
            value: formatPct(metrics.best_day.return_pct),
            tone: "positive",
            hint: "Largest single-observation gain in the window.",
            footer: formatDate(metrics.best_day.date),
          },
          {
            label: "Worst observation",
            value: formatPct(metrics.worst_day.return_pct),
            tone: "negative",
            hint: "Largest single-observation loss in the window.",
            footer: formatDate(metrics.worst_day.date),
          },
          {
            label: "Average gain / loss",
            value: `${metrics.average_gain_pct.toFixed(2)}% / ${metrics.average_loss_pct.toFixed(2)}%`,
            hint: "Mean positive return versus mean negative return; asymmetry matters for compounding.",
            footer: "Descriptive, not a forecast",
          },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Distribution"
          title="Daily returns histogram"
          description="Frequency of daily percentage returns across the selected window."
          footer={<ChartFootnote>Bins are ~equal-width; extreme bins contain the tails of the distribution.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Daily returns histogram"
            height={270}
            data={[
              barTrace({
                x: series.histogram.map((bin) => bin.center),
                y: series.histogram.map((bin) => bin.count),
                name: "Observations",
                color: pal.blue,
                opacity: 0.8,
                hovertemplate: "Near %{x:.2f}%: %{y} observations<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 270, xKind: "number", yKind: "number", showLegend: false, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 270, yKind: "number" }).xaxis,
                ticksuffix: "%",
                title: { text: "Daily return", font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`returns-hist-${meta.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Risk"
          title="Rolling annualised volatility"
          description="21-observation rolling standard deviation of returns, annualised with √252."
          footer={<ChartFootnote>Rolling volatility reflects recent conditions; spikes often precede or accompany drawdowns.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Rolling volatility chart"
            height={270}
            data={[
              lineTrace({
                x: series.rolling_volatility.map((point) => point.date),
                y: series.rolling_volatility.map((point) => point.rolling_volatility_pct),
                name: "Rolling volatility",
                color: pal.amber,
                width: 1.6,
                fill: "tozeroy",
                fillColor: "rgba(242,180,92,0.08)",
                hovertemplate: "%{y:.2f}%<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 270, yKind: "percent", showLegend: false })}
            resetKey={`returns-rollvol-${meta.ticker}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Compounding"
          title="Cumulative historical returns"
          description="Growth of 100 invested at the start of the window, reinvesting daily returns."
          footer={<ChartFootnote>Final cumulative return {formatPct(metrics.cumulative_return_pct)} · excludes dividends unless reflected in adjusted prices.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Cumulative return chart"
            height={260}
            data={[
              lineTrace({
                x: series.cumulative.map((point) => point.date),
                y: series.cumulative.map((point) => 100 + point.cumulative_return_pct),
                name: "Index (start = 100)",
                color: pal.accent,
                width: 1.7,
                fill: "tozeroy",
                fillColor: gradientFill(pal),
                hovertemplate: "Index: %{y:.2f}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 260, yKind: "number", showLegend: false })}
            resetKey={`returns-cum-${meta.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Drawdown"
          title="Drawdown from prior peak"
          description="Percentage decline from the running maximum close at each observation."
          footer={<ChartFootnote>Maximum drawdown {formatPct(metrics.max_drawdown_pct)} on {formatDate(metrics.max_drawdown_date)}.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Drawdown chart"
            height={260}
            data={[
              lineTrace({
                x: series.drawdown.map((point) => point.date),
                y: series.drawdown.map((point) => point.drawdown_pct),
                name: "Drawdown",
                color: pal.red,
                width: 1.6,
                fill: "tozeroy",
                fillColor: "rgba(255,107,125,0.10)",
                hovertemplate: "%{y:.2f}%<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 260, yKind: "percent", showLegend: false })}
            resetKey={`returns-dd-${meta.ticker}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Asymmetry"
        title="Daily gains versus losses distribution"
        description="Positive and negative returns plotted as separate distributions on the same percentage axis."
        footer={<ChartFootnote>Average gain {metrics.average_gain_pct.toFixed(2)}% · average loss {metrics.average_loss_pct.toFixed(2)}%.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Gains versus losses distribution"
          height={260}
          data={[
            barTrace({
              x: series.gains.map((bin) => bin.center),
              y: series.gains.map((bin) => bin.count),
              name: "Gains",
              color: pal.accent,
              opacity: 0.75,
              hovertemplate: "Gain near %{x:.2f}%: %{y}<extra></extra>",
            }),
            barTrace({
              x: series.losses.map((bin) => bin.center),
              y: series.losses.map((bin) => bin.count),
              name: "Losses",
              color: pal.red,
              opacity: 0.75,
              hovertemplate: "Loss near %{x:.2f}%: %{y}<extra></extra>",
            }),
          ]}
          layout={{
            ...baseLayout(pal, { height: 260, xKind: "number", yKind: "number", barmode: "overlay", hovermode: "closest" }),
            xaxis: {
              ...baseLayout(pal, { height: 260, yKind: "number" }).xaxis,
              ticksuffix: "%",
              title: { text: "Daily return", font: { size: 10.5, color: pal.faint } },
            },
          }}
          resetKey={`returns-gainloss-${meta.ticker}`}
        />
      </ChartCard>

      <InsightPanel
        insights={payload.insights}
        title="Return and risk findings"
        disclaimer="Historical volatility and returns are backward-looking. They do not guarantee, bound or predict future performance."
        columns={2}
      />
      <p className="px-1 text-[10px] leading-relaxed text-faint">
        Currency: {symbol} {meta.currency}. Return calculations use the {meta.price_label.toLowerCase()}; splits and dividends may already be reflected through adjustment.
      </p>
    </div>
  );
}
