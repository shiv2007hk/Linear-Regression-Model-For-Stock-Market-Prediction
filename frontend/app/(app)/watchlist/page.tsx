"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LineChart, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ChartCard, ChartFootnote, InsightPanel, PageHeader } from "@/components/dashboard-ui";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { DataBoundary, PanelSkeleton } from "@/components/data-boundary";
import { KpiGrid } from "@/components/page-kit";
import { Sparkline } from "@/components/sparkline";
import { Badge, Button, EmptyState, IconButton, Input, Label } from "@/components/ui/primitives";
import { useTheme, useTicker, useToast } from "@/components/providers";
import { apiSend, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { baseLayout, lineTrace, palette, seriesColor } from "@/lib/chart-theme";
import { formatDate, formatDateTime, formatPct, formatPrice, relativeTime } from "@/lib/format";
import type { WatchlistPayload } from "@/lib/types";

const SYMBOL_RE = /^[A-Z0-9.^=_-]{1,24}$/;

export default function WatchlistPage() {
  const { refreshToken, ticker, setTicker } = useTicker();
  const { data, error, isLoading, isValidating, mutate } = useApi<WatchlistPayload>(`/api/watchlist?_r=${refreshToken}`);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const { pushToast } = useToast();
  const router = useRouter();

  const tracked = useMemo(() => new Set(data?.items.map((item) => item.ticker) ?? []), [data]);

  const add = async (raw: string) => {
    const symbol = raw.trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      setAddError("Use a Yahoo Finance symbol such as AAPL, INFY.NS or ^NSEI.");
      return;
    }
    setBusy(symbol);
    setAddError(null);
    try {
      await apiSend("/api/watchlist", "POST", { ticker: symbol });
      setInput("");
      await mutate();
      pushToast({ title: `${symbol} added`, description: "Live quote loads from Yahoo Finance on the next refresh.", tone: "success" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not add this ticker.";
      setAddError(message);
      pushToast({ title: "Watchlist unchanged", description: message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number, symbol: string) => {
    setBusy(symbol);
    try {
      await apiSend(`/api/watchlist/${id}`, "DELETE");
      await mutate();
      pushToast({ title: `${symbol} removed`, tone: "info" });
    } catch (err) {
      pushToast({ title: "Remove failed", description: (err as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const analyze = (symbol: string) => {
    setTicker(symbol);
    router.push("/dashboard");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research · Watchlist"
        title="Live watchlist"
        description="Tickers are persisted in SQLite and quoted from Yahoo Finance on every load. Comparative charts are normalised per stock, so currencies are never mixed."
        actions={
          <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
            <RefreshCw size={12} /> Refresh quotes
          </Button>
        }
        meta={
          data ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{data.analytics.count} tracked</Badge>
              <Badge tone={data.analytics.with_quotes === data.analytics.count ? "accent" : "warn"}>
                {data.analytics.with_quotes} with live quotes
              </Badge>
              <Badge tone="info">Persisted in SQLite</Badge>
              {data.analytics.last_update ? <Badge tone="neutral">updated {relativeTime(data.analytics.last_update)}</Badge> : null}
            </div>
          ) : null
        }
      />

      <section className="panel-flat flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label className="mb-1.5 block">Add a ticker</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setAddError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void add(input);
              }}
              placeholder="e.g. INFY.NS, AAPL, ^NSEI"
              spellCheck={false}
              className="h-8 w-full max-w-[280px] font-mono text-[11.5px] uppercase"
              aria-label="Ticker symbol to add to the watchlist"
            />
            <Button variant="primary" onClick={() => add(input)} loading={busy === input.trim().toUpperCase()} disabled={!input.trim()}>
              <Plus size={12} /> Add ticker
            </Button>
            <Button
              variant="secondary"
              onClick={() => add(ticker)}
              disabled={tracked.has(ticker) || busy !== null}
              title={tracked.has(ticker) ? `${ticker} is already tracked` : `Add the global ticker ${ticker}`}
            >
              <LineChart size={12} /> Add {ticker}
            </Button>
          </div>
          {addError ? <p className="mt-1.5 text-[10.5px] text-negative">{addError}</p> : null}
        </div>
        <p className="max-w-xs text-[10px] leading-relaxed text-faint">
          Adding validates the symbol against live market data. Duplicate symbols are rejected by the database with HTTP 409.
        </p>
      </section>

      <DataBoundary loading={isLoading} error={error} onRetry={() => mutate()} skeleton={<PanelSkeleton height={220} rows={2} />}>
        {data ? (
          data.items.length === 0 ? (
            <EmptyState
              icon={<LineChart size={22} />}
              title="Your watchlist is empty"
              description="Add a Yahoo Finance symbol above. Quotes, sparklines, volatility and stored model evaluations will appear here."
              action={
                <Button variant="primary" onClick={() => add(ticker)} loading={busy === ticker}>
                  <Plus size={12} /> Add {ticker}
                </Button>
              }
            />
          ) : (
            <WatchlistContent
              payload={data}
              busy={busy}
              onRemove={remove}
              onAnalyze={analyze}
            />
          )
        ) : null}
      </DataBoundary>
    </div>
  );
}

function WatchlistContent({
  payload,
  busy,
  onRemove,
  onAnalyze,
}: {
  payload: WatchlistPayload;
  busy: string | null;
  onRemove: (id: number, ticker: string) => void;
  onAnalyze: (ticker: string) => void;
}) {
  const { isDark } = useTheme();
  const pal = palette(isDark);
  const { analytics, series } = payload;
  const quotes = payload.items.filter((item) => item.quote).map((item) => item.quote!);
  const best = quotes.find((quote) => quote.ticker === analytics.best);
  const worst = quotes.find((quote) => quote.ticker === analytics.worst);
  const volatile = quotes.find((quote) => quote.ticker === analytics.most_volatile);

  return (
    <div className="space-y-4">
      <KpiGrid
        columns={5}
        items={[
          { label: "Tracked tickers", value: analytics.count.toString(), footer: `${payload.items.length} persisted rows` },
          { label: "Live quotes", value: `${analytics.with_quotes} / ${analytics.count}`, tone: analytics.with_quotes === analytics.count ? "positive" : "negative", footer: analytics.last_update ? formatDateTime(analytics.last_update) : "No quote retrieved yet" },
          { label: "Best 6-month return", value: best ? `${best.currency_symbol}${best.latest_price.toFixed(2)}` : "—", delta: best?.total_return_pct ?? null, deltaLabel: best ? `${best.ticker} · total return` : undefined },
          { label: "Weakest 6-month return", value: worst ? `${worst.currency_symbol}${worst.latest_price.toFixed(2)}` : "—", delta: worst?.total_return_pct ?? null, deltaLabel: worst ? `${worst.ticker} · total return` : undefined },
          { label: "Most volatile", value: volatile ? `${volatile.volatility_pct.toFixed(2)}%` : "—", footer: volatile ? `${volatile.ticker} · annualised, daily returns` : undefined },
        ]}
      />

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {payload.items.map((item) => {
          const quote = item.quote;
          const model = item.model_status;
          const positive = (quote?.change_pct ?? 0) >= 0;
          return (
            <article key={item.id} className="panel flex flex-col gap-3 px-3.5 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onAnalyze(item.ticker)}
                    className="group inline-flex items-center gap-1 font-mono text-[13px] font-medium tracking-wide text-ink hover:text-accent"
                    title={`Load ${item.ticker} across the app`}
                  >
                    {item.ticker}
                    <ArrowUpRight size={12} className="text-faint transition-colors group-hover:text-accent" />
                  </button>
                  <p className="mt-0.5 truncate text-[10.5px] text-faint">{quote?.name ?? "Quote unavailable"}</p>
                </div>
                <IconButton label={`Remove ${item.ticker} from watchlist`} onClick={() => onRemove(item.id, item.ticker)} disabled={busy === item.ticker}>
                  <Trash2 size={13} />
                </IconButton>
              </div>

              {quote ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="tnum font-mono text-[1.3rem] font-medium leading-none tracking-[-0.02em] text-ink">
                        {formatPrice(quote.latest_price, quote.currency_symbol)}
                      </p>
                      <p className={`mt-1 tnum font-mono text-[10.5px] ${positive ? "text-positive" : "text-negative"}`}>
                        {quote.change >= 0 ? "▲" : "▼"} {formatPrice(Math.abs(quote.change), quote.currency_symbol)} · {formatPct(quote.change_pct)}
                      </p>
                    </div>
                    <Sparkline values={quote.sparkline} positive={positive} width={104} height={32} />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 border-t border-border/60 pt-2.5">
                    <Mini label="6M return" value={formatPct(quote.total_return_pct)} tone={quote.total_return_pct >= 0 ? "positive" : "negative"} />
                    <Mini label="Volatility" value={`${quote.volatility_pct.toFixed(1)}%`} />
                    <Mini label="Last close" value={formatDate(quote.last_date, { short: true })} muted />
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                    {model ? (
                      <div className="flex flex-wrap gap-1">
                        <Badge tone="info">R² {model.r2 === null ? "—" : model.r2.toFixed(3)}</Badge>
                        <Badge tone="neutral">MAE {model.mae === null ? "—" : formatPrice(model.mae, quote.currency_symbol)}</Badge>
                      </div>
                    ) : (
                      <span className="text-[9.5px] text-faint">No stored model evaluation</span>
                    )}
                    <Button variant="ghost" onClick={() => onAnalyze(item.ticker)} className="!h-6 !px-2 !text-[10.5px]">
                      Analyze <ArrowUpRight size={10} />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-warn/40 bg-warn/[0.04] px-3 py-4 text-[10.5px] leading-relaxed text-muted">
                  Yahoo Finance returned no usable history for this symbol. Refresh to retry, or remove it from the watchlist.
                </div>
              )}
            </article>
          );
        })}
      </div>

      <ChartCard
        eyebrow="Relative performance"
        title="Normalised performance, 6-month window"
        description="Every stock starts at 100 at the beginning of its own 6-month window. This compares shape and relative move without mixing currencies."
        footer={<ChartFootnote>No currency conversion is applied. Absolute price levels are never compared across tickers.</ChartFootnote>}
      >
        <PlotlyChart
          ariaLabel="Normalised performance of watchlist stocks"
          height={320}
          data={series.normalized.map((entry, index) =>
            lineTrace({
              x: entry.points.map((point) => point.date),
              y: entry.points.map((point) => point.value),
              name: entry.ticker,
              color: seriesColor(index, pal),
              width: 1.6,
              hovertemplate: `${entry.ticker}: %{y:,.2f}<extra></extra>`,
            }),
          )}
          layout={baseLayout(pal, { height: 320, yKind: "number", yTitle: "Index (start = 100)", hovermode: "x unified" })}
          resetKey="watchlist-normalized"
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          eyebrow="Six-month return"
          title="Total return by ticker"
          description="Simple price return across each stock's available 6-month history. Positive and negative bars use the same scale."
          footer={<ChartFootnote>Adjusted closes are used when Yahoo Finance provides them.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Watchlist total returns by ticker"
            height={280}
            data={[
              {
                type: "bar",
                x: series.returns_bar.map((row) => row.ticker),
                y: series.returns_bar.map((row) => row.total_return_pct),
                marker: { color: series.returns_bar.map((row) => (row.total_return_pct >= 0 ? pal.accent : pal.red)) },
                text: series.returns_bar.map((row) => formatPct(row.total_return_pct)),
                textposition: "outside",
                textfont: { size: 9.5, color: pal.muted },
                hovertemplate: "%{x}: %{y:+.2f}%<extra></extra>",
                name: "Total return",
              },
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "category", yKind: "percent", showLegend: false, hovermode: "closest" })}
            resetKey="watchlist-returns"
          />
        </ChartCard>

        <ChartCard
          eyebrow="Risk and return"
          title="Annualised volatility versus return"
          description="Each point is one stock. Higher return with lower volatility is generally preferable, but six months is a short sample."
          footer={<ChartFootnote>Volatility is the standard deviation of daily returns × √252, in percent.</ChartFootnote>}
        >
          <PlotlyChart
            ariaLabel="Risk-return scatter of watchlist stocks"
            height={280}
            data={[
              {
                type: "scatter",
                mode: "markers+text",
                x: series.risk_return.map((row) => row.volatility_pct),
                y: series.risk_return.map((row) => row.return_pct),
                text: series.risk_return.map((row) => row.ticker),
                textposition: "top center",
                textfont: { size: 9.5, color: pal.muted },
                marker: { color: pal.accent, size: 9, opacity: 0.85, line: { color: pal.surface, width: 1 } },
                hovertemplate: "%{text}<br>Volatility %{x:.2f}%<br>Return %{y:+.2f}%<extra></extra>",
                name: "Watchlist",
              },
              lineTrace({ x: [0, Math.max(...series.risk_return.map((row) => row.volatility_pct), 1)], y: [0, 0], name: "Zero return", color: pal.faint, width: 1, dash: "dash", hovertemplate: "Zero return<extra></extra>" }),
            ]}
            layout={baseLayout(pal, { height: 280, xKind: "number", yKind: "percent", xTitle: "Annualised volatility (%)", yTitle: "6-month return", hovermode: "closest" })}
            resetKey="watchlist-risk"
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ChartCard
          eyebrow="Volatility ranking"
          title="Annualised volatility, highest first"
          description="Volatility widens the plausible range of any forecast, regardless of the model's point estimate."
        >
          <PlotlyChart
            ariaLabel="Volatility ranking of watchlist stocks"
            height={Math.max(200, analytics.volatility_ranking.length * 38)}
            data={[
              {
                type: "bar",
                orientation: "h",
                x: [...analytics.volatility_ranking].reverse().map((row) => row.volatility_pct),
                y: [...analytics.volatility_ranking].reverse().map((row) => row.ticker),
                marker: { color: pal.amber, opacity: 0.85 },
                hovertemplate: "%{y}: %{x:.2f}%<extra></extra>",
                name: "Volatility",
              },
            ]}
            layout={baseLayout(pal, { height: Math.max(200, analytics.volatility_ranking.length * 38), xKind: "number", yKind: "number", showLegend: false, hovermode: "closest", margin: { l: 84 } })}
            resetKey="watchlist-volatility"
          />
        </ChartCard>

        <InsightPanel
          insights={payload.insights}
          title="Watchlist read"
          disclaimer="This is a research watchlist stored locally, not a brokerage portfolio. No ownership, execution or advice is implied."
        />
      </div>

      <p className="text-[10px] leading-relaxed text-faint">
        Quotes are retrieved on demand from Yahoo Finance and may be delayed. The watchlist persists in SQLite across restarts; model status comes from the
        latest stored Model Lab run for each ticker.
      </p>
    </div>
  );
}

function Mini({ label, value, tone, muted }: { label: string; value: string; tone?: "positive" | "negative"; muted?: boolean }) {
  return (
    <div>
      <p className="micro-label">{label}</p>
      <p className={`tnum mt-0.5 font-mono text-[11px] ${tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : muted ? "text-faint" : "text-muted"}`}>
        {value}
      </p>
    </div>
  );
}
