"use client";

import { AlertTriangle, CircleHelp, RefreshCw } from "lucide-react";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { DataTable, type Column } from "@/components/data-table";
import { InfoRows, KpiGrid, MetaBadges, SourceStrip } from "@/components/page-kit";
import { Badge, Button, EmptyState, Label } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { useTickerApi } from "@/components/page-kit";
import { baseLayout, barTrace, lineTrace, palette, scatterTrace } from "@/lib/chart-theme";
import { formatDate, formatPrice } from "@/lib/format";
import type { DiagnosticsPayload } from "@/lib/analytics-types";

export default function ResidualDiagnosticsPage() {
  const { data, error, isLoading, isValidating, mutate } = useTickerApi<DiagnosticsPayload>("/api/model/diagnostics");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Machine Learning · Residual Diagnostics"
        title="Are the model's errors well behaved?"
        description="These checks use out-of-sample residuals from the chronological holdout. They describe how the one-feature regression fails; they do not prove it forecasts well."
        actions={
          <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
            <RefreshCw size={12} /> Refresh diagnostics
          </Button>
        }
        meta={data?.meta ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary
        loading={isLoading}
        error={error}
        onRetry={() => mutate()}
        skeleton={<PanelSkeleton height={300} rows={2} />}
      >
        {data ? (
          data.available ? (
            <DiagnosticsContent payload={data} />
          ) : (
            <EmptyState
              title="Not enough out-of-sample residuals"
              description={data.message ?? "At least 8 holdout residuals are required. Use a longer period or a larger test split."}
            />
          )
        ) : null}
      </DataBoundary>
    </div>
  );
}

