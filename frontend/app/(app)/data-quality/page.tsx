"use client";

import { useEffect, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, Search } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid, MetaBadges, SourceStrip, useTickerApi } from "@/components/page-kit";
import { DataTable, type Column } from "@/components/data-table";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { useDebounced } from "@/lib/hooks";
import { useTheme, useTicker } from "@/components/providers";
import { apiGet, API_BASE, qs } from "@/lib/api";
import { baseLayout, barTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import type { DataQualityPayload, DatasetPayload } from "@/lib/analytics-types";

type DatasetRow = DatasetPayload["rows"][number] & Record<string, unknown>;

export default function DataQualityPage() {
  const { data, error, isLoading, mutate } = useTickerApi<DataQualityPayload>("/api/analytics/data-quality");
  const { isDark } = useTheme();
  const pal = palette(isDark);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Historical Data"
        title="Historical data and quality audit"
        description="Inspect the exact observations used for modelling, distinguish raw responses from the cleaned dataset, and download a CSV for offline analysis."
        actions={
          data ? (
            <a href={`${API_BASE}/api/market-data/dataset.csv${qs({ ticker: data.meta.ticker, period: data.meta.period })}`}>
              <Button variant="primary">
                <Download size={12} /> Download cleaned CSV
              </Button>
            </a>
          ) : null
        }
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={300} rows={3} />}>
        {data ? <QualityContent payload={data} pal={pal} /> : null}
      </DataBoundary>
    </div>
  );
}

