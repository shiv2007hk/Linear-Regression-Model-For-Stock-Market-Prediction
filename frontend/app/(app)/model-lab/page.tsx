"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, CheckCircle2, Database, FlaskConical, Layers, Ruler, Scissors, Target } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { InfoRows, KpiGrid, MetaBadges, SourceStrip, SplitControl, useTickerApi } from "@/components/page-kit";
import { Badge, Button, EmptyState, Label, SegmentedControl, Spinner } from "@/components/ui/primitives";
import { useTheme, useTicker, useToast } from "@/components/providers";
import { apiSend } from "@/lib/api";
import { baseLayout, barTrace, lineTrace, palette, scatterTrace } from "@/lib/chart-theme";
import { formatDate, formatDateTime, formatPct, formatPrice } from "@/lib/format";
import type { ModelResult } from "@/lib/types";
import type { ModelMetricsPayload } from "@/lib/analytics-types";

type ModelKind = "lag" | "trend";

interface TrainedConfig {
  ticker: string;
  period: string;
  split: number;
  modelType: ModelKind;
}

export default function ModelLabPage() {
  const { ticker, period, splitRatio, setSplitRatio } = useTicker();
  const [modelType, setModelType] = useState<ModelKind>("lag");
  const [result, setResult] = useState<ModelResult | null>(null);
  const [trainedConfig, setTrainedConfig] = useState<TrainedConfig | null>(null);
  const [training, setTraining] = useState(false);
  const { pushToast } = useToast();
  const { isDark } = useTheme();
  const pal = palette(isDark);

  const { data: metrics, error, isLoading, mutate } = useTickerApi<ModelMetricsPayload>("/api/model/metrics", {
    split_ratio: splitRatio,
    model_type: modelType,
  });

  const config: TrainedConfig = { ticker, period, split: splitRatio, modelType };
  const staleResult =
    result !== null &&
    trainedConfig !== null &&
    (trainedConfig.ticker !== config.ticker ||
      trainedConfig.period !== config.period ||
      trainedConfig.split !== config.split ||
      trainedConfig.modelType !== config.modelType);

  const train = async () => {
    setTraining(true);
    try {
      const payload = await apiSend<ModelResult>("/api/model/train", "POST", {
        ticker,
        period,
        split_ratio: splitRatio,
        model_type: modelType,
      });
      setResult(payload);
      setTrainedConfig(config);
      await mutate();
      pushToast({
        title: "Model trained",
        description: `${payload.model_label} · ${payload.sample.train_size} train / ${payload.sample.test_size} test observations. Run saved.`,
        tone: "success",
      });
    } catch (err) {
      pushToast({ title: "Training failed", description: (err as Error).message, tone: "error" });
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Machine Learning · Model Lab"
        title="Train the regression model"
        description="A leakage-safe Simple Linear Regression experiment: lag the previous adjusted close, split chronologically, fit on training data, evaluate on unseen observations, then refit on the full history for forecasting."
        actions={
          <Button variant="primary" onClick={train} loading={training}>
            <FlaskConical size={12} /> Train model
          </Button>
        }
        meta={metrics ? <MetaBadges meta={metrics.meta} /> : null}
      />

      <section className="panel-flat flex flex-wrap items-end gap-4 px-3.5 py-3">
        <div>
          <Label className="mb-1.5 block">Model type</Label>
          <SegmentedControl<ModelKind>
            value={modelType}
            onChange={setModelType}
            options={[
              { value: "lag", label: "Previous close → current close", title: "Primary next-observation model" },
              { value: "trend", label: "Time index → close", title: "Educational trend demonstration only" },
            ]}
          />
        </div>
        <SplitControl value={splitRatio} onChange={setSplitRatio} disabled={training} />
        <div className="ml-auto flex flex-col items-end gap-1">
          <p className="text-[10px] text-faint">
            {ticker} · {period} · {modelType === "lag" ? "lagged close" : "time-index trend"} · no shuffling
          </p>
          {staleResult ? <Badge tone="warn">Controls changed — retrain to apply</Badge> : null}
          {!staleResult && result ? (
            <Badge tone="accent">
              <CheckCircle2 size={10} /> Run saved
            </Badge>
          ) : null}
        </div>
      </section>

      {modelType === "trend" ? (
        <div className="rounded-xl border border-warn/30 bg-warn/[0.05] px-4 py-3 text-[11px] leading-relaxed text-muted">
          <strong className="text-warn">Educational trend mode.</strong> X is the sequential trading-day index and Y is the adjusted close. This is a
          separate one-feature regression that summarises historical drift. It is not the next-observation forecasting model and must not be read as a
          price forecast.
        </div>
      ) : null}

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={140} rows={1} />}>
        {metrics ? (
          <KpiGrid
            columns={6}
            items={[
              { label: "Equation", value: metrics.coefficients.equation, hint: "Fitted on the training split only.", emphasis: true, footer: `Intercept ${metrics.coefficients.intercept.toFixed(4)}` },
              { label: "Slope b1", value: metrics.coefficients.slope.toFixed(5), hint: "Predicted change in Y for a one-unit change in X.", footer: "One feature only" },
              { label: "Training R²", value: metrics.coefficients.training_r2?.toFixed(4) ?? "—", hint: "In-sample fit. High values are expected for persistent prices.", footer: `${metrics.sample.train_size} train observations` },
              { label: "Test R²", value: metrics.metrics.test.r2?.toFixed(4) ?? "—", hint: "Out-of-sample R² on observations never used for fitting.", footer: `${metrics.sample.test_size} test observations` },
              { label: "Test MAE", value: formatPrice(metrics.metrics.test.mae, metrics.meta.currency_symbol), hint: "Average absolute error on the holdout segment.", footer: `Naive ${formatPrice(metrics.metrics.naive.mae, metrics.meta.currency_symbol)}` },
              { label: "Test RMSE", value: formatPrice(metrics.metrics.test.rmse, metrics.meta.currency_symbol), hint: "Root mean squared error, price units.", footer: `MAPE ${metrics.metrics.test.mape === null ? "—" : `${metrics.metrics.test.mape.toFixed(2)}%`}` },
            ]}
          />
        ) : null}
      </DataBoundary>

      <Workflow />

      {result ? (
        <TrainedResult result={result} pal={pal} stale={staleResult} />
      ) : (
        <EmptyState
          icon={<BrainCircuit size={22} />}
          title="No experiment run yet"
          description="Choose the split and model type, then press Train model. The run will be saved to the model-runs table and the charts below will populate with real calculations."
          action={
            <Button variant="primary" onClick={train} loading={training}>
              {training ? <Spinner /> : <FlaskConical size={12} />} Train now
            </Button>
          }
        />
      )}

      {result ? <InsightPanel insights={result.insights} title="Model interpretation" disclaimer="A high R² on persistent prices does not imply forecasting skill. Compare against the naive baseline and inspect the test errors." columns={2} /> : null}
    </div>
  );
}