function DiagnosticsContent({ payload }: { payload: DiagnosticsPayload }) {
  const { isDark } = useTheme();
  const pal = palette(isDark);
  const { stats, series, sample, coefficients } = payload;
  const currency = payload.meta.currency_symbol || "$";
  const jbRejects = stats.jarque_bera_p < 0.05;
  const bpAvailable = stats.breusch_pagan_p !== null;
  const bpRejects = bpAvailable && (stats.breusch_pagan_p as number) < 0.05;
  const hasAutocorrelation = stats.significant_acf_lags.length > 0;

  return (
    <div className="space-y-4">
      <SourceStrip
        meta={payload.meta}
        extra={<Badge tone="info">Holdout residuals · {stats.n} observations</Badge>}
      />

      <KpiGrid
        columns={6}
        items={[
          { label: "Holdout residuals", value: stats.n.toLocaleString(), hint: "Number of out-of-sample predictions with a usable residual.", footer: `${sample.test_size} test rows` },
          { label: "Mean residual", value: formatPrice(stats.mean, currency, 3), hint: "Average of actual minus predicted. Near zero means no large overall bias.", tone: Math.abs(stats.mean) > stats.std * 0.25 ? "negative" : "muted", footer: "actual − predicted" },
          { label: "Residual std", value: formatPrice(stats.std, currency, 3), hint: "Spread of out-of-sample errors in price units.", footer: `±2.5σ outlier line ${formatPrice(stats.outlier_threshold, currency, 2)}` },
          { label: "Skewness", value: stats.skewness.toFixed(3), hint: "Positive values mean occasional very large positive errors; negative values mean large negative errors.", footer: Math.abs(stats.skewness) > 0.8 ? "Noticeably skewed" : "Roughly symmetric" },
          { label: "Excess kurtosis", value: stats.excess_kurtosis.toFixed(3), hint: "Above zero means heavier tails than a normal distribution.", footer: stats.excess_kurtosis > 1.5 ? "Heavy-tailed errors" : "Not unusually heavy-tailed" },
          { label: "Flagged outliers", value: payload.outliers.length.toString(), hint: "Residuals beyond 2.5 standard deviations.", tone: payload.outliers.length ? "negative" : "muted", footer: payload.outliers.length ? "Listed below" : "None in this window" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <VerdictCard
          title="Normality"
          tone={jbRejects ? "warn" : "accent"}
          verdict={jbRejects ? "Non-normal residuals" : "Normality not rejected"}
          detail={`Jarque–Bera statistic ${stats.jarque_bera_stat.toFixed(2)} · p = ${stats.jarque_bera_p.toFixed(4)}`}
          note={jbRejects ? "Normal-theory intervals would be unreliable." : "A normal approximation is not grossly contradicted."}
        />
        <VerdictCard
          title="Constant variance"
          tone={!bpAvailable ? "neutral" : bpRejects ? "warn" : "accent"}
          verdict={!bpAvailable ? "Test unavailable" : bpRejects ? "Heteroscedasticity detected" : "Variance looks stable"}
          detail={bpAvailable ? `Breusch–Pagan statistic ${(stats.breusch_pagan_stat as number).toFixed(2)} · p = ${(stats.breusch_pagan_p as number).toFixed(4)}` : "statsmodels could not run this test for the sample."}
          note={bpRejects ? "A single error band will understate risk in volatile regimes." : "No evidence that error size scales with the fitted price."}
        />
        <VerdictCard
          title="Serial correlation"
          tone={hasAutocorrelation ? "warn" : "accent"}
          verdict={hasAutocorrelation ? `${stats.significant_acf_lags.length} significant lag(s)` : "No significant ACF lags"}
          detail={`95% band ±${stats.acf_band.toFixed(3)}${hasAutocorrelation ? ` · first at lag ${stats.significant_acf_lags[0]}` : ""}`}
          note={hasAutocorrelation ? "Errors carry structure the one-feature model ignores." : "No evidence of linear dependence in the errors."}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard
          eyebrow="Homoscedasticity"
          title="Residuals versus fitted values"
          description="A healthy pattern is a shapeless cloud around zero. A funnel or curve hints that error size depends on the predicted level."
          footer={<ChartFootnote>Each point is one holdout observation; the dashed line is zero error.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Residuals versus fitted values"
            height={300}
            data={[
              scatterTrace({
                x: series.vs_fitted.map((row) => row.fitted),
                y: series.vs_fitted.map((row) => row.residual),
                name: "Holdout residual",
                color: pal.blue,
                size: 5,
                opacity: 0.7,
                hovertemplate: "Fitted %{x:,.2f}<br>Residual %{y:,.2f}<extra></extra>",
              }),
              lineTrace({
                x: [Math.min(...series.vs_fitted.map((row) => row.fitted)), Math.max(...series.vs_fitted.map((row) => row.fitted))],
                y: [0, 0],
                name: "Zero",
                color: pal.faint,
                width: 1,
                dash: "dash",
                hovertemplate: "Zero<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 300, xKind: "number", yKind: "number", currencySymbol: currency, xTitle: "Fitted price", yTitle: "Residual", hovermode: "closest" })}
            resetKey="diag-vs-fitted"
          />
        </ChartCard>

        <ChartCard
          eyebrow="Independence"
          title="Residuals over time"
          description="Bands mark ±1.96 residual standard deviations. Runs above or below zero suggest the model misses persistent structure."
          footer={<ChartFootnote>Dated in chronological holdout order. The band sits at ±1.96σ = ±{stats.sigma_band.toFixed(2)} (σ = {stats.std.toFixed(2)}), a fixed reference and not a prediction interval.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Residuals over time with 95 percent band"
            height={300}
            data={[
              lineTrace({ x: series.over_time.map((row) => row.date), y: series.over_time.map((row) => row.band), name: "+1.96σ", color: pal.faint, width: 1, dash: "dot", hovertemplate: "Upper band<extra></extra>" }),
              lineTrace({ x: series.over_time.map((row) => row.date), y: series.over_time.map((row) => -row.band), name: "−1.96σ", color: pal.faint, width: 1, dash: "dot", hovertemplate: "Lower band<extra></extra>" }),
              lineTrace({ x: series.over_time.map((row) => row.date), y: series.over_time.map((row) => row.residual), name: "Residual", color: pal.accent, width: 1.5, hovertemplate: "%{x|%d %b %Y}: %{y:,.2f}<extra></extra>" }),
              lineTrace({ x: [series.over_time[0]?.date, series.over_time[series.over_time.length - 1]?.date], y: [0, 0], name: "Zero", color: pal.faint, width: 1, dash: "dash", hovertemplate: "Zero<extra></extra>" }),
            ]}
            layout={baseLayout(pal, { height: 300, yKind: "number", currencySymbol: currency, yTitle: "Residual", hovermode: "x unified" })}
            resetKey="diag-over-time"
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard
          eyebrow="Distribution"
          title="Residual histogram"
          description="A symmetric, bell-shaped histogram is consistent with normal errors. Long tails correspond to occasional large misses."
          footer={<ChartFootnote>{stats.n} residuals · {payload.outliers.length} beyond ±2.5σ</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Residual distribution histogram"
            height={300}
            data={[
              barTrace({
                x: series.histogram.map((bin) => bin.center),
                y: series.histogram.map((bin) => bin.count),
                name: "Residuals",
                color: pal.violet,
                opacity: 0.85,
                hovertemplate: "Near %{x:,.2f}: %{y}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 300, xKind: "number", yKind: "number", currencySymbol: currency, xTitle: "Residual", yTitle: "Observations", showLegend: false, hovermode: "closest" })}
            resetKey="diag-histogram"
          />
        </ChartCard>

        <ChartCard
          eyebrow="Normality"
          title="Normal Q–Q plot"
          description="Sample quantiles against theoretical normal quantiles. Points close to the reference line indicate errors that resemble a normal distribution."
          footer={<ChartFootnote>Reference line: sample = {payload.series.qq.intercept.toFixed(3)} + {payload.series.qq.slope.toFixed(3)} × theoretical.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Normal quantile-quantile plot of residuals"
            height={300}
            data={[
              scatterTrace({
                x: series.qq.points.map((point) => point.theoretical),
                y: series.qq.points.map((point) => point.sample),
                name: "Residual quantiles",
                color: pal.amber,
                size: 5,
                opacity: 0.8,
                hovertemplate: "Theoretical %{x:,.2f}<br>Sample %{y:,.2f}<extra></extra>",
              }),
              lineTrace({
                x: [Math.min(...series.qq.points.map((point) => point.theoretical)), Math.max(...series.qq.points.map((point) => point.theoretical))],
                y: (() => {
                  const xs = series.qq.points.map((point) => point.theoretical);
                  const lo = Math.min(...xs);
                  const hi = Math.max(...xs);
                  return [series.qq.intercept + series.qq.slope * lo, series.qq.intercept + series.qq.slope * hi];
                })(),
                name: "Normal reference",
                color: pal.faint,
                width: 1.2,
                dash: "dash",
                hovertemplate: "Normal reference<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 300, xKind: "number", yKind: "number", currencySymbol: currency, xTitle: "Theoretical quantile", yTitle: "Sample residual", hovermode: "closest" })}
            resetKey="diag-qq"
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Autocorrelation"
        title="Autocorrelation function of the residuals"
        description="Each bar is the correlation of the residual series with its own lag. Bars outside the dashed 95% band suggest leftover linear structure."
        footer={<ChartFootnote>Band ±{stats.acf_band.toFixed(4)} = 1.96 / √n with n = {stats.n}. Lags beyond the plotted range are omitted.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Residual autocorrelation by lag"
          height={280}
          data={[
            barTrace({
              x: series.acf.map((row) => row.lag),
              y: series.acf.map((row) => row.value),
              name: "ACF",
              color: pal.blue,
              opacity: 0.85,
              hovertemplate: "Lag %{x}: %{y:,.3f}<extra></extra>",
            }),
            lineTrace({ x: [0, series.acf.length - 1], y: [stats.acf_band, stats.acf_band], name: "95% band", color: pal.faint, width: 1, dash: "dot", hovertemplate: "Upper band<extra></extra>" }),
            lineTrace({ x: [0, series.acf.length - 1], y: [-stats.acf_band, -stats.acf_band], name: "95% band", color: pal.faint, width: 1, dash: "dot", hovertemplate: "Lower band<extra></extra>" }),
          ]}
          layout={baseLayout(pal, { height: 280, xKind: "number", yKind: "number", xTitle: "Lag (trading observations)", yTitle: "Autocorrelation", showLegend: false, hovermode: "closest" })}
          resetKey="diag-acf"
        />
      </ChartCard>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OutlierTable payload={payload} currency={currency} />
        <section className="panel px-4 py-4">
          <Label>Diagnostic context</Label>
          <InfoRows
            className="mt-2"
            rows={[
              { label: "Model", value: "Simple Linear Regression (lag-1)" },
              { label: "Equation", value: coefficients.equation },
              { label: "Holdout R²", value: coefficients.training_r2 === null ? "—" : coefficients.training_r2.toFixed(4) },
              { label: "Train window", value: `${formatDate(sample.train_start, { short: true })} → ${formatDate(sample.train_end, { short: true })}` },
              { label: "Test window", value: `${formatDate(sample.test_start, { short: true })} → ${formatDate(sample.test_end, { short: true })}` },
              { label: "Train / test rows", value: `${sample.train_size.toLocaleString()} / ${sample.test_size.toLocaleString()}` },
              { label: "Outlier rule", value: "|residual| > 2.5σ" },
            ]}
          />
          <p className="mt-2 border-t border-border/60 pt-2 text-[9.5px] leading-relaxed text-faint">
            Diagnostics run on the chronological holdout only. The operational model is later refitted on all history, so residual behaviour can differ slightly
            from the final forecast.
          </p>
        </section>
      </div>

      <InsightPanel
        insights={payload.insights}
        title="What the residual checks imply"
        disclaimer="Passing these checks is not evidence of forecasting skill. A one-feature regression still cannot see news, earnings releases or regime shifts."
      />

      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/50 px-3.5 py-3 text-[10px] leading-relaxed text-faint">
        <CircleHelp size={12} className="mt-0.5 shrink-0" />
        <p>
          <span className="inline-flex items-center gap-1 text-muted"><AlertTriangle size={10} /> Statistical caveat:</span>{" "}
          these tests assume independent, identically distributed errors and become unreliable with short samples. Treat the verdicts as descriptive flags,
          not pass/fail certification.
        </p>
      </div>
    </div>
  );
}

function VerdictCard({
  title,
  tone,
  verdict,
  detail,
  note,
}: {
  title: string;
  tone: "accent" | "warn" | "neutral";
  verdict: string;
  detail: string;
  note: string;
}) {
  const dot = tone === "accent" ? "bg-accent" : tone === "warn" ? "bg-warn" : "bg-faint";
  const text = tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : "text-muted";
  return (
    <section className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">{title}</span>
        <span className={`inline-flex h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      </div>
      <p className={`text-[12.5px] font-semibold ${text}`}>{verdict}</p>
      <p className="tnum font-mono text-[10px] text-faint">{detail}</p>
      <p className="text-[10.5px] leading-relaxed text-muted">{note}</p>
    </section>
  );
}

type OutlierRow = DiagnosticsPayload["outliers"][number] & Record<string, unknown>;

function OutlierTable({ payload, currency }: { payload: DiagnosticsPayload; currency: string }) {
  const columns: Column<OutlierRow>[] = [
    { key: "date", header: "Date", render: (row) => <span className="tnum font-mono text-muted">{formatDate(row.date)}</span> },
    { key: "actual", header: "Actual", align: "right", render: (row) => <span className="tnum font-mono">{formatPrice(row.actual, "", 2)}</span> },
    { key: "predicted", header: "Predicted", align: "right", render: (row) => <span className="tnum font-mono">{formatPrice(row.predicted, "", 2)}</span> },
    {
      key: "residual",
      header: "Residual",
      align: "right",
      render: (row) => <span className={`tnum font-mono ${row.residual >= 0 ? "text-positive" : "text-negative"}`}>{formatPrice(row.residual, "", 2)}</span>,
    },
    { key: "z_score", header: "z-score", align: "right", render: (row) => <span className="tnum font-mono text-muted">{row.z_score === null ? "—" : row.z_score.toFixed(2)}</span> },
  ];
  return (
    <ChartCard
      eyebrow="Unusual observations"
      title="Largest holdout residuals"
      description={`Residuals beyond 2.5 standard deviations (${formatPrice(payload.stats.outlier_threshold, currency, 2)}). Large misses usually coincide with earnings gaps or market-wide shocks.`}
      bodyClassName="!px-0 !pb-0"
    >
      <DataTable
        columns={columns}
        rows={payload.outliers}
        getRowKey={(row, index) => `${row.date}-${index}`}
        dense
        emptyTitle="No flagged outliers"
        emptyDescription="No holdout residual exceeded the 2.5σ rule in this window."
        footer={payload.outliers.length ? `Top ${payload.outliers.length} by absolute residual · threshold ±${formatPrice(payload.stats.outlier_threshold, currency, 2)}` : "The model made no unusually large holdout errors."}
      />
    </ChartCard>
  );
}
