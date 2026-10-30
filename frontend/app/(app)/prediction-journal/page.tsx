"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  BookmarkPlus,
  CircleHelp,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { DataTable, type Column } from "@/components/data-table";
import { KpiGrid } from "@/components/page-kit";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, Label, SegmentedControl, Select } from "@/components/ui/primitives";
import { useTheme, useTicker, useToast } from "@/components/providers";
import { apiSend } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { baseLayout, barTrace, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatDateTime, formatNumber, formatPct, relativeTime } from "@/lib/format";
import type {
  AlertEventRecord,
  AlertRecord,
  AlertsPayload,
  PredictionRecord,
  PredictionsPayload,
} from "@/lib/analytics-types";

type StatusFilter = "all" | "pending" | "resolved";

export default function PredictionJournalPage() {
  const { ticker, period, splitRatio, refreshToken } = useTicker();
  const { pushToast } = useToast();
  const { data, error, isLoading, isValidating, mutate } = useApi<PredictionsPayload>(`/api/predictions?_r=${refreshToken}`);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const result = await apiSend<{ prediction: PredictionRecord }>("/api/predictions", "POST", {
        ticker,
        period,
        split_ratio: splitRatio,
        horizon: 1,
      });
      await mutate();
      pushToast({
        title: `${ticker} prediction saved`,
        description: `Predicted ${formatNumber(result.prediction.predicted_price, { bare: true, digits: 2 })} for ${formatDate(result.prediction.forecast_date)}. It resolves when the next actual observation exists.`,
        tone: "success",
      });
    } catch (err) {
      pushToast({ title: "Prediction not saved", description: (err as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Persistence · Prediction Journal & Alerts"
        title="Every saved forecast, audited"
        description="Saving a prediction stores its input, output, coefficients, sample window and holdout metrics. Pending records resolve automatically against the next actual close — no future prices are invented."
        actions={
          <>
            <Button variant="primary" onClick={save} loading={saving}>
              <BookmarkPlus size={12} /> Save {ticker} prediction
            </Button>
            <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
              <RefreshCw size={12} /> Refresh & resolve
            </Button>
          </>
        }
        meta={
          data ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{data.stats.total} records</Badge>
              <Badge tone={data.stats.pending ? "warn" : "accent"}>{data.stats.pending} pending</Badge>
              <Badge tone="info">{data.stats.resolved} resolved</Badge>
              {data.auto_resolved_now > 0 ? <Badge tone="accent">{data.auto_resolved_now} auto-resolved now</Badge> : null}
              <Badge tone="neutral">Split {Math.round(splitRatio * 100)}/{100 - Math.round(splitRatio * 100)}</Badge>
            </div>
          ) : null
        }
      />

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={240} rows={2} />}>
        {data ? (
          data.predictions.length === 0 ? (
            <EmptyState
              icon={<BookmarkPlus size={22} />}
              title="The journal is empty"
              description={`Save a prediction for ${ticker} using the current ${Math.round(splitRatio * 100)}/${100 - Math.round(splitRatio * 100)} split. It will be resolved automatically once the next trading observation is available.`}
              action={
                <Button variant="primary" onClick={save} loading={saving}>
                  <BookmarkPlus size={12} /> Save the first prediction
                </Button>
              }
            />
          ) : (
            <JournalContent payload={data} onResolved={() => mutate()} />
          )
        ) : null}
      </DataBoundary>

      <AlertsSection refreshToken={refreshToken} defaultTicker={ticker} onResolved={mutate} />
    </div>
  );
}

