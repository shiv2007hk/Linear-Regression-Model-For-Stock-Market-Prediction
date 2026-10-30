"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCw, TriangleAlert } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { useFeatured } from "@/components/marketing/use-featured";
import { formatDate, formatPct, formatPrice, toneFor } from "@/lib/format";
import { cn } from "@/components/ui/cn";
import type { FeaturedQuote } from "@/lib/types";

function utcStamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function Change({ quote }: { quote: FeaturedQuote }) {
  const tone = toneFor(quote.change_pct);
  return (
    <span
      className={cn(
        "font-mono text-[12px] font-medium",
        tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-[var(--muted)]",
      )}
    >
      {formatPct(quote.change_pct)}
    </span>
  );
}

function BoardRow({ quote }: { quote: FeaturedQuote }) {
  return (
    <tr className="group border-t border-border/60 transition-colors hover:bg-white/[0.025]">
      <td className="py-3.5 pl-5 pr-3">
        <Link href={`/dashboard?ticker=${encodeURIComponent(quote.ticker)}`} className="block">
          <span className="block text-[12.5px] font-medium text-ink">{quote.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-[var(--faint)]">
            {quote.ticker}
            <span className="text-border-strong">·</span>
            {quote.exchange}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        <span className="inline-flex items-center rounded-full border border-border/80 px-2 py-0.5 text-[10px] text-[var(--muted)]">
          {quote.region}
        </span>
      </td>
      <td className="px-3 py-3.5 text-right font-mono text-[12.5px] font-medium text-ink">
        {formatPrice(quote.price, quote.currency_symbol)}
      </td>
      <td className="px-3 py-3.5 text-right">
        <Change quote={quote} />
      </td>
      <td className="px-3 py-3.5">
        <div className="flex justify-end">
          <Sparkline values={quote.sparkline} width={84} height={24} positive={(quote.change_pct ?? 0) >= 0} />
        </div>
      </td>
      <td className="py-3.5 pl-3 pr-5 text-right">
        <Link
          href={`/dashboard?ticker=${encodeURIComponent(quote.ticker)}`}
          aria-label={`Open ${quote.name} in the workspace`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-[var(--muted)] transition-colors group-hover:border-accent/40 group-hover:text-accent"
        >
          <ArrowUpRight size={12} />
        </Link>
      </td>
    </tr>
  );
}

function BoardCard({ quote }: { quote: FeaturedQuote }) {
  return (
    <Link
      href={`/dashboard?ticker=${encodeURIComponent(quote.ticker)}`}
      className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5 transition-colors active:bg-white/[0.03]"
    >
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-ink">{quote.name}</p>
        <p className="mt-0.5 font-mono text-[10px] text-[var(--faint)]">
          {quote.ticker} · {quote.exchange}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-mono text-[12.5px] font-medium text-ink">{formatPrice(quote.price, quote.currency_symbol)}</p>
          <p className="mt-0.5">
            <Change quote={quote} />
          </p>
        </div>
        <Sparkline values={quote.sparkline} width={64} height={22} positive={(quote.change_pct ?? 0) >= 0} />
      </div>
    </Link>
  );
}

export function MarketBoard() {
  const { data, quotes, error, isLoading, mutate } = useFeatured();
  const observationDates = quotes
    .map((quote) => quote.as_of)
    .filter((value) => Boolean(value))
    .sort();
  const oldest = observationDates[0];
  const newest = observationDates[observationDates.length - 1];

  return (
    <section id="coverage" className="relative py-20 sm:py-24">
      <div className="mx-auto w-full max-w-[1280px] px-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[640px]">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              A live board of companies, not a screenshot.
            </h2>
            <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
              Twelve NSE and NASDAQ names are fetched through yfinance, cached for three minutes, and rendered with the
              exact price and previous close the API returned. Choose any row to open that symbol in the workspace.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
              Snapshot {utcStamp(data?.fetched_at)}
            </span>
            <Link
              href="/market-explorer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-ink"
            >
              Open Market Explorer
              <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.006))]">
          {isLoading ? (
            <div className="divide-y divide-border/60" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between px-5 py-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-white/[0.05]" />
                  <div className="h-4 w-20 animate-pulse rounded bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : error || !quotes.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <TriangleAlert size={20} className="text-warn" />
              <p className="text-[13px] font-medium text-ink">The live feed is offline</p>
              <p className="max-w-md text-[11.5px] leading-relaxed text-muted">
                {error?.message ??
                  "No quotes were retrieved. The board intentionally shows nothing rather than placeholder prices."}
              </p>
              <button
                type="button"
                onClick={() => mutate()}
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[11.5px] text-ink transition-colors hover:border-border-strong"
              >
                <RefreshCw size={11} /> Try the feed again
              </button>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">Live quotes for featured NSE and NASDAQ companies</caption>
                  <thead>
                    <tr className="text-[9.5px] uppercase tracking-[0.12em] text-[var(--faint)]">
                      <th scope="col" className="py-3 pl-5 pr-3 font-medium">Company</th>
                      <th scope="col" className="px-3 py-3 font-medium">Market</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Last close</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Day</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">30 sessions</th>
                      <th scope="col" className="py-3 pl-3 pr-5 text-right font-medium"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => (
                      <BoardRow key={quote.ticker} quote={quote} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden">
                {quotes.map((quote) => (
                  <BoardCard key={quote.ticker} quote={quote} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-col justify-between gap-2 text-[10px] text-[var(--faint)] sm:flex-row sm:items-center">
          <p>
            Quotes may be delayed or incomplete. Adjusted closes; day change compares the last two trading sessions.
            {data?.cached ? " This snapshot came from the server cache." : ""}
          </p>
          <p className="font-mono">Data: Yahoo Finance · Educational use only</p>
        </div>

        {data?.unavailable?.length ? (
          <p className="mt-1 text-[10px] text-[var(--faint)]">
            Not retrieved in this snapshot: {data.unavailable.map((item) => item.ticker).join(", ")}.
          </p>
        ) : null}

        {quotes.length && oldest && newest ? (
          <p className="mt-1 text-[10px] text-[var(--faint)]">
            Observation dates in this snapshot: {oldest === newest ? formatDate(oldest, { short: true }) : `${formatDate(oldest, { short: true })} – ${formatDate(newest, { short: true })}`}. Timestamps vary by market session.
          </p>
        ) : null}
      </div>
    </section>
  );
}
