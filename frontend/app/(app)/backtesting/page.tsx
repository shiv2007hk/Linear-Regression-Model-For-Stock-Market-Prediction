"use client";

import { useState } from "react";
import { GitCommitHorizontal, Repeat2 } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { InfoRows, KpiGrid, MetaBadges, SourceStrip, SplitControl, useTickerApi } from "@/components/page-kit";
import { Badge, Button, Label } from "@/components/ui/primitives";
import { useTheme, useTicker } from "@/components/providers";
import { METRIC_HELP } from "@/lib/metrics";
import { baseLayout, barTrace, lineTrace, palette, scatterTrace } from "@/lib/chart-theme";
import { formatDate, formatNumber, formatPct, formatPrice } from "@/lib/format";
import type { BacktestPayload } from "@/lib/analytics-types";

export default function BacktestingPage() {
  const { splitRatio, setSplitRatio } = useTicker();
  const [walkForward, setWalkForward] = useState(false);
  const { data, error, isLoading, isValidating, mutate } = useTickerApi<BacktestPayload>("/api/model/backtest", {
    split_ratio: splitRatio,
    include_walk_forward: walkForward,
  });
  const { isDark } = useTheme();
  const pal = palette(isDark);
  const symbol = data?.meta.currency_symbol ?? "$";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Machine Learning · Backtesting"
        title="Backtest and model evaluation"
        description="Every metric below is computed on observations that were never used for fitting. The naive benchmark uses the same test dates and exposes whether the regression adds value."
        actions={
          <Button variant={walkForward ? "primary" : "secondary"} onClick={() => setWalkForward((value) => !value)} loading={walkForward && isValidating}>
            <Repeat2 size={12} /> {walkForward ? "Walk-forward on" : "Enable walk-forward"}
          </Button>
        }
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <section className="panel-flat flex flex-wrap items-end gap-4 px-3.5 py-3">
        <SplitControl value={splitRatio} onChange={setSplitRatio} />
        <div className="flex flex-1 flex-col gap-1 text-[10px] text-faint">
          <span>Chronological split · no shuffle · fitted on training only</span>
          {data ? (
            <span className="text-muted">
              Train {formatDate(data.sample.train_start)} → {formatDate(data.sample.train_end)} · Test {formatDate(data.sample.test_start)} →{" "}
              {formatDate(data.sample.test_end)}
            </span>
          ) : null}
        </div>
        <Badge tone="neutral">{data ? `${data.sample.test_size} test observations` : "loading"}</Badge>
      </section>

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={320} rows={3} />}>
        {data ? <BacktestContent payload={data} pal={pal} symbol={symbol} walkForward={walkForward} /> : null}
      </DataBoundary>
    </div>
  );
}