function Workflow() {
  const steps = [
    { icon: Database, title: "Fetch", detail: "Adjusted daily OHLCV via yfinance" },
    { icon: Scissors, title: "Clean", detail: "Sort, dedupe, positive prices" },
    { icon: Layers, title: "Lag", detail: "X = previous close, Y = current close" },
    { icon: Ruler, title: "Split", detail: "Chronological train / test, no shuffle" },
    { icon: BrainCircuit, title: "Fit", detail: "LinearRegression on train only" },
    { icon: Target, title: "Evaluate", detail: "MAE, RMSE, R², MAPE, direction" },
  ];
  return (
    <section className="panel px-3.5 py-3.5">
      <div className="flex items-center justify-between">
        <Label>Training workflow</Label>
        <Badge tone="neutral">Leakage-safe</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => (
          <div key={step.title} className="relative flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-2.5 py-2">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-3 text-faint">
              <step.icon size={12} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-faint">Step {index + 1}</p>
              <p className="text-[11.5px] font-medium text-ink">{step.title}</p>
              <p className="text-[9.5px] leading-snug text-faint">{step.detail}</p>
            </div>
            {index < steps.length - 1 ? (
              <ArrowRight size={10} className="absolute -right-[7px] top-1/2 hidden -translate-y-1/2 text-border-strong xl:block" />
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[9.5px] leading-relaxed text-faint">
        After evaluation, a separate operational model is refitted on all valid observations for the next-observation forecast. The holdout metrics
        above remain untouched by that refit.
      </p>
    </section>
  );
}

function TrainedResult({ result, pal, stale }: { result: ModelResult; pal: ReturnType<typeof palette>; stale: boolean }) {
  const symbol = result.currency_symbol;
  const { scatter, series, sample, coefficients } = result;
  const residuals = series.residuals.map((point) => point.residual);
  const histogram = useMemo(() => buildHistogram(residuals, 18), [residuals]);

  const trainDates = scatter.train.map((point) => point.date);
  const testDates = scatter.test.map((point) => point.date);
  const isTrend = result.model_type === "trend";
  const xLabel = isTrend ? "Trading-day index (X)" : "Previous adjusted close (X)";
  const yLabel = isTrend ? "Adjusted close (Y)" : "Current adjusted close (Y)";

  return (
    <div className="space-y-4">
      {stale ? (
        <div className="rounded-lg border border-warn/30 bg-warn/[0.05] px-3 py-2 text-[10.5px] text-warn">
          The displayed run was trained with different controls. Press Train model to refresh it.
        </div>
      ) : null}

      <SourceStrip
        meta={result.meta}
        extra={
          <>
            <Badge tone="accent">Trained {formatDateTime(result.trained_at)}</Badge>
            <Badge tone="neutral">{result.model_label}</Badge>
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Relationship"
          title="Training and test observations with fitted line"
          description={`${xLabel} against ${yLabel}. The regression line is the fitted relationship; test points were never used to estimate it.`}
          footer={<ChartFootnote>Equation: {coefficients.equation} · {sample.train_size} train, {sample.test_size} test</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Regression scatter with fitted line"
            height={360}
            data={[
              scatterTrace({
                x: scatter.train.map((point) => point.x),
                y: scatter.train.map((point) => point.y),
                name: "Training",
                color: pal.blue,
                size: 5,
                opacity: 0.55,
                hovertemplate: "X %{x:,.2f} → Y %{y:,.2f}<extra>Train</extra>",
              }),
              scatterTrace({
                x: scatter.test.map((point) => point.x),
                y: scatter.test.map((point) => point.y),
                name: "Testing",
                color: pal.accent,
                size: 6,
                opacity: 0.8,
                hovertemplate: "X %{x:,.2f} → Y %{y:,.2f}<extra>Test</extra>",
              }),
              lineTrace({
                x: scatter.line.map((point) => point.x),
                y: scatter.line.map((point) => point.y),
                name: "Fitted line",
                color: pal.amber,
                width: 2,
                hovertemplate: "Fit: %{y:,.2f}<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 360, xKind: "number", yKind: "currency", currencySymbol: symbol, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 360, xKind: "number", yKind: "currency" }).xaxis,
                title: { text: xLabel, font: { size: 10.5, color: pal.faint } },
              },
              yaxis: {
                ...baseLayout(pal, { height: 360, yKind: "currency", currencySymbol: symbol }).yaxis,
                title: { text: yLabel, font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`lab-scatter-${result.trained_at}`}
          />
        </ChartCard>

        <section className="panel px-4 py-4">
          <Label>Model output</Label>
          <p className="mt-1.5 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2 font-mono text-[12px] text-accent">
            {coefficients.equation}
          </p>
          <InfoRows
            className="mt-1"
            rows={[
              { label: "Intercept b0", value: coefficients.intercept.toFixed(5) },
              { label: "Slope b1", value: coefficients.slope.toFixed(5) },
              { label: "Training records", value: sample.train_size.toLocaleString() },
              { label: "Testing records", value: sample.test_size.toLocaleString() },
              { label: "Training range", value: `${formatDate(sample.train_start)} → ${formatDate(sample.train_end)}` },
              { label: "Testing range", value: `${formatDate(sample.test_start)} → ${formatDate(sample.test_end)}` },
              { label: "Trained at", value: formatDateTime(result.trained_at) },
              { label: "Operational refit", value: result.operational_coefficients.equation },
              { label: "Operational sample", value: `${result.operational_coefficients.n_observations} obs through ${formatDate(result.operational_coefficients.fitted_through)}` },
            ]}
          />
          <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-relaxed text-faint">
            {isTrend
              ? "Trend mode uses the trading-day index, so the slope is an average price change per observation, not a next-day price relationship."
              : `A slope of ${coefficients.slope.toFixed(4)} means each 1.00 change in the previous adjusted close is associated with a ${coefficients.slope.toFixed(4)} change in the current close within this fitted model.`}
          </p>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Holdout"
          title="Actual versus fitted values"
          description="Predicted values for the chronological test segment plotted against the actual adjusted close."
          footer={<ChartFootnote>Test MAE {formatPrice(result.metrics.test.mae, symbol)} · RMSE {formatPrice(result.metrics.test.rmse, symbol)}.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Actual versus fitted values chart"
            height={270}
            data={[
              lineTrace({ x: series.test.map((row) => row.date), y: series.test.map((row) => row.actual), name: "Actual", color: pal.ink, width: 1.6 }),
              lineTrace({ x: series.test.map((row) => row.date), y: series.test.map((row) => row.predicted), name: "Fitted", color: pal.accent, width: 1.4, dash: "dot" }),
            ]}
            layout={baseLayout(pal, { height: 270, currencySymbol: symbol, yKind: "currency", hovermode: "x unified" })}
            resetKey={`lab-fitted-${result.trained_at}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Split"
          title="Training versus testing observations"
          description="Chronological observations used for fitting (blue) and holdout evaluation (green). The split is never shuffled."
          footer={<ChartFootnote>{formatDate(sample.train_start)} → {formatDate(sample.test_end)} · split {Math.round(result.split_ratio * 100)}% / {100 - Math.round(result.split_ratio * 100)}%.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Training versus testing data visualization"
            height={270}
            data={[
              scatterTrace({
                x: trainDates,
                y: scatter.train.map((point) => point.y),
                name: "Training",
                color: pal.blue,
                size: 5,
                opacity: 0.55,
              }),
              scatterTrace({
                x: testDates,
                y: scatter.test.map((point) => point.y),
                name: "Testing",
                color: pal.accent,
                size: 5,
                opacity: 0.8,
              }),
            ]}
            layout={baseLayout(pal, { height: 270, currencySymbol: symbol, yKind: "currency", hovermode: "closest" })}
            resetKey={`lab-split-${result.trained_at}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Errors"
          title="Test residual distribution"
          description="Residual = actual − predicted on the holdout segment. A tight distribution centred near zero is desirable."
          footer={<ChartFootnote>Mean {result.residual_stats.mean?.toFixed(3) ?? "—"} · std {result.residual_stats.std?.toFixed(3) ?? "—"} · {result.residual_stats.overpredicted_share?.toFixed(1) ?? "—"}% over-predictions.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Residual distribution chart"
            height={270}
            data={[
              barTrace({
                x: histogram.map((bin) => bin.center),
                y: histogram.map((bin) => bin.count),
                name: "Residuals",
                color: pal.violet,
                opacity: 0.8,
                hovertemplate: "Near %{x:,.2f}: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 270, xKind: "number", yKind: "number", showLegend: false, hovermode: "closest" }),
              xaxis: {
                ...baseLayout(pal, { height: 270, xKind: "number", yKind: "number" }).xaxis,
                title: { text: "Residual (price units)", font: { size: 10.5, color: pal.faint } },
              },
            }}
            resetKey={`lab-resid-${result.trained_at}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Interpretation"
          title="What the coefficients mean"
          description="A plain-language read of the fitted equation and the risk of over-reading a high training score."
        >
          <ul className="space-y-2.5 text-[11.5px] leading-relaxed text-muted">
            <li className="flex gap-2">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                Slope <span className="font-mono text-ink">{coefficients.slope.toFixed(4)}</span>: for each 1.00 increase in {isTrend ? "the trading-day index" : "the previous adjusted close"}, the model predicts a {coefficients.slope.toFixed(4)} change in the current adjusted close.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                Intercept <span className="font-mono text-ink">{coefficients.intercept.toFixed(4)}</span>: the predicted value when X is zero. With real prices far from zero this is a mathematical anchor and rarely a meaningful financial quantity.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                Training R² {result.metrics.train.r2?.toFixed(4)} vs test R² {result.metrics.test.r2?.toFixed(4)}. Prices are highly persistent, so a
                high training score is easy; the out-of-sample gap is the honest measure of skill.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                Test directional accuracy {result.metrics.test.directional_accuracy === null ? "is unavailable" : `${result.metrics.test.directional_accuracy.toFixed(1)}%`}; the model can track level while missing the direction of the next move.
              </span>
            </li>
          </ul>
          <p className="mt-3 border-t border-border/60 pt-2.5 text-[10px] leading-relaxed text-faint">
            The model uses one feature. News, earnings, rates and market shocks are unmodelled, so the equation is a description of persistence, not a
            complete forecast engine.
          </p>
        </ChartCard>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="panel-flat px-3.5 py-3">
          <Label>Test MAPE</Label>
          <p className="tnum mt-1 font-mono text-[17px] text-ink">{result.metrics.test.mape === null ? "—" : `${result.metrics.test.mape.toFixed(2)}%`}</p>
          <p className="mt-1 text-[10px] text-faint">vs naive {result.metrics.naive.mape === null ? "—" : `${result.metrics.naive.mape.toFixed(2)}%`}</p>
        </div>
        <div className="panel-flat px-3.5 py-3">
          <Label>MAE improvement vs naive</Label>
          <p className="tnum mt-1 font-mono text-[17px] text-ink">{formatPct(result.metrics.improvement?.mae_pct)}</p>
          <p className="mt-1 text-[10px] text-faint">Positive means lower error than the baseline</p>
        </div>
        <div className="panel-flat px-3.5 py-3">
          <Label>Directional accuracy</Label>
          <p className="tnum mt-1 font-mono text-[17px] text-ink">
            {result.metrics.test.directional_accuracy === null ? "—" : `${result.metrics.test.directional_accuracy.toFixed(1)}%`}
          </p>
          <p className="mt-1 text-[10px] text-faint">Share of correct up/down calls</p>
        </div>
      </div>
    </div>
  );
}

function buildHistogram(values: number[], bins: number) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => ({
    center: min + width * (index + 0.5),
    count,
  }));
}
