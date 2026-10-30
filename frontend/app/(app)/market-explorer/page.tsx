"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Filter, RotateCw } from "lucide-react";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { ChartCard, ChartFootnote, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { KpiGrid, MetaBadges, SourceStrip, useTickerApi } from "@/components/page-kit";
import { DataTable, type Column } from "@/components/data-table";
import { Badge, Button, Input, Label, SegmentedControl } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers";
import { baseLayout, barTrace, gradientFill, lineTrace, palette } from "@/lib/chart-theme";
import { formatDate, formatDateTime, formatNumber, formatPct, formatPrice, formatSigned, toneFor } from "@/lib/format";
import type { MarketPayload } from "@/lib/analytics-types";

type Interval = "1d" | "1wk" | "1mo";
type OhlcvRow = MarketPayload["ohlcv"][number] & Record<string, unknown>;

export default function MarketExplorerPage() {
  const [interval, setInterval] = useState<Interval>("1d");
  const [showCustom, setShowCustom] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      interval,
      ...(appliedRange ? { start: appliedRange.start, end: appliedRange.end } : {}),
    }),
    [interval, appliedRange],
  );
  const { data, error, isLoading, isValidating, mutate } = useTickerApi<MarketPayload>("/api/market-data", params);
  const { isDark } = useTheme();
  const pal = palette(isDark);

  const applyRange = () => {
    if (!startInput || !endInput) {
      setRangeError("Choose both a start and an end date.");
      return;
    }
    if (startInput >= endInput) {
      setRangeError("The start date must be earlier than the end date.");
      return;
    }
    setRangeError(null);
    setAppliedRange({ start: startInput, end: endInput });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Market Explorer"
        title="Explore historical prices"
        description="Candlesticks, adjusted closes, volume and daily moves for any Yahoo Finance symbol, with an interval selector and an optional custom date range."
        actions={
          <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
            <RotateCw size={12} className={isValidating ? "animate-spin" : undefined} /> Reload query
          </Button>
        }
        meta={data ? <MetaBadges meta={data.meta} /> : null}
      />

      <section className="panel-flat flex flex-wrap items-end gap-3 px-3.5 py-3">
        <div>
          <Label className="mb-1.5 block">Observation interval</Label>
          <SegmentedControl<Interval>
            value={interval}
            onChange={(value) => {
              setInterval(value);
              setAppliedRange(null);
            }}
            options={[
              { value: "1d", label: "Daily" },
              { value: "1wk", label: "Weekly" },
              { value: "1mo", label: "Monthly" },
            ]}
          />
        </div>
        <div className="ml-auto flex items-end gap-2">
          <Button variant={showCustom ? "primary" : "secondary"} onClick={() => setShowCustom((value) => !value)}>
            <Filter size={12} /> {showCustom ? "Hide custom range" : "Custom range"}
          </Button>
        </div>
        {showCustom ? (
          <div className="flex w-full flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-[10px] text-faint">
              Start date
              <Input type="date" value={startInput} max={endInput || undefined} onChange={(event) => setStartInput(event.target.value)} className="h-8 w-[150px] font-mono" />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-faint">
              End date
              <Input type="date" value={endInput} min={startInput || undefined} onChange={(event) => setEndInput(event.target.value)} className="h-8 w-[150px] font-mono" />
            </label>
            <Button variant="primary" onClick={applyRange}>
              Apply range
            </Button>
            {appliedRange ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setAppliedRange(null);
                  setStartInput("");
                  setEndInput("");
                  setRangeError(null);
                }}
              >
                Clear custom range
              </Button>
            ) : null}
            {rangeError ? <p className="text-[10.5px] text-negative">{rangeError}</p> : <p className="text-[10px] text-faint">Yahoo Finance applies these bounds directly.</p>}
          </div>
        ) : null}
        {appliedRange ? (
          <p className="w-full text-[10px] text-muted">
            Showing {appliedRange.start} → {appliedRange.end} · the top-bar period selector is ignored while a custom range is active.
          </p>
        ) : null}
      </section>

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={380} rows={2} />}>
        {data ? <MarketExplorerContent payload={data} pal={pal} interval={interval} /> : null}
      </DataBoundary>
    </div>
  );
}