function QualityContent({ payload, pal }: { payload: DataQualityPayload; pal: ReturnType<typeof palette> }) {
  const { meta, metrics, series } = payload;
  const symbol = meta.currency_symbol;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query, 350);
  const [dataset, setDataset] = useState<DatasetPayload | null>(null);
  const [datasetError, setDatasetError] = useState<Error | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const { refreshToken } = useTicker();

  useEffect(() => {
    setPage(1);
  }, [debounced, sort, meta.ticker, meta.period]);

  useEffect(() => {
    let cancelled = false;
    setDatasetLoading(true);
    apiGet<DatasetPayload>(
      `/api/market-data/dataset${qs({
        ticker: meta.ticker,
        period: meta.period,
        page,
        page_size: 25,
        q: debounced,
        sort,
        _r: refreshToken,
      })}`,
    )
      .then((result) => {
        if (cancelled) return;
        setDataset(result);
        setDatasetError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setDatasetError(err);
      })
      .finally(() => {
        if (!cancelled) setDatasetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.ticker, meta.period, page, debounced, sort, refreshToken]);

  const rows = (dataset?.rows ?? []) as DatasetRow[];
  const columns: Column<DatasetRow>[] = [
    { key: "date", header: "Date", render: (row) => <span className="font-mono text-[11px] text-muted">{formatDate(row.date)}</span> },
    { key: "open", header: "Open", align: "right", render: (row) => formatPrice(row.open, symbol) },
    { key: "high", header: "High", align: "right", render: (row) => formatPrice(row.high, symbol) },
    { key: "low", header: "Low", align: "right", render: (row) => formatPrice(row.low, symbol) },
    { key: "close", header: "Adj. close", align: "right", render: (row) => <span className="font-medium">{formatPrice(row.close, symbol)}</span> },
    { key: "volume", header: "Volume", align: "right", render: (row) => formatNumber(row.volume, { bare: true }) },
  ];

  const missingEntries = Object.entries(metrics.missing_by_field);
  const modelReady = Math.max(0, metrics.cleaned_records - 1);
  const usablePct = metrics.usable_pct ?? null;

  return (
    <div className="space-y-4">
      <SourceStrip meta={meta} extra={<Badge tone="neutral">Raw → cleaned audit</Badge>} />

      <KpiGrid
        columns={4}
        items={[
          { label: "Raw records", value: formatNumber(metrics.raw_records, { bare: true, digits: 0 }), hint: "Rows returned by Yahoo Finance before any filtering.", footer: `${metrics.quality.missing_values} missing values reported` },
          { label: "Cleaned records", value: formatNumber(metrics.cleaned_records, { bare: true, digits: 0 }), hint: "Unique, chronological, positive-price rows retained for analysis.", footer: `${formatDate(metrics.first_date)} → ${formatDate(metrics.last_date)}`, emphasis: true },
          { label: "Model-ready rows", value: formatNumber(modelReady, { bare: true, digits: 0 }), hint: "Cleaned closes with a one-observation lag. The first row is dropped because it has no previous close.", footer: "Used by the regression dataset" },
          { label: "Usable observations", value: usablePct === null ? "—" : `${usablePct.toFixed(1)}%`, hint: "Share of raw records that survived cleaning.", footer: `${metrics.rows_removed} row(s) removed` },
          { label: "Missing OHLCV values", value: formatNumber(metrics.missing_total, { bare: true, digits: 0 }), hint: "Null values across Open, High, Low, Close and Volume after cleaning.", footer: "Zero means complete OHLCV" },
          { label: "Duplicate dates", value: formatNumber(metrics.duplicate_dates, { bare: true, digits: 0 }), hint: "Repeated timestamps collapsed during normalisation.", footer: `${metrics.unique_dates} unique dates` },
          { label: "Invalid prices", value: formatNumber(metrics.invalid_prices, { bare: true, digits: 0 }), hint: "Non-positive, non-numeric or unusable closes removed.", footer: "Prices must be strictly positive" },
          { label: "Close range", value: `${formatPrice(metrics.price_min, symbol)} – ${formatPrice(metrics.price_max, symbol)}`, hint: "Minimum and maximum adjusted close in the cleaned dataset.", footer: `Mean ${formatPrice(metrics.price_mean, symbol)}` },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Distribution"
          title="Adjusted close distribution"
          description="Histogram of cleaned closing prices across the selected window."
          footer={<ChartFootnote>Bin counts are observations, not volume.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Price distribution histogram"
            height={250}
            data={[
              barTrace({
                x: series.price_histogram.map((bin) => bin.center),
                y: series.price_histogram.map((bin) => bin.count),
                name: "Observations",
                color: pal.blue,
                opacity: 0.8,
                hovertemplate: "Near %{x:,.2f}: %{y} observations<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 250, xKind: "number", yKind: "number", showLegend: false, hovermode: "closest" })}
            resetKey={`dq-hist-${meta.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Completeness"
          title="Missing values by field"
          description="Count of null values per OHLCV column after cleaning."
          footer={<ChartFootnote>{metrics.missing_total === 0 ? "The cleaned dataset has no missing OHLCV values." : "Missing values were counted before the final clean view."}</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Missing values by field chart"
            height={250}
            data={[
              barTrace({
                x: missingEntries.map(([field]) => field),
                y: missingEntries.map(([, count]) => count),
                name: "Missing",
                color: pal.amber,
                hovertemplate: "%{x}: %{y} missing<extra></extra>",
              }),
            ]}
            layout={{
              ...baseLayout(pal, { height: 250, xKind: "category", yKind: "number", showLegend: false, hovermode: "closest" }),
              annotations:
                metrics.missing_total === 0
                  ? [
                      {
                        text: "No missing OHLCV values after cleaning",
                        x: 0.5,
                        y: 0.65,
                        xref: "paper",
                        yref: "paper",
                        showarrow: false,
                        font: { size: 11, color: pal.muted },
                      },
                    ]
                  : undefined,
            }}
            resetKey={`dq-missing-${meta.ticker}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Coverage"
          title="Daily observation count"
          description="One mark per calendar date; zero on weekends and exchange holidays."
          footer={<ChartFootnote>Calendar days, not trading days.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Daily observation count chart"
            height={240}
            data={[
              barTrace({
                x: series.daily_counts.map((point) => point.date),
                y: series.daily_counts.map((point) => point.observations),
                name: "Observations",
                color: pal.violet,
                opacity: 0.7,
                hovertemplate: "%{x}: %{y}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 240, yKind: "number", showLegend: false, hovermode: "x unified" })}
            resetKey={`dq-daily-${meta.ticker}`}
          />
        </ChartCard>

        <ChartCard
          eyebrow="Availability"
          title="Data availability by month"
          description="Monthly observation counts highlight gaps, listing changes or missing history."
          footer={<ChartFootnote>Yahoo Finance history can be incomplete, revised or adjusted later.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Data availability by month chart"
            height={240}
            data={[
              barTrace({
                x: series.availability.map((point) => point.month),
                y: series.availability.map((point) => point.observations),
                name: "Observations",
                color: pal.accent,
                opacity: 0.7,
                hovertemplate: "%{x}: %{y} observations<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 240, xKind: "category", yKind: "number", showLegend: false, hovermode: "closest" })}
            resetKey={`dq-monthly-${meta.ticker}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        eyebrow="Dataset"
        title="Cleaned observations"
        description="Search by date, toggle sort order and page through the exact rows used for analytics. This is the cleaned OHLCV view, before the lag transformation."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter date (YYYY-MM)"
                className="h-8 w-[180px] pl-8 font-mono text-[11px]"
                aria-label="Filter dataset by date"
              />
            </div>
            <Button variant="secondary" onClick={() => setSort((value) => (value === "asc" ? "desc" : "asc"))}>
              {sort === "desc" ? <ArrowDownWideNarrow size={12} /> : <ArrowUpNarrowWide size={12} />}
              {sort === "desc" ? "Newest first" : "Oldest first"}
            </Button>
            <a href={`${API_BASE}/api/market-data/dataset.csv${qs({ ticker: meta.ticker, period: meta.period })}`}>
              <Button variant="secondary">
                <Download size={12} /> CSV
              </Button>
            </a>
          </div>
        }
        footer={
          dataset ? (
            <span>
              Page {dataset.page} of {dataset.pages} · {dataset.total.toLocaleString()} matching rows ·{" "}
              {dataset.dataset_definition}
            </span>
          ) : null
        }
        bodyClassName="px-3 pb-3"
      >
        {datasetError ? (
          <div className="rounded-lg border border-negative/25 bg-negative/[0.04] px-4 py-6 text-[11.5px] text-muted">
            {datasetError.message}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => String(row.date)}
            maxHeight="440px"
            dense
            emptyTitle={datasetLoading ? "Loading observations…" : "No rows match this filter"}
            emptyDescription="Try a different month prefix or clear the filter."
          />
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-faint">
            Showing page {dataset?.page ?? 1} of {dataset?.pages ?? 1}
            {datasetLoading ? " · updating" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!dataset || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={!dataset || page >= dataset.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </ChartCard>

      <InsightPanel
        insights={payload.insights}
        title="Data quality findings"
        disclaimer="Cleaning rules: sort ascending, drop duplicate dates, require a positive close, and keep only rows with usable OHLCV. No prices are imputed or fabricated."
      />
    </div>
  );
}