function BacktestContent({
  payload,
  pal,
  symbol,
  walkForward,
}: {
  payload: BacktestPayload;
  pal: ReturnType<typeof palette>;
  symbol: string;
  walkForward: boolean;
}) {
  const { metrics, series, sample, coefficients } = payload;
  const test = metrics.test;
  const naive = metrics.naive;
  const improvementMae = metrics.improvement?.mae_pct ?? null;
  const actual = series.predictions_vs_actual.map((row) => row.actual);
  const predicted = series.predictions_vs_actual.map((row) => row.predicted);
  const axisMin = Math.min(...actual, ...predicted);
  const axisMax = Math.max(...actual, ...predicted);

  return (
    <div className="space-y-4">
      <SourceStrip
        meta={payload.meta}
        extra={
          <>
            <Badge tone={improvementMae !== null && improvementMae > 0 ? "accent" : "warn"}>
              {improvementMae !== null && improvementMae > 0 ? "Beats naive MAE" : "Does not beat naive MAE"}
            </Badge>
            <Badge tone="neutral">{payload.model_label}</Badge>
          </>
        }
      />

      <KpiGrid
        columns={6}
        items={[
          { label: "MAE", value: formatPrice(test.mae, symbol), hint: METRIC_HELP.mae, footer: `Naive ${formatPrice(naive.mae, symbol)}`, emphasis: true },
          { label: "MSE", value: test.mse === null ? "—" : formatNumber(test.mse, { bare: true, digits: 2 }), hint: METRIC_HELP.mse, footer: "Squared price units" },
          { label: "RMSE", value: formatPrice(test.rmse, symbol), hint: METRIC_HELP.rmse, footer: `Naive ${formatPrice(naive.rmse, symbol)}` },
          { label: "R² (out-of-sample)", value: test.r2 === null ? "—" : test.r2.toFixed(4), hint: METRIC_HELP.r2, footer: `Naive ${naive.r2 === null ? "—" : naive.r2.toFixed(4)}` },
          { label: "MAPE", value: test.mape === null ? "—" : `${test.mape.toFixed(2)}%`, hint: METRIC_HELP.mape, footer: `Naive ${naive.mape === null ? "—" : `${naive.mape.toFixed(2)}%`}` },
          {
            label: "Directional accuracy",
            value: test.directional_accuracy === null ? "—" : `${test.directional_accuracy.toFixed(1)}%`,
            hint: METRIC_HELP.directional,
            footer: "Up/down direction on test dates",
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Out-of-sample"
          title="Actual versus predicted adjusted close"
          description="The operational model is not used here. Predictions come from the training-only fit applied to the holdout segment."
          footer={<ChartFootnote>{sample.test_size} test observations · {payload.model_label} · {coefficients.equation}</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Actual versus predicted prices chart"
            height={340}
            data={[
              lineTrace({ x: series.predictions_vs_actual.map((row) => row.date), y: series.predictions_vs_actual.map((row) => row.actual), name: "Actual", color: pal.ink, width: 1.7 }),
              lineTrace({ x: series.predictions_vs_actual.map((row) => row.date), y: series.predictions_vs_actual.map((row) => row.predicted), name: "Predicted", color: pal.accent, width: 1.4, dash: "dot" }),
              lineTrace({ x: series.predictions_vs_actual.map((row) => row.date), y: series.predictions_vs_actual.map((row) => row.previous), name: "Naive", color: pal.gray, width: 1, dash: "dash", opacity: 0.7 }),
            ]}
            layout={baseLayout(pal, { height: 340, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
            resetKey={`bt-avp-${payload.trained_at}`}
          />
        </ChartCard>

        <ChartCard eyebrow="Error profile" title="Prediction error over time" description="Signed error = actual − predicted. Persistent bias appears as a one-sided band." footer={<ChartFootnote>Check the findings below for bias and volatility-conditioned error commentary.</ChartFootnote>}>
          <PlotlyChart
            ariaLabel="Prediction error over time chart"
            height={340}
            data={[
              lineTrace({
                x: series.residuals.map((row) => row.date),
                y: series.residuals.map((row) => row.residual),
                name: "Error",
                color: pal.amber,
                width: 1.4,
                fill: "tozeroy",
                fillColor: "rgba(242,180,92,0.10)",
                hovertemplate: "Error: %{y:,.2f}<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 340, yKind: "currency", currencySymbol: symbol, showLegend: false, hovermode: "x unified" }),
              yaxis: {
                ...baseLayout(pal, { height: 340, yKind: "currency", currencySymbol: symbol }).yaxis,
                zeroline: true,
                zerolinecolor: pal.axis,
              },
            }}
            resetKey={`bt-error-${payload.trained_at}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Calibration"
          title="Actual versus predicted scatter"
          description="A perfect model would place every point on the dashed diagonal."
          footer={<ChartFootnote>Dashed line is y = x, not a fitted line.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Actual versus predicted scatter chart"
            height={280}
            data={[
              scatterTrace({
                x: actual,
                y: predicted,
                name: "Test observations",
                color: pal.accent,
                size: 5.5,
                opacity: 0.7,
                hovertemplate: "Actual %{x:,.2f} → Predicted %{y:,.2f}<extra></extra>",
              }),
              lineTrace({
                x: [axisMin, axisMax],
                y: [axisMin, axisMax],
                name: "Perfect calibration",
                color: pal.gray,
                width: 1.1,
                dash: "dash",
                hovertemplate: "y = x<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 280, xKind: "number", yKind: "currency", currencySymbol: symbol, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 280, xKind: "number", yKind: "currency" }).xaxis,
                title: { text: "Actual adjusted close", font: { size: 10.5, color: pal.faint } },
              },
              yaxis: {
                ...baseLayout(pal, { height: 280, yKind: "currency", currencySymbol: symbol }).yaxis,
                title: { text: "Predicted adjusted close", font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`bt-scatter-${payload.trained_at}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Benchmark"
          title="Model versus naive baseline"
          description="Identical test observations. Lower is better for MAE, RMSE and MAPE."
          footer={<ChartFootnote>Improvement in MAE {formatPct(improvementMae)} · RMSE {formatPct(metrics.improvement?.rmse_pct)}.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Model versus naive baseline metrics"
            height={280}
            data={[
              barTrace({ x: ["MAE", "RMSE", "MAPE (%)"], y: [test.mae, test.rmse, test.mape], name: "Linear regression", color: pal.accent }),
              barTrace({ x: ["MAE", "RMSE", "MAPE (%)"], y: [naive.mae, naive.rmse, naive.mape], name: "Naive baseline", color: pal.gray }),
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "number", barmode: "group", hovermode: "closest" })}
            resetKey={`bt-bench-${payload.trained_at}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Direction"
        title="Prediction direction comparison"
        description="Actual versus predicted up/down direction on each test observation. Direction is relative to the previous close."
        footer={<ChartFootnote>Directional accuracy {test.directional_accuracy === null ? "unavailable" : `${test.directional_accuracy.toFixed(1)}%`} · magnitude accuracy is separate.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Prediction direction comparison chart"
          height={250}
          data={[
            {
              type: "scatter",
              mode: "lines+markers",
              x: series.direction.map((row) => row.date),
              y: series.direction.map((row) => row.actual_direction),
              name: "Actual direction",
              line: { color: pal.ink, width: 1, shape: "hv" },
              marker: { color: pal.ink, size: 3.5 },
              hovertemplate: "Actual: %{y}<extra></extra>",
            },
            {
              type: "scatter",
              mode: "lines+markers",
              x: series.direction.map((row) => row.date),
              y: series.direction.map((row) => row.predicted_direction),
              name: "Predicted direction",
              line: { color: pal.accent, width: 1, shape: "hv", dash: "dot" },
              marker: { color: pal.accent, size: 3.5 },
              hovertemplate: "Predicted: %{y}<extra></extra>",
            },
          ]}
          layout={{
            ...baseLayout(pal, { height: 250, yKind: "number", hovermode: "x unified" }),
            yaxis: {
              ...baseLayout(pal, { height: 250, yKind: "number" }).yaxis,
              tickvals: [-1, 1],
              ticktext: ["Down", "Up"],
              range: [-1.4, 1.4],
            },
          }}
          resetKey={`bt-direction-${payload.trained_at}`}
        />
      </ChartCard>

      {walkForward && payload.walk_forward ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal size={14} className="text-accent" />
            <h2 className="text-[15px] font-semibold text-ink">Expanding-window walk-forward</h2>
            <Badge tone="accent">No look-ahead</Badge>
          </div>
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-muted">{payload.walk_forward.method}</p>
          <KpiGrid
            columns={5}
            items={[
              { label: "Walk-forward MAE", value: formatPrice(payload.walk_forward.metrics.mae, symbol), hint: "Average absolute error across one-step predictions made only with prior data.", emphasis: true },
              { label: "RMSE", value: formatPrice(payload.walk_forward.metrics.rmse, symbol) },
              { label: "R²", value: payload.walk_forward.metrics.r2 === null ? "—" : payload.walk_forward.metrics.r2.toFixed(4) },
              { label: "MAPE", value: payload.walk_forward.metrics.mape === null ? "—" : `${payload.walk_forward.metrics.mape.toFixed(2)}%` },
              { label: "Predictions", value: payload.walk_forward.n_predictions.toLocaleString(), footer: `Initial train ${payload.walk_forward.initial_train_size} obs` },
            ]}
          />
          <ChartCard
            eyebrow="Walk-forward"
            title="Actual versus walk-forward predictions"
            description="Each point is predicted by a model refitted only on observations available before that date."
            footer={<ChartFootnote>Expanding window · minimum initial training sample {payload.walk_forward.initial_train_size} observations.</ChartFootnote>}
          >
            <PlotlyChart
              ariaLabel="Walk-forward predictions chart"
              height={280}
              data={[
                lineTrace({ x: payload.walk_forward.series.map((row) => row.date), y: payload.walk_forward.series.map((row) => row.actual), name: "Actual", color: pal.ink, width: 1.5 }),
                lineTrace({ x: payload.walk_forward.series.map((row) => row.date), y: payload.walk_forward.series.map((row) => row.predicted), name: "Walk-forward", color: pal.violet, width: 1.4, dash: "dot" }),
              ]}
              layout={baseLayout(pal, { height: 280, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
              resetKey={`bt-wf-${payload.trained_at}`}
            />
          </ChartCard>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="panel px-4 py-4">
          <Label>Run details</Label>
          <InfoRows
            className="mt-1"
            rows={[
              { label: "Selected stock", value: `${payload.meta.ticker} · ${payload.meta.exchange}` },
              { label: "Model", value: payload.model_label },
              { label: "Equation", value: coefficients.equation },
              { label: "Train / test", value: `${sample.train_size} / ${sample.test_size}` },
              { label: "Training range", value: `${formatDate(sample.train_start)} → ${formatDate(sample.train_end)}` },
              { label: "Testing range", value: `${formatDate(sample.test_start)} → ${formatDate(sample.test_end)}` },
              { label: "Trained at", value: formatDate(payload.trained_at) },
              { label: "Decision threshold", value: "None — regression output only" },
            ]}
          />
          <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-relaxed text-faint">{payload.disclaimer}</p>
        </section>

        <InsightPanel insights={payload.insights} title="Backtest findings" disclaimer="Out-of-sample errors describe this historical window. They do not guarantee future error magnitudes." />
      </div>
    </div>
  );
}