function MarketExplorerContent({
  payload,
  pal,
  interval,
}: {
  payload: MarketPayload;
  pal: ReturnType<typeof palette>;
  interval: Interval;
}) {
  const { summary, ohlcv, meta } = payload;
  const symbol = summary.currency_symbol;
  const dates = ohlcv.map((row) => row.date);
  const closes = ohlcv.map((row) => row.close);
  const dailyPct = ohlcv.map((row, i) => (i === 0 ? null : ((row.close / ohlcv[i - 1].close - 1) * 100)));
  const averageVolume = ohlcv.reduce((total, row) => total + row.volume, 0) / Math.max(ohlcv.length, 1);
  const highest = Math.max(...closes);
  const lowest = Math.min(...closes);
  const highestRow = ohlcv.find((row) => row.close === highest);
  const lowestRow = ohlcv.find((row) => row.close === lowest);

  const recent = [...ohlcv].reverse().slice(0, 15) as OhlcvRow[];
  const columns: Column<OhlcvRow>[] = [
    { key: "date", header: "Date", render: (row) => <span className="font-mono text-[11px] text-muted">{formatDate(row.date)}</span> },
    { key: "open", header: "Open", align: "right", render: (row) => formatPrice(row.open, symbol) },
    { key: "high", header: "High", align: "right", render: (row) => formatPrice(row.high, symbol) },
    { key: "low", header: "Low", align: "right", render: (row) => formatPrice(row.low, symbol) },
    { key: "close", header: "Adj. close", align: "right", render: (row) => <span className="font-medium">{formatPrice(row.close, symbol)}</span> },
    { key: "volume", header: "Volume", align: "right", render: (row) => formatNumber(row.volume, { bare: true }) },
    {
      key: "change",
      header: "Change",
      align: "right",
      render: (row) => {
        const index = ohlcv.findIndex((item) => item.date === row.date);
        if (index <= 0) return <span className="text-faint">—</span>;
        const value = (row.close / ohlcv[index - 1].close - 1) * 100;
        return <span className={value >= 0 ? "text-positive" : "text-negative"}>{formatPct(value)}</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <SourceStrip
        meta={meta}
        extra={
          <>
            <Badge tone="neutral">{interval === "1d" ? "Daily" : interval === "1wk" ? "Weekly" : "Monthly"} interval</Badge>
            <span>Last retrieval {formatDateTime(meta.retrieved_at)}</span>
          </>
        }
      />

      <KpiGrid
        columns={6}
        items={[
          { label: "Latest price", value: formatPrice(summary.latest_price, symbol), delta: summary.change_pct, emphasis: true, footer: formatDate(summary.period_end) },
          { label: "Absolute change", value: formatSigned(summary.change, symbol), tone: toneFor(summary.change), footer: "vs previous observation" },
          { label: "Percentage change", value: formatPct(summary.change_pct), tone: toneFor(summary.change_pct), footer: "one observation" },
          { label: "Highest in range", value: formatPrice(highest, symbol), footer: highestRow ? formatDate(highestRow.date) : "—" },
          { label: "Lowest in range", value: formatPrice(lowest, symbol), footer: lowestRow ? formatDate(lowestRow.date) : "—" },
          { label: "Average volume", value: formatNumber(averageVolume, { bare: true, compact: true }), footer: `${ohlcv.length.toLocaleString()} observations` },
        ]}
      />

      <ChartCard
        eyebrow="Candlesticks"
        title="Adjusted OHLC price action"
        description="Each candle shows open, high, low and adjusted close. Gaps reflect non-trading periods, not missing data."
        actions={<Badge tone="accent">OHLC · adjusted</Badge>}
        footer={<ChartFootnote>Interval: {interval} · {ohlcv.length} candles · Yahoo Finance via yfinance</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Candlestick price chart"
          height={400}
          data={[
            {
              type: "candlestick",
              x: dates,
              open: ohlcv.map((row) => row.open),
              high: ohlcv.map((row) => row.high),
              low: ohlcv.map((row) => row.low),
              close: closes,
              name: summary.ticker,
              increasing: { line: { color: pal.accent, width: 1 }, fillcolor: pal.accent },
              decreasing: { line: { color: pal.red, width: 1 }, fillcolor: pal.red },
              whiskerwidth: 0.35,
            },
          ]}
          layout={baseLayout(pal, { height: 400, currencySymbol: symbol, yKind: "currency", showLegend: false, hovermode: "x unified" })}
          resetKey={`explorer-candles-${summary.ticker}-${interval}`}
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard eyebrow="Close series" title="Adjusted closing price" description="A continuous view of the same selected observations.">
          <PlotlyChart
            ariaLabel="Adjusted closing price chart"
            height={260}
            data={[
              lineTrace({
                x: dates,
                y: closes,
                name: "Adjusted close",
                color: pal.blue,
                width: 1.7,
                fill: "tozeroy",
                fillColor: gradientFill(pal),
                hovertemplate: "Close: %{y:,.2f}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 260, currencySymbol: symbol, yKind: "currency", showLegend: false })}
            resetKey={`explorer-close-${summary.ticker}-${interval}`}
          />
        </ChartCard>

        <ChartCard eyebrow="Liquidity" title="Volume bars" description="Shares traded per observation; useful context for price moves.">
          <PlotlyChart
            ariaLabel="Volume bar chart"
            height={260}
            data={[
              barTrace({
                x: dates,
                y: ohlcv.map((row) => row.volume),
                name: "Volume",
                color: pal.violet,
                opacity: 0.5,
                hovertemplate: "Volume: %{y:,.0f}<extra></extra>",
              }),
            ]}
            layout={baseLayout(pal, { height: 260, yKind: "compact", showLegend: false })}
            resetKey={`explorer-volume-${summary.ticker}-${interval}`}
          />
        </ChartCard>
      </div>

      <ChartCard eyebrow="Momentum" title="Daily percentage change" description="One-observation returns across the selected window; green bars are positive.">
        <PlotlyChart
          ariaLabel="Daily percentage change chart"
          height={230}
          data={[
            {
              type: "bar",
              x: dates,
              y: dailyPct,
              name: "Daily change",
              marker: { color: dailyPct.map((value) => ((value ?? 0) >= 0 ? pal.accent : pal.red)) },
              hovertemplate: "%{y:.2f}%<extra></extra>",
            },
          ]}
          layout={baseLayout(pal, { height: 230, yKind: "percent", showLegend: false })}
          resetKey={`explorer-change-${summary.ticker}-${interval}`}
        />
      </ChartCard>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard
          eyebrow="Raw records"
          title="Most recent OHLCV observations"
          description="The latest 15 cleaned rows, newest first. Download the full cleaned dataset in Historical Data."
          bodyClassName="px-3 pb-3"
        >
          <DataTable
            columns={columns}
            rows={recent}
            getRowKey={(row) => String(row.date)}
            maxHeight="380px"
            dense
            footer={`${ohlcv.length.toLocaleString()} observations in the current window · ${meta.price_label}`}
          />
        </ChartCard>

        <section className="panel px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Stock overview</Label>
              <h3 className="mt-1 text-[15px] font-semibold text-ink">{meta.name}</h3>
              <p className="mt-0.5 text-[10.5px] text-faint">
                {meta.exchange} · {meta.quote_type ?? "Equity"}
              </p>
            </div>
            {meta.website ? (
              <a
                href={meta.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline"
              >
                Website <ExternalLink size={10} />
              </a>
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            {[
              ["Sector", meta.sector ?? "—"],
              ["Industry", meta.industry ?? "—"],
              ["Country", meta.country ?? "—"],
              ["Currency", summary.currency],
              ["Market cap", meta.market_cap ? formatNumber(meta.market_cap, { currency: summary.currency, compact: true }) : "—"],
              ["Trailing P/E", meta.trailing_pe ? meta.trailing_pe.toFixed(2) : "—"],
              ["Beta", meta.beta !== null && meta.beta !== undefined ? meta.beta.toFixed(2) : "—"],
              ["Last dividend", meta.last_dividend ? `${formatPrice(meta.last_dividend.amount, symbol)} on ${formatDate(meta.last_dividend.date)}` : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9.5px] uppercase tracking-wider text-faint">{label}</dt>
                <dd className="mt-0.5 truncate text-[11.5px] text-muted" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {meta.summary ? (
            <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted">{meta.summary}</p>
          ) : null}
          <p className="mt-3 text-[9.5px] leading-relaxed text-faint">
            Profile metadata is retrieved from Yahoo Finance and may be outdated or incomplete. Prices are adjusted close; corporate actions may
            change historical values.
          </p>
        </section>
      </div>
    </div>
  );
}
