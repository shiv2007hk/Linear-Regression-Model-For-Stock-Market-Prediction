"use client";

import { CircleHelp, FunctionSquare, RefreshCw } from "lucide-react";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { InfoRows, KpiGrid, MetaBadges, SourceStrip } from "@/components/page-kit";
import { Badge, Button, Label } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { useTickerApi } from "@/components/page-kit";
import { baseLayout, barTrace, lineTrace, palette, scatterTrace } from "@/lib/chart-theme";
import { formatDate, formatPrice } from "@/lib/format";
import type { ModelInsightsPayload } from "@/lib/analytics-types";

export default function ModelInsightsPage() {
  const { data, error, isLoading, isValidating, mutate } = useTickerApi<ModelInsightsPayload>("/api/model/insights");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Machine Learning · Model Insights"
        title="What the equation actually says"
        description="A single-feature regression: yesterday's adjusted close predicts today's adjusted close. The coefficients, worked example and sensitivity below are computed live from the selected ticker."
        actions={
          <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
            <RefreshCw size={12} /> Recompute
          </Button>
        }
        meta={data?.meta ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={280} rows={2} />}>
        {data ? <InsightsContent payload={data} /> : null}
      </DataBoundary>
    </div>
  );
}

function InsightsContent({ payload }: { payload: ModelInsightsPayload }) {
  const { isDark } = useTheme();
  const pal = palette(isDark);
  const currency = payload.example.currency_symbol || payload.meta.currency_symbol || "$";
  const testR2 = payload.metrics.test.r2;
  const trainR2 = payload.metrics.train.r2;

  return (
    <div className="space-y-4">
      <SourceStrip meta={payload.meta} extra={<Badge tone="accent">Single feature · no moving averages</Badge>} />

      <section className="panel relative overflow-hidden px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_180px_at_0%_0%,rgba(55,217,166,0.08),transparent)]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Label>Fitted equation (holdout model)</Label>
            <p className="mt-2 flex items-center gap-2 font-mono text-[1.15rem] font-medium tracking-[-0.01em] text-ink sm:text-[1.4rem]">
              <FunctionSquare size={18} className="text-accent" />
              {payload.equation}
            </p>
            <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-muted">
              {payload.feature.name} → {payload.target.name}. One previous observation, one target observation. Nothing else enters the model.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">Chronological split</Badge>
            <Badge tone="neutral">No shuffling</Badge>
            <Badge tone="violet">No leakage</Badge>
          </div>
        </div>
      </section>

      <KpiGrid
        columns={6}
        items={[
          { label: "Intercept", value: payload.coefficients.intercept.toFixed(4), hint: "Prediction when X = 0. Financially meaningless on its own — read it together with the slope.", footer: "Price units" },
          { label: "Slope", value: payload.coefficients.slope.toFixed(4), hint: "Predicted change in the current close for a one-unit change in the previous close.", emphasis: true, footer: `1.00 → ${payload.coefficients.slope.toFixed(4)}` },
          { label: "Training R²", value: trainR2 === null ? "—" : trainR2.toFixed(4), hint: "Share of in-sample variance explained. Inflated by price persistence.", footer: `${payload.sample.train_size.toLocaleString()} rows` },
          { label: "Test R²", value: testR2 === null ? "—" : testR2.toFixed(4), hint: "Out-of-sample share of variance explained. The honest comparison.", tone: testR2 !== null && testR2 > 0 ? "positive" : "muted", footer: `${payload.sample.test_size.toLocaleString()} holdout rows` },
          { label: "Test MAE", value: formatPrice(payload.metrics.test.mae, currency), hint: "Mean absolute error on the chronological holdout.", footer: `Naive ${formatPrice(payload.metrics.naive.mae, currency)}` },
          { label: "Operational refit", value: `${payload.operational_coefficients.n_observations.toLocaleString()} obs`, hint: "The forecast model is refitted on all valid observations after evaluation.", footer: `through ${formatDate(payload.operational_coefficients.fitted_through, { short: true })}` },
        ]}
      />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <section className="panel px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Independent variable · X</Label>
            <Badge tone="neutral">1 feature</Badge>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-ink">{payload.feature.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{payload.feature.description}</p>
        </section>
        <section className="panel px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Dependent variable · Y</Label>
            <Badge tone="accent">Target</Badge>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-ink">{payload.target.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{payload.target.description}</p>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Fit"
          title="Previous close versus current close"
          description="Train points are muted; holdout points are highlighted. The fitted line is the single regression estimated on the training window."
          footer={<ChartFootnote>Points are individual trading observations. Overlapping points indicate the strong persistence the model exploits.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Scatter of previous close against current close with fitted regression line"
            height={340}
            data={[
              scatterTrace({ x: payload.scatter.train.map((point) => point.x), y: payload.scatter.train.map((point) => point.y), name: "Train", color: pal.gray, size: 4, opacity: 0.45 }),
              scatterTrace({ x: payload.scatter.test.map((point) => point.x), y: payload.scatter.test.map((point) => point.y), name: "Test (holdout)", color: pal.blue, size: 5, opacity: 0.8 }),
              lineTrace({ x: payload.scatter.line.map((point) => point.x), y: payload.scatter.line.map((point) => point.y), name: "Fitted line", color: pal.accent, width: 2, hovertemplate: "Fitted: %{y:,.2f}<extra></extra>" }),
            ]}
            layout={baseLayout(pal, { height: 340, xKind: "number", yKind: "number", currencySymbol: currency, xTitle: "Previous adjusted close (X)", yTitle: "Current adjusted close (Y)", hovermode: "closest" })}
            resetKey="insights-scatter"
          />
        </ChartCard>

        <section className="panel flex flex-col px-4 py-4">
          <Label>Worked example</Label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">Applying the fitted equation to the latest observed close.</p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface/70 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-ink">
            {payload.example.math}
          </pre>
          <InfoRows
            className="mt-2"
            rows={[
              { label: "Input X (latest close)", value: formatPrice(payload.example.x, currency) },
              { label: "Predicted Y", value: formatPrice(payload.example.predicted, currency) },
              { label: "Slope", value: payload.example.slope.toFixed(5) },
              { label: "One-unit effect", value: `${currency}${payload.example.one_unit_change.toFixed(4)}` },
              { label: "Operational equation", value: payload.operational_coefficients.equation },
            ]}
          />
          <p className="mt-auto border-t border-border/60 pt-2 text-[9.5px] leading-relaxed text-faint">
            This in-sample worked example uses the holdout-fitted coefficients. The operational forecast refits on all history, so its coefficients can differ
            slightly.
          </p>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Sensitivity"
          title="How the output moves when the input moves"
          description="The model is shocked with previous closes from −5% to +5% around the latest value. Because the slope is a single number, the response is exactly linear."
          footer={<ChartFootnote>Change is measured against the model output at the latest observed close, not against an actual future price.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Model sensitivity to previous close changes"
            height={280}
            data={[
              barTrace({
                x: payload.sensitivity.map((row) => (row.x_change_pct === 0 ? "Latest" : `${row.x_change_pct > 0 ? "+" : ""}${row.x_change_pct.toFixed(0)}%`)),
                y: payload.sensitivity.map((row) => row.difference_vs_latest),
                name: "Output change",
                color: pal.amber,
                opacity: 0.9,
                hovertemplate: "Input shift %{x}<br>Output shift %{y:,.2f}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "number", currencySymbol: currency, yTitle: "Change in predicted price", showLegend: false, hovermode: "closest" })}
            resetKey="insights-sensitivity"
          />
        </ChartCard>

        <ChartCard
          eyebrow="Linearity"
          title="Input price versus predicted price"
          description="Paired bars for each shock scenario. The predicted bar is always the input bar transformed by the same intercept and slope."
          footer={<ChartFootnote>If the slope were 1.00 and the intercept 0, both bars would match exactly.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Input price and predicted price by scenario"
            height={280}
            data={[
              barTrace({
                x: payload.prediction_comparison.map((_, index) => {
                  const pct = payload.sensitivity[index]?.x_change_pct ?? 0;
                  return pct === 0 ? "Latest" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
                }),
                y: payload.prediction_comparison.map((row) => row.input_price),
                name: "Input price",
                color: pal.gray,
                opacity: 0.65,
                hovertemplate: "Input %{y:,.2f}<extra></extra>",
              }),
              barTrace({
                x: payload.prediction_comparison.map((_, index) => {
                  const pct = payload.sensitivity[index]?.x_change_pct ?? 0;
                  return pct === 0 ? "Latest" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
                }),
                y: payload.prediction_comparison.map((row) => row.predicted_price),
                name: "Predicted price",
                color: pal.accent,
                opacity: 0.85,
                hovertemplate: "Predicted %{y:,.2f}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "currency", currencySymbol: currency, barmode: "group", hovermode: "closest" })}
            resetKey="insights-comparison"
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Error shape"
          title="Holdout residual distribution"
          description="Where the model's out-of-sample errors cluster. A narrow distribution around zero is better; asymmetry signals bias."
          footer={<ChartFootnote>Residual = actual − predicted, in price units.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Holdout residual histogram"
            height={260}
            data={[
              barTrace({
                x: payload.residual_histogram.map((bin) => bin.center),
                y: payload.residual_histogram.map((bin) => bin.count),
                name: "Residuals",
                color: pal.violet,
                opacity: 0.85,
                hovertemplate: "Near %{x:,.2f}: %{y}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 260, xKind: "number", yKind: "number", currencySymbol: currency, xTitle: "Residual", yTitle: "Observations", showLegend: false, hovermode: "closest" })}
            resetKey="insights-residuals"
          />
        </ChartCard>

        <section className="panel px-4 py-4">
          <Label>Metric summary</Label>
          <InfoRows
            className="mt-2"
            rows={[
              { label: "Train window", value: `${formatDate(payload.sample.train_start, { short: true })} → ${formatDate(payload.sample.train_end, { short: true })}` },
              { label: "Test window", value: `${formatDate(payload.sample.test_start, { short: true })} → ${formatDate(payload.sample.test_end, { short: true })}` },
              { label: "Test RMSE", value: formatPrice(payload.metrics.test.rmse, currency) },
              { label: "Test MAPE", value: payload.metrics.test.mape === null ? "—" : `${payload.metrics.test.mape.toFixed(2)}%` },
              { label: "Naive MAE", value: formatPrice(payload.metrics.naive.mae, currency) },
              { label: "Directional accuracy", value: payload.metrics.test.directional_accuracy === null ? "—" : `${payload.metrics.test.directional_accuracy.toFixed(1)}%` },
              { label: "MAE improvement vs naive", value: payload.metrics.improvement?.mae_pct === null || payload.metrics.improvement?.mae_pct === undefined ? "—" : `${payload.metrics.improvement.mae_pct.toFixed(2)}%` },
            ]}
          />
          <p className="mt-2 border-t border-border/60 pt-2 text-[9.5px] leading-relaxed text-faint">
            The naive baseline predicts tomorrow equals today. A regression that cannot beat it is not adding forecast value, even if its R² looks high.
          </p>
        </section>
      </div>

      <InsightPanel
        insights={payload.explanations}
        title="How to read this model honestly"
        eyebrow="Interpretation"
        columns={2}
        disclaimer={payload.disclaimer}
      />

      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/50 px-3.5 py-3 text-[10px] leading-relaxed text-faint">
        <CircleHelp size={12} className="mt-0.5 shrink-0" />
        <p>
          The intercept is shown for completeness but has no standalone financial meaning: a price of zero is outside the observed range. Use the slope,
          equation and out-of-sample metrics together.
        </p>
      </div>
    </div>
  );
}