function JournalContent({ payload, onResolved }: { payload: PredictionsPayload; onResolved: () => void }) {
  const { isDark } = useTheme();
  const pal = palette(isDark);
  const { stats } = payload;
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tickerFilter, setTickerFilter] = useState<string>("all");

  const tickers = Array.from(new Set(payload.predictions.map((row) => row.ticker))).sort();
  const byTicker = (row: { ticker: string }) => tickerFilter === "all" || row.ticker === tickerFilter;
  const byStatus = (row: PredictionRecord) => status === "all" || row.status === status;
  const rows = payload.predictions.filter((row) => byTicker(row) && byStatus(row));
  const resolvedSeries = payload.series.predictions_vs_actual.filter(byTicker);
  const errorSeries = payload.series.error_over_time.filter(byTicker);

  return (
    <div className="space-y-4">
      <KpiGrid
        columns={6}
        items={[
          { label: "Saved predictions", value: stats.total.toString(), footer: `${tickers.length} ticker${tickers.length === 1 ? "" : "s"}` },
          { label: "Resolved", value: stats.resolved.toString(), tone: "positive", footer: "Actual close observed" },
          { label: "Pending", value: stats.pending.toString(), tone: stats.pending ? "negative" : "muted", footer: "Awaiting next observation" },
          { label: "Mean absolute error", value: stats.mae === null ? "—" : formatNumber(stats.mae, { bare: true, digits: 2 }), hint: "Average of |actual − predicted| across resolved records.", footer: "Price units, not currency-adjusted" },
          { label: "Mean percentage error", value: stats.mape === null ? "—" : `${stats.mape.toFixed(2)}%`, hint: "Average absolute percentage miss across resolved records.", footer: "Absolute error ÷ actual" },
          { label: "Directional hit rate", value: stats.directional_hit_rate === null ? "—" : `${stats.directional_hit_rate.toFixed(1)}%`, hint: "Share of resolved records where the predicted direction matched the actual direction.", footer: "Direction only, not magnitude" },
        ]}
      />

      <section className="panel-flat flex flex-wrap items-end gap-3 px-3.5 py-3">
        <div>
          <Label className="mb-1.5 block">Status</Label>
          <SegmentedControl<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
        </div>
        <label className="flex min-w-[170px] flex-col gap-1">
          <span className="text-[10px] text-faint">Ticker</span>
          <Select value={tickerFilter} onChange={(event) => setTickerFilter(event.target.value)} aria-label="Filter by ticker">
            <option value="all">All tickers</option>
            {tickers.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </Select>
        </label>
        <p className="flex-1 text-[10px] leading-relaxed text-faint">
          Filters apply to the table and the two timeline charts. Distribution charts stay global because the server aggregates resolved records.
        </p>
      </section>

      <JournalTable rows={rows} total={payload.predictions.length} />

      {resolvedSeries.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <ChartCard
            eyebrow="Accuracy"
            title="Saved predictions versus realised observations"
            description="Each resolved record contributes its forecast and the actual close that followed. Gaps reflect tickers with different calendars."
            footer={<ChartFootnote>{resolvedSeries.length} resolved record(s) · actual closes come from Yahoo Finance, not from the model.</ChartFootnote>}
          >
            <PlotlyChart
              ariaLabel="Saved predictions versus actual prices"
              height={300}
              data={[
                lineTrace({ x: resolvedSeries.map((row) => row.date), y: resolvedSeries.map((row) => row.predicted_price), name: "Predicted", color: pal.accent, width: 1.7, dash: "dot", hovertemplate: "%{x|%d %b %Y}: %{y:,.2f}<extra></extra>" }),
                lineTrace({ x: resolvedSeries.map((row) => row.date), y: resolvedSeries.map((row) => row.actual_price), name: "Actual", color: pal.blue, width: 1.7, hovertemplate: "%{x|%d %b %Y}: %{y:,.2f}<extra></extra>" }),
              ]}
              layout={baseLayout(pal, { height: 300, yKind: "number", yTitle: "Price", hovermode: "x unified" })}
              resetKey={`journal-vs-${tickerFilter}-${status}`}
            />
          </ChartCard>

          <ChartCard
            eyebrow="Error"
            title="Absolute percentage error over time"
            description="How large each realised miss was. A persistent upward drift would suggest the relationship is changing."
            footer={<ChartFootnote>Percentage error = |actual − predicted| ÷ actual × 100.</ChartFootnote>}
          >
            <PlotlyChart
              ariaLabel="Prediction percentage error over time"
              height={300}
              data={[
                barTrace({
                  x: errorSeries.map((row) => row.date),
                  y: errorSeries.map((row) => row.percentage_error),
                  name: "Absolute % error",
                  color: pal.amber,
                  opacity: 0.85,
                  hovertemplate: "%{x}: %{y:.2f}%<extra></extra>",
                }),
              ]}
              layout={baseLayout(pal, { height: 300, yKind: "percent", yTitle: "Absolute % error", showLegend: false, hovermode: "closest" })}
              resetKey={`journal-err-${tickerFilter}-${status}`}
            />
          </ChartCard>
        </div>
      ) : (
        <EmptyState
          compact
          title="No resolved predictions yet"
          description="Charts appear once at least one saved prediction has been matched to a subsequent actual close."
        />
      )}

      {stats.resolved > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            eyebrow="Distribution"
            title="Absolute percentage error distribution"
            description="All resolved records across every ticker. Narrow and centred near zero is better."
            footer={<ChartFootnote>{payload.series.error_histogram.reduce((sum, bin) => sum + bin.count, 0)} resolved errors aggregated server-side.</ChartFootnote>}
          >
            <PlotlyChart
              ariaLabel="Prediction error histogram"
              height={280}
              data={[
                barTrace({
                  x: payload.series.error_histogram.map((bin) => bin.center),
                  y: payload.series.error_histogram.map((bin) => bin.count),
                  name: "Errors",
                  color: pal.violet,
                  opacity: 0.85,
                  hovertemplate: "Near %{x:.2f}%: %{y}<extra></extra>",
                }),
              ]}
              layout={baseLayout(pal, { height: 280, xKind: "number", yKind: "number", showLegend: false, hovermode: "closest" })}
              resetKey="journal-histogram"
            />
          </ChartCard>

          <ChartCard
            eyebrow="Stability"
            title="Monthly mean absolute percentage error"
            description="Grouped by the forecast month. Sparse months are noisy; read the trend rather than individual bars."
            footer={<ChartFootnote>Counts below each month come from resolved records only.</ChartFootnote>}
          >
            <PlotlyChart
              ariaLabel="Monthly prediction error"
              height={280}
              data={[
                barTrace({
                  x: payload.monthly.map((row) => row.month),
                  y: payload.monthly.map((row) => row.mape),
                  name: "Monthly MAPE",
                  color: pal.teal,
                  opacity: 0.85,
                  hovertemplate: "%{x}: %{y:.2f}%<extra></extra>",
                }),
              ]}
              layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "percent", yTitle: "MAPE", showLegend: false, hovermode: "closest" })}
              resetKey="journal-monthly"
            />
          </ChartCard>
        </div>
      ) : null}

      {payload.by_ticker.length ? <TickerSummary payload={payload} /> : null}

      <InsightPanel
        insights={payload.insights}
        title="Journal read"
        disclaimer="The journal is a record of model outputs, not a record of profitable trades. No brokerage, fees, taxes or slippage are modelled."
      />

      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/50 px-3.5 py-3 text-[10px] leading-relaxed text-faint">
        <CircleHelp size={12} className="mt-0.5 shrink-0" />
        <p>
          Resolution runs whenever this journal loads, or when alerts are checked. A prediction resolves against the first market observation whose date is
          strictly after its base date. If no such observation exists yet, the record stays pending.
        </p>
      </div>

      <AlertsHint onResolved={onResolved} />
    </div>
  );
}

