"use client";

import { Activity, MoveDownRight, MoveRight, MoveUpRight } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid, MetaBadges, SourceStrip, useTickerApi } from "@/components/page-kit";
import { Badge, Label } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { baseLayout, gradientFill, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatPct, formatPrice } from "@/lib/format";
import type { TrendPayload } from "@/lib/analytics-types";

const TREND_TONE: Record<string, { tone: "accent" | "negative" | "neutral"; label: string }> = {
  uptrend: { tone: "accent", label: "Uptrend" },
  downtrend: { tone: "negative", label: "Downtrend" },
  sideways: { tone: "neutral", label: "Sideways" },
  "insufficient history": { tone: "neutral", label: "Insufficient history" },
};

export default function TrendAnalysisPage() {
  const { data, error, isLoading, mutate } = useTickerApi<TrendPayload>("/api/analytics/trend");
  const { isDark } = useTheme();
  const pal = palette(isDark);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Trend Analysis"
        title="Price and trend analysis"
        description="Moving averages, rolling extremes and trend comparisons that describe price behaviour. These overlays are deliberately excluded from the regression model."
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={340} rows={2} />}>
        {data ? <TrendContent payload={data} pal={pal} /> : null}
      </DataBoundary>
    </div>
  );
}

function TrendContent({ payload, pal }: { payload: TrendPayload; pal: ReturnType<typeof palette> }) {
  const { meta, metrics, trends, series } = payload;
  const symbol = meta.currency_symbol;
  const dates = series.map((point) => point.date);
  const sma20Rel = series.map((point) => (point.sma20 ? ((point.Close - point.sma20) / point.sma20) * 100 : null));
  const sma50Rel = series.map((point) => (point.sma50 ? ((point.Close - point.sma50) / point.sma50) * 100 : null));
  const sma200Rel = series.map((point) => (point.sma200 ? ((point.Close - point.sma200) / point.sma200) * 100 : null));
  const hasSma200 = metrics.sma200 !== null;

  return (
    <div className="space-y-4">
      <SourceStrip meta={meta} extra={<Badge tone="neutral">Descriptive indicators only</Badge>} />

      <KpiGrid
        columns={6}
        items={[
          { label: "Latest close", value: formatPrice(metrics.latest, symbol), hint: "Most recent adjusted close in the selected window.", emphasis: true, footer: formatDate(meta.end) },
          { label: "Average close", value: formatPrice(metrics.average_close, symbol), hint: "Arithmetic mean of all cleaned closes in the window." },
          { label: "Highest close", value: formatPrice(metrics.highest, symbol), footer: formatDate(metrics.highest_date) },
          { label: "Lowest close", value: formatPrice(metrics.lowest, symbol), footer: formatDate(metrics.lowest_date) },
          { label: "Distance from high", value: formatPct(metrics.distance_from_high_pct), tone: "negative", hint: "How far the latest close sits below the highest close in the window." },
          { label: "Above low", value: formatPct(metrics.distance_from_low_pct), tone: "positive", hint: "How far the latest close sits above the lowest close in the window." },
        ]}
      />

      <div className="grid gap-2.5 sm:grid-cols-3">
        <TrendCard label="Short-term" horizon="vs 20-day average" trend={trends.short_term} detail={metrics.close_vs_sma20_pct} />
        <TrendCard label="Medium-term" horizon="vs 50-day average" trend={trends.medium_term} detail={metrics.close_vs_sma50_pct} />
        <TrendCard label="Long-term" horizon="vs 200-day average" trend={trends.long_term} detail={metrics.close_vs_sma200_pct} />
      </div>

      <ChartCard
        eyebrow="Price structure"
        title="Adjusted close with 20 / 50 / 200-day averages"
        description="The 200-day average only appears once enough observations exist in the selected window (252+ trading days is ideal)."
        actions={
          <Badge tone={metrics.golden_cross === null ? "neutral" : metrics.golden_cross ? "accent" : "warn"}>
            {metrics.golden_cross === null ? "50/200 cross n/a" : metrics.golden_cross ? "50-day above 200-day" : "50-day below 200-day"}
          </Badge>
        }
        footer={<ChartFootnote>Moving averages are backward-looking and lag turning points. They are not model inputs.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Adjusted close with moving averages"
          height={360}
          data={[
            lineTrace({ x: dates, y: series.map((point) => point.Close), name: "Adjusted close", color: pal.ink, width: 1.7 }),
            lineTrace({ x: dates, y: series.map((point) => point.sma20), name: "SMA 20", color: pal.accent, width: 1.3 }),
            lineTrace({ x: dates, y: series.map((point) => point.sma50), name: "SMA 50", color: pal.blue, width: 1.2, dash: "dash" }),
            lineTrace({ x: dates, y: series.map((point) => point.sma200), name: "SMA 200", color: pal.amber, width: 1.2, dash: "dot", visible: hasSma200 ? true : "legendonly" }),
          ]}
          layout={baseLayout(pal, { height: 360, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
          resetKey={`trend-main-${meta.ticker}`}
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Averages only"
          title="Moving-average comparison"
          description="Compare the smoothing windows without the raw price line."
          footer={<ChartFootnote>SMA values {metrics.sma20 === null ? "insufficient" : "available"} for 20/50{hasSma200 ? "/200" : ""} days.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Moving average comparison chart"
            height={250}
            data={[
              lineTrace({ x: dates, y: series.map((point) => point.sma20), name: "SMA 20", color: pal.accent, width: 1.5 }),
              lineTrace({ x: dates, y: series.map((point) => point.sma50), name: "SMA 50", color: pal.blue, width: 1.4 }),
              lineTrace({ x: dates, y: series.map((point) => point.sma200), name: "SMA 200", color: pal.amber, width: 1.4, dash: "dot", visible: hasSma200 ? true : "legendonly" }),
            ]}
            layout={baseLayout(pal, { height: 250, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
            resetKey={`trend-sma-${meta.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Range"
          title="Rolling 52-week high and low"
          description="Rolling maximum and minimum closes using a 252-observation window (minimum 20 observations)."
          footer={<ChartFootnote>The latest close within the band shows where price sits in its own history.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Rolling high and low chart"
            height={250}
            data={[
              lineTrace({ x: dates, y: series.map((point) => point.rolling_high), name: "Rolling high", color: pal.red, width: 1.2 }),
              lineTrace({ x: dates, y: series.map((point) => point.rolling_low), name: "Rolling low", color: pal.accent, width: 1.2, fill: "tonexty", fillColor: "rgba(107,167,255,0.06)" }),
            ]}
            layout={baseLayout(pal, { height: 250, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
            resetKey={`trend-rolling-${meta.ticker}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Relative position"
        title="Price trend comparison versus each average"
        description="Percentage distance between the close and each moving average over time. Positive means price is above the average."
        footer={<ChartFootnote>Latest: SMA20 {formatPct(metrics.close_vs_sma20_pct)}, SMA50 {formatPct(metrics.close_vs_sma50_pct)}{hasSma200 ? `, SMA200 ${formatPct(metrics.close_vs_sma200_pct)}` : ""}.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Price versus moving averages chart"
          height={260}
          data={[
            lineTrace({ x: dates, y: sma20Rel, name: "vs SMA 20", color: pal.accent, width: 1.3 }),
            lineTrace({ x: dates, y: sma50Rel, name: "vs SMA 50", color: pal.blue, width: 1.2, dash: "dash" }),
            lineTrace({ x: dates, y: sma200Rel, name: "vs SMA 200", color: pal.amber, width: 1.2, dash: "dot", visible: hasSma200 ? true : "legendonly" }),
          ]}
          layout={{
            ...baseLayout(pal, { height: 260, yKind: "percent", hovermode: "x unified" }),
            yaxis: {
              ...baseLayout(pal, { height: 260, yKind: "percent" }).yaxis,
              zeroline: true,
              zerolinecolor: pal.axis,
              zerolinewidth: 1,
            },
          }}
          resetKey={`trend-relative-${meta.ticker}`}
        />
      </ChartCard>

      <InsightPanel
        insights={payload.insights}
        title="Trend interpretation"
        disclaimer="A trend label compares price with a moving average; it is not a trading signal or a forecast."
        columns={2}
      />
    </div>
  );
}

function TrendCard({
  label,
  horizon,
  trend,
  detail,
}: {
  label: string;
  horizon: string;
  trend: string;
  detail: number | null;
}) {
  const config = TREND_TONE[trend] ?? TREND_TONE.sideways;
  const Icon = trend === "uptrend" ? MoveUpRight : trend === "downtrend" ? MoveDownRight : trend === "sideways" ? MoveRight : Activity;
  return (
    <div className="panel-flat flex items-center gap-3 px-3.5 py-3">
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
          config.tone === "accent"
            ? "border-accent/30 bg-accent/10 text-accent"
            : config.tone === "negative"
              ? "border-negative/30 bg-negative/10 text-negative"
              : "border-border bg-surface-3 text-muted"
        }`}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <Label>{label}</Label>
        <p className="text-[13px] font-semibold capitalize text-ink">
          {config.label} {detail !== null ? <span className="font-mono text-[10.5px] font-normal text-faint">({formatPct(detail)})</span> : null}
        </p>
        <p className="text-[10px] text-faint">{horizon}</p>
      </div>
    </div>
  );
}
