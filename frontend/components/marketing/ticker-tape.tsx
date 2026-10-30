"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useFeatured } from "@/components/marketing/use-featured";
import { formatPct, formatPrice, toneFor } from "@/lib/format";
import { cn } from "@/components/ui/cn";

export function TickerTape() {
  const { quotes, data, error, isLoading } = useFeatured();

  return (
    <div className="relative mt-6 border-y border-border/70 bg-white/[0.015]">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-5 pb-2 pt-3 sm:px-7">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", quotes.length ? "animate-ping bg-accent" : "")} />
            <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", quotes.length ? "bg-accent" : "bg-warn")} />
          </span>
          <span className="font-mono uppercase tracking-[0.14em] text-[var(--faint)]">Live board</span>
          <span className="hidden text-[var(--faint)] sm:inline">
            {quotes.length ? `${quotes.length} companies · Yahoo Finance · may be delayed` : error ? "feed offline" : "connecting"}
          </span>
        </div>
        <a href="#coverage" className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--muted)] transition-colors hover:text-ink">
          Open the board
          <ArrowUpRight size={11} />
        </a>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden px-5 pb-3 sm:px-7" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-9 w-[172px] shrink-0 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : quotes.length ? (
        <div className="tape pb-2.5">
          <div className="tape-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                {quotes.map((quote) => (
                  <Link
                    key={`${copy}-${quote.ticker}`}
                    href={`/dashboard?ticker=${encodeURIComponent(quote.ticker)}`}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className="tape-item flex shrink-0 items-center gap-2.5 border-r border-border/60 px-4 py-2"
                  >
                    <span className="font-mono text-[10.5px] font-semibold text-[var(--chrome)]">{quote.ticker}</span>
                    <span className="font-mono text-[10.5px] text-[var(--muted)]">
                      {formatPrice(quote.price, quote.currency_symbol)}
                    </span>
                    <span className={cn("font-mono text-[10px] font-medium", toneFor(quote.change_pct) === "positive" ? "text-positive" : toneFor(quote.change_pct) === "negative" ? "text-negative" : "text-[var(--faint)]")}>
                      {formatPct(quote.change_pct)}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="px-5 pb-3 text-[11px] text-[var(--faint)] sm:px-7">
          {data?.message ?? "Live quotes are unavailable right now. Start the FastAPI backend to populate this board — no placeholder prices are shown."}
        </p>
      )}
    </div>
  );
}