function AlertsHint({ onResolved }: { onResolved: () => void }) {
  return (
    <p className="text-[10px] leading-relaxed text-faint">
      Alerts are evaluated in-app only. Use the panel below to create rules and check them against fresh data.{" "}
      <button type="button" onClick={onResolved} className="text-muted underline decoration-border-strong underline-offset-2 hover:text-accent">
        Re-resolve predictions
      </button>
      .
    </p>
  );
}

type JournalRow = PredictionRecord & Record<string, unknown>;

function JournalTable({ rows, total }: { rows: PredictionRecord[]; total: number }) {
  const columns: Column<JournalRow>[] = [
    {
      key: "prediction_ts",
      header: "Saved",
      render: (row) => (
        <span className="tnum whitespace-nowrap font-mono text-[10.5px] text-muted" title={formatDateTime(row.prediction_ts)}>
          {formatDate(row.prediction_ts)} · {new Date(row.prediction_ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    { key: "ticker", header: "Ticker", render: (row) => <span className="font-mono text-[11px] font-medium text-ink">{row.ticker}</span> },
    { key: "base_date", header: "Base date", render: (row) => <span className="tnum font-mono text-[10.5px]">{formatDate(row.base_date, { short: true })}</span> },
    { key: "input_price", header: "Input", align: "right", render: (row) => <span className="tnum font-mono">{formatNumber(row.input_price, { bare: true, digits: 2 })}</span> },
    { key: "predicted_price", header: "Predicted", align: "right", render: (row) => <span className="tnum font-mono text-accent">{formatNumber(row.predicted_price, { bare: true, digits: 2 })}</span> },
    {
      key: "predicted_change_pct",
      header: "Pred. change",
      align: "right",
      render: (row) => <span className={`tnum font-mono ${row.predicted_change_pct >= 0 ? "text-positive" : "text-negative"}`}>{formatPct(row.predicted_change_pct)}</span>,
    },
    {
      key: "forecast_date",
      header: "Target date",
      render: (row) => (
        <span className="flex items-center gap-1 whitespace-nowrap text-[10.5px] text-muted">
          {formatDate(row.forecast_date, { short: true })}
          {row.forecast_date_verified ? <span title="Exchange calendar verified" className="text-accent">•</span> : <span title="Unverified weekday fallback" className="text-warn">•</span>}
        </span>
      ),
    },
    {
      key: "actual_price",
      header: "Actual",
      align: "right",
      render: (row) => <span className="tnum font-mono">{row.actual_price === null ? "—" : formatNumber(row.actual_price, { bare: true, digits: 2 })}</span>,
    },
    {
      key: "percentage_error",
      header: "Error %",
      align: "right",
      render: (row) => <span className="tnum font-mono text-muted">{row.percentage_error === null ? "—" : `${row.percentage_error.toFixed(2)}%`}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={row.status === "resolved" ? "accent" : "warn"}>{row.status === "resolved" ? "Resolved" : "Pending"}</Badge>,
    },
  ];

  return (
    <ChartCard
      eyebrow="Audit trail"
      title="Prediction records"
      description="Each row preserves the input, output, coefficients, training window and holdout metrics captured at save time."
      bodyClassName="!px-0 !pb-0"
    >
      <DataTable
        columns={columns}
        rows={rows as JournalRow[]}
        getRowKey={(row) => row.id}
        dense
        maxHeight="440px"
        emptyTitle="No rows match these filters"
        emptyDescription="Change the status or ticker filter to see saved predictions."
        footer={`${rows.length} of ${total} record(s) shown · prices are shown without a currency symbol because records can span tickers`}
      />
    </ChartCard>
  );
}

function TickerSummary({ payload }: { payload: PredictionsPayload }) {
  type SummaryRow = PredictionsPayload["by_ticker"][number] & Record<string, unknown>;
  const columns: Column<SummaryRow>[] = [
    { key: "ticker", header: "Ticker", render: (row) => <span className="font-mono text-[11px] font-medium text-ink">{row.ticker}</span> },
    { key: "count", header: "Resolved", align: "right", render: (row) => <span className="tnum font-mono">{row.count}</span> },
    { key: "mae", header: "MAE", align: "right", render: (row) => <span className="tnum font-mono">{row.mae === null ? "—" : formatNumber(row.mae, { bare: true, digits: 2 })}</span> },
    { key: "mape", header: "MAPE", align: "right", render: (row) => <span className="tnum font-mono">{row.mape === null ? "—" : `${row.mape.toFixed(2)}%`}</span> },
  ];
  return (
    <ChartCard
      eyebrow="By ticker"
      title="Resolved accuracy by symbol"
      description="Only resolved records are counted. Pending forecasts are excluded because no outcome exists yet."
      bodyClassName="!px-0 !pb-0"
    >
      <DataTable
        columns={columns}
        rows={payload.by_ticker as SummaryRow[]}
        getRowKey={(row) => row.ticker}
        dense
        footer="MAE is in each ticker's own price units; MAPE is comparable across tickers."
      />
    </ChartCard>
  );
}

function AlertsSection({
  refreshToken,
  defaultTicker,
  onResolved,
}: {
  refreshToken: number;
  defaultTicker: string;
  onResolved: () => void;
}) {
  const { data, error, isLoading, mutate } = useApi<AlertsPayload>(`/api/alerts?_r=${refreshToken}`);
  const { pushToast } = useToast();
  const [alertType, setAlertType] = useState("price_change_pct");
  const [alertTicker, setAlertTicker] = useState("");
  const [threshold, setThreshold] = useState("3");
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const needsThreshold = alertType === "price_change_pct" || alertType === "forecast_error_pct";
  const create = async () => {
    const parsed = Number(threshold);
    if (needsThreshold && (!threshold || Number.isNaN(parsed) || parsed <= 0)) {
      setFormError("Enter a positive threshold percentage for this alert type.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      await apiSend("/api/alerts", "POST", {
        alert_type: alertType,
        ticker: alertTicker.trim() ? alertTicker.trim().toUpperCase() : null,
        threshold: needsThreshold ? parsed : null,
      });
      await mutate();
      pushToast({ title: "Alert rule created", description: "It is enabled and will be checked when you evaluate alerts.", tone: "success" });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (alert: AlertRecord) => {
    setBusyId(alert.id);
    try {
      await apiSend(`/api/alerts/${alert.id}`, "PATCH", { enabled: !alert.enabled });
      await mutate();
    } catch (err) {
      pushToast({ title: "Could not update alert", description: (err as Error).message, tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (alert: AlertRecord) => {
    setBusyId(alert.id);
    try {
      await apiSend(`/api/alerts/${alert.id}`, "DELETE");
      await mutate();
      pushToast({ title: "Alert deleted", tone: "info" });
    } catch (err) {
      pushToast({ title: "Could not delete alert", description: (err as Error).message, tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const result = await apiSend<{ checked: number; new_events: AlertEventRecord[]; evaluated_at: string }>(
        `/api/alerts/evaluate?ticker=${encodeURIComponent(defaultTicker)}`,
        "POST",
      );
      await mutate();
      onResolved();
      pushToast({
        title: result.new_events.length ? `${result.new_events.length} new alert event(s)` : "No new alerts fired",
        description: `${result.checked} enabled rule(s) checked against fresh data at ${formatDateTime(result.evaluated_at)}.`,
        tone: result.new_events.length ? "info" : "success",
      });
    } catch (err) {
      pushToast({ title: "Alert check failed", description: (err as Error).message, tone: "error" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-3 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label className="mb-1 block">In-app alerts</Label>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
            <BellRing size={15} className="text-accent" /> Rules and recent events
          </h2>
          <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-muted">
            Rules are stored in SQLite and evaluated on demand. There is no background scheduler and no email delivery — this is labelled in-app alerting only.
          </p>
        </div>
        <Button variant="secondary" onClick={check} loading={checking}>
          <Bell size={12} /> Check alerts for {defaultTicker}
        </Button>
      </div>

      {data?.scheduling_note ? (
        <div className="rounded-lg border border-warn/25 bg-warn/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          {data.scheduling_note}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <Label>Create a rule</Label>
            <div className="mt-2 space-y-2.5">
              <label className="block">
                <span className="mb-1 block text-[10px] text-faint">Alert type</span>
                <Select value={alertType} onChange={(event) => setAlertType(event.target.value)} aria-label="Alert type">
                  {(data?.alert_types ?? []).map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.type.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </label>
              <p className="text-[9.5px] leading-relaxed text-faint">
                {data?.alert_types.find((option) => option.type === alertType)?.description ?? "Select an alert type."}
              </p>
              <label className="block">
                <span className="mb-1 block text-[10px] text-faint">Ticker (optional)</span>
                <Input
                  value={alertTicker}
                  onChange={(event) => setAlertTicker(event.target.value)}
                  placeholder="Blank = current ticker at evaluation"
                  className="h-8 font-mono text-[11px] uppercase"
                  spellCheck={false}
                />
              </label>
              {needsThreshold ? (
                <label className="block">
                  <span className="mb-1 block text-[10px] text-faint">Threshold (%)</span>
                  <Input
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.1"
                    className="h-8 font-mono text-[11px]"
                  />
                </label>
              ) : null}
              {formError ? <p className="text-[10px] text-negative">{formError}</p> : null}
              <Button variant="primary" onClick={create} loading={creating} className="w-full">
                Create alert rule
              </Button>
            </div>
          </section>

          <section className="panel px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Configured rules</Label>
              <Badge tone="neutral">{data?.alerts.length ?? 0}</Badge>
            </div>
            {data && data.alerts.length ? (
              <ul className="mt-2 space-y-1.5">
                {data.alerts.map((alert) => (
                  <li key={alert.id} className="rounded-lg border border-border bg-surface/60 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-ink">{TYPE_LABELS[alert.alert_type] ?? alert.alert_type}</p>
                        <p className="mt-0.5 text-[9.5px] text-faint">
                          {alert.ticker ?? "Current ticker at evaluation"}
                          {alert.threshold !== null ? ` · ${alert.threshold}% threshold` : ""} · created {formatDate(alert.created_ts, { short: true })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(alert)}
                          disabled={busyId === alert.id}
                          title={alert.enabled ? "Disable alert" : "Enable alert"}
                          className="disabled:opacity-50"
                        >
                          <Badge tone={alert.enabled ? "accent" : "neutral"}>
                            <Power size={9} /> {alert.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </button>
                        <IconButton label="Delete alert" onClick={() => remove(alert)} disabled={busyId === alert.id} className="!h-7 !w-7">
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">{isLoading ? "Loading rules…" : "No rules yet. Create one above."}</p>
            )}
          </section>
        </div>

        <section className="panel flex flex-col px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <Label>Recent events</Label>
            <Badge tone={data?.events.length ? "info" : "neutral"}>{data?.events.length ?? 0}</Badge>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            Events are created only when an enabled rule is exceeded during an evaluation. Duplicate events for the same day are suppressed.
          </p>
          {error ? <div className="mt-3"><ErrorState message={error.message} onRetry={() => mutate()} title="Alerts could not load" /></div> : null}
          {!error && data && data.events.length ? (
            <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-auto pr-1">
              {data.events.map((event) => (
                <li key={event.id} className="rounded-lg border border-border bg-surface/60 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={eventTone(event.alert_type)}>{TYPE_LABELS[event.alert_type] ?? event.alert_type}</Badge>
                    <span className="text-[9px] text-faint" title={formatDateTime(event.created_ts)}>
                      {relativeTime(event.created_ts)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{event.message}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-faint">{event.ticker ?? "—"} · {formatDateTime(event.created_ts)}</p>
                </li>
              ))}
            </ul>
          ) : !error ? (
            <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border-strong/70 px-4 py-10 text-center">
              <Bell size={18} className="mb-2 text-faint" />
              <p className="text-[11.5px] font-medium text-ink">{isLoading ? "Loading events…" : "No alert events yet"}</p>
              <p className="mt-1 max-w-xs text-[10.5px] leading-relaxed text-faint">
                Check alerts against fresh market data to evaluate enabled rules and populate this list.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

const TYPE_LABELS: Record<string, string> = {
  price_change_pct: "Daily price change",
  forecast_error_pct: "Forecast error",
  data_refresh_failure: "Data refresh failure",
  new_actual_observation: "New actual observation",
};

function eventTone(type: string): "accent" | "warn" | "negative" | "info" | "violet" {
  if (type === "price_change_pct") return "warn";
  if (type === "forecast_error_pct") return "negative";
  if (type === "new_actual_observation") return "accent";
  if (type === "data_refresh_failure") return "violet";
  return "info";
}
