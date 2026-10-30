"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CircleHelp, RefreshCw, Sparkles } from "lucide-react";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { InfoRows, KpiGrid, MetaBadges, SourceStrip, SplitControl } from "@/components/page-kit";
import { Badge, Button, EmptyState, ErrorState, Label, SegmentedControl } from "@/components/ui/primitives";
import { useTheme, useTicker } from "@/components/providers";
import { apiSend } from "@/lib/api";
import { baseLayout, barTrace, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatDateTime, formatPct, formatPrice } from "@/lib/format";
import type { ForecastPayload } from "@/lib/analytics-types";

export default function ForecastStudioPage() {
  const { ticker, period, splitRatio, setSplitRatio, refreshToken } = useTicker();
  const [horizon, setHorizon] = useState(1);
  const [payload, setPayload] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const { isDark } = useTheme();
  const pal = palette(isDark);

  const generate = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await apiSend<ForecastPayload>("/api/model/forecast", "POST", {
        ticker,
        period,
        split_ratio: splitRatio,
        horizon,
        model_type: "lag",
      });
      if (requestId.current === id) setPayload(result);
    } catch (err) {
      if (requestId.current === id) {
        setError(err as Error);
        setPayload(null);
      }
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [ticker, period, splitRatio, horizon]);

  useEffect(() => {
    void generate();
  }, [generate, refreshToken]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Machine Learning · Forecast Studio"
        title="Next-observation forecast"
        description="The operational model is refitted on all valid historical observations, then applied to the latest adjusted close. Multi-step projections are recursive and uncertainty compounds."
        actions={
          <Button variant="primary" onClick={generate} loading={loading}>
            <Sparkles size={12} /> Generate forecast
          </Button>
        }
        meta={payload ? <MetaBadges meta={payload.meta} /> : null}
      />

      <section className="panel-flat flex flex-wrap items-end gap-4 px-3.5 py-3">
        <div>
          <Label className="mb-1.5 block">Forecast horizon</Label>
          <SegmentedControl<string>
            value={String(horizon)}
            onChange={(value) => setHorizon(Number(value))}
            options={[
              { value: "1", label: "1 obs" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "5", label: "5" },
            ]}
          />
        </div>
        <SplitControl value={splitRatio} onChange={setSplitRatio} />
        <div className="flex flex-1 flex-col gap-1 text-[10px] text-faint">
          <span>Split controls the holdout evaluation metrics only.</span>
          <span className="text-muted">The operational forecast always refits on every valid observation, then predicts the next session.</span>
        </div>
        <Button variant="secondary" onClick={generate} loading={loading}>
          <RefreshCw size={12} /> Recompute
        </Button>
      </section>

      {error ? (
        <ErrorState message={error.message} onRetry={generate} title="Forecast could not be generated" />
      ) : loading && !payload ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-28" />
          ))}
        </div>
      ) : payload ? (
        <ForecastContent payload={payload} pal={pal} loading={loading} />
      ) : (
        <EmptyState title="No forecast yet" description="Select a horizon and press Generate forecast." />
      )}
    </div>
  );
}

function ForecastContent({ payload, pal, loading }: { payload: ForecastPayload; pal: ReturnType<typeof palette>; loading: boolean }) {
  const { forecast, last_observation, steps, history, coefficients } = payload;
  const currency = payload.currency_symbol;
  const finalStep = steps[steps.length - 1];
  const directionTone = forecast.direction === "up" ? "positive" : forecast.direction === "down" ? "negative" : "muted";

  const historyDates = history.map((row) => row.date);
  const historyCloses = history.map((row) => row.close);
  const projectedX = [last_observation.date, ...steps.map((step) => step.forecast_date)];
  const projectedY = [last_observation.close, ...steps.map((step) => step.predicted_price)];
  const recent = history.slice(-60);

  return (
    <div className="space-y-4">
      <SourceStrip
        meta={payload.meta}
        extra={
          <>
            <Badge tone="accent">Operational equation {payload.equation}</Badge>
            <Badge tone={forecast.date_verified ? "info" : "warn"}>
              {forecast.date_verified ? `${forecast.calendar} calendar verified` : "Date unverified"}
            </Badge>
            {loading ? <Badge tone="neutral">Recomputing…</Badge> : null}
          </>
        }
      />

      <KpiGrid
        columns={6}
        items={[
          { label: "Latest adjusted close", value: formatPrice(last_observation.close, currency), footer: formatDate(last_observation.date), hint: "The input value used for the first forecast." },
          { label: "Predicted price", value: formatPrice(forecast.predicted_price, currency), emphasis: true, footer: formatDate(forecast.date), hint: "Operational model output for the next trading observation." },
          { label: "Predicted absolute change", value: `${forecast.absolute_change >= 0 ? "+" : "−"}${formatPrice(Math.abs(forecast.absolute_change), currency)}`, tone: directionTone, hint: "Predicted price minus the latest adjusted close." },
          { label: "Predicted percentage change", value: formatPct(forecast.percentage_change), tone: directionTone, hint: "Predicted change relative to the latest adjusted close." },
          { label: "Empirical error band", value: `${formatPrice(forecast.error_band_low, currency)} – ${formatPrice(forecast.error_band_high, currency)}`, hint: forecast.band_label, footer: "5th–95th percentile of test residuals" },
          { label: "Forecast generated", value: formatDateTime(forecast.generated_at), footer: `Horizon ${payload.horizon} observation${payload.horizon > 1 ? "s" : ""}` },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Forecast"
          title="Historical adjusted close with projected observation(s)"
          description="The dashed segment starts at the latest actual close and ends at the model's predicted value. It is an extrapolation of one fitted relationship, not a market call."
          actions={<Badge tone={forecast.date_verified ? "accent" : "warn"}>{forecast.date_verified ? "Calendar verified" : "Unverified date"}</Badge>}
          footer={<ChartFootnote>{payload.horizon === 1 ? "One next trading observation" : `${payload.horizon} recursive observations — uncertainty compounds with each step`} · {forecast.calendar_note}</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Historical price with forecast marker"
            height={360}
            data={[
              lineTrace({ x: historyDates, y: historyCloses, name: "Adjusted close", color: pal.ink, width: 1.6 }),
              lineTrace({
                x: projectedX,
                y: projectedY,
                name: payload.horizon === 1 ? "Forecast" : "Recursive forecast",
                color: pal.accent,
                width: 2,
                dash: "dot",
                hovertemplate: "Forecast: %{y:,.2f}<extra></extra>",
              }),
              {
                type: "scatter",
                mode: "markers",
                x: steps.map((step) => step.forecast_date),
                y: steps.map((step) => step.predicted_price),
                name: "Predicted observation",
                marker: { color: pal.accent, size: 9, symbol: "diamond", line: { color: pal.surface, width: 1.5 } },
                hovertemplate: "%{x}: %{y:,.2f}<extra></extra>",
              },
            ]}
            layout={baseLayout(pal, { height: 360, currencySymbol: currency, yKind: "currency", hovermode: "x unified" })}
            resetKey={`fc-main-${forecast.generated_at}`}
          />
        </ChartCard>

        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <Label>Forecast detail</Label>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <p className="tnum font-mono text-[1.8rem] font-medium leading-none tracking-[-0.03em] text-accent">
                  {formatPrice(forecast.predicted_price, currency)}
                </p>
                <p className="mt-1.5 text-[11px] text-muted">
                  {formatPct(forecast.percentage_change)} vs {formatPrice(last_observation.close, currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-[10px] text-faint">
                  <CalendarClock size={10} /> {formatDate(forecast.date)}
                </p>
                <p className="mt-0.5 text-[9.5px] text-faint">{forecast.date_verified ? "Exchange calendar" : "Unverified weekday fallback"}</p>
              </div>
            </div>
            <InfoRows
              className="mt-2"
              rows={[
                { label: "Last observation", value: `${formatDate(last_observation.date)} · ${formatPrice(last_observation.close, currency)}` },
                { label: "Operational equation", value: payload.equation },
                { label: "Intercept", value: coefficients.intercept.toFixed(5) },
                { label: "Slope", value: coefficients.slope.toFixed(5) },
                { label: "Holdout test MAE", value: formatPrice(payload.metrics.mae, currency) },
                { label: "Holdout R²", value: payload.metrics.r2 === null ? "—" : payload.metrics.r2.toFixed(4) },
                { label: "Train / test sample", value: `${payload.model_sample.train_size} / ${payload.model_sample.test_size}` },
              ]}
            />
            <p className="mt-2 border-t border-border/60 pt-2 text-[9.5px] leading-relaxed text-faint">
              {forecast.band_label} The band is empirical, not a statistically guaranteed confidence interval. Forecasts are educational and are not
              investment advice.
            </p>
          </section>

          {steps.length > 1 ? (
            <section className="panel px-4 py-4">
              <Label>Recursive projection path</Label>
              <ul className="mt-2 space-y-1.5">
                {steps.map((step) => (
                  <li key={step.step} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/50 px-2.5 py-1.5 text-[10.5px]">
                    <span className="text-faint">
                      Step {step.step} · {formatDate(step.forecast_date)}
                    </span>
                    <span className="tnum font-mono text-ink">{formatPrice(step.predicted_price, currency)}</span>
                    <span className={step.change_pct >= 0 ? "text-positive" : "text-negative"}>{formatPct(step.change_pct)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[9.5px] leading-relaxed text-faint">
                Each projected value becomes the input for the next step. Because the model is fitted on one-step differences, multi-step projections
                compound estimation error and should be read as a scenario path, not a point guarantee.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Near-term"
          title="Recent history with forecast marker"
          description="The last 60 available observations plus the projected next value, at the same price scale."
          footer={<ChartFootnote>Marker shape and colour distinguish the forecast from observed prices.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Recent prices with forecast marker"
            height={280}
            data={[
              lineTrace({ x: recent.map((row) => row.date), y: recent.map((row) => row.close), name: "Observed", color: pal.blue, width: 1.6 }),
              {
                type: "scatter",
                mode: "markers+text",
                x: [forecast.date],
                y: [forecast.predicted_price],
                name: "Forecast",
                marker: { color: pal.accent, size: 11, symbol: "diamond" },
                text: [formatPrice(forecast.predicted_price, currency)],
                textposition: "top center",
                textfont: { size: 10, color: pal.accent },
                hovertemplate: "Forecast %{y:,.2f}<extra></extra>",
              },
            ]}
            layout={baseLayout(pal, { height: 280, currencySymbol: currency, yKind: "currency", hovermode: "closest" })}
            resetKey={`fc-recent-${forecast.generated_at}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Comparison"
          title="Forecast versus latest close"
          description="The difference is the model's entire predicted move. It is usually small because prices are persistent."
        >
          <PlotlyChart
            ariaLabel="Forecast versus latest close comparison"
            height={280}
            data={[
              {
                type: "bar",
                x: ["Latest close", "Forecast"],
                y: [last_observation.close, forecast.predicted_price],
                text: [formatPrice(last_observation.close, currency), formatPrice(forecast.predicted_price, currency)],
                textposition: "outside",
                textfont: { size: 10, color: pal.muted },
                marker: { color: [pal.gray, pal.accent] },
                hovertemplate: "%{x}: %{y:,.2f}<extra></extra>",
                name: "Price",
              },
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "currency", currencySymbol: currency, showLegend: false, hovermode: "closest" })}
            resetKey={`fc-compare-${forecast.generated_at}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Model error"
          title="Historical test prediction-error distribution"
          description="Out-of-sample residuals from the chronological holdout. The empirical band is derived from these errors."
          footer={<ChartFootnote>Mean {payload.residual_stats.mean.toFixed(2)} · std {payload.residual_stats.std.toFixed(2)} · {payload.residual_stats.count} test residuals.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Historical test error distribution"
            height={280}
            data={[
              barTrace({
                x: payload.error_histogram.map((bin) => bin.center),
                y: payload.error_histogram.map((bin) => bin.count),
                name: "Residuals",
                color: pal.violet,
                opacity: 0.8,
                hovertemplate: "Near %{x:,.2f}: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 280, xKind: "number", yKind: "number", showLegend: false, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 280, xKind: "number", yKind: "number" }).xaxis,
                title: { text: "Test residual (price units)", font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`fc-errors-${forecast.generated_at}`}
          />
        </ChartCard>

        <InsightPanel insights={payload.insights} title="Forecast notes" disclaimer="A point forecast is a single model output. The empirical band shows how large historical test errors were, not a probability of future outcomes." />
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/50 px-3.5 py-3 text-[10px] leading-relaxed text-faint">
        <CircleHelp size={12} className="mt-0.5 shrink-0" />
        <p>
          The forecast date is {forecast.date_verified ? "derived from the exchange trading calendar" : "an unverified weekday fallback"} ({forecast.calendar_note}).
          No future actual prices are invented, and no assumption is made that weekends or holidays are trading days. Yahoo Finance data may be delayed.
        </p>
      </div>
    </div>
  );
}
