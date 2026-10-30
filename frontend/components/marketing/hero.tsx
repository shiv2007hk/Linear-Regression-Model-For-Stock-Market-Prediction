"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ArrowDown, ArrowUpRight, CircleDollarSign, LineChart, ShieldCheck } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { useFeatured } from "@/components/marketing/use-featured";
import { useReducedMotion } from "@/components/marketing/motion";
import { formatDate, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/components/ui/cn";
import type { FeaturedQuote } from "@/lib/types";

function LiveChip({ quote, className, drift }: { quote: FeaturedQuote; className?: string; drift: string }) {
  const up = (quote.change_pct ?? 0) >= 0;
  return (
    <div className={cn("absolute z-20", className)}>
      <div className={cn("plinth-chip w-[196px] rounded-2xl p-3", drift)}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-wide text-[var(--chrome)]">{quote.ticker}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold",
              up ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative",
            )}
          >
            {formatPct(quote.change_pct)}
          </span>
        </div>
        <p className="mt-1.5 font-display text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink">
          {formatPrice(quote.price, quote.currency_symbol)}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[9.5px] text-[var(--muted)]">{quote.name}</p>
            <p className="mt-0.5 truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--faint)]">
              {quote.exchange} · {formatDate(quote.as_of, { short: true })}
            </p>
          </div>
          <Sparkline values={quote.sparkline} width={58} height={20} positive={up} />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const { quotes, error, isLoading } = useFeatured();
  const reduced = useReducedMotion();
  const reliance = quotes.find((quote) => quote.ticker === "RELIANCE.NS") ?? quotes[0];
  const apple = quotes.find((quote) => quote.ticker === "AAPL") ?? quotes[8];
  const chipA = useRef<HTMLDivElement>(null);
  const chipB = useRef<HTMLDivElement>(null);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    if (chipA.current) chipA.current.style.transform = `translate3d(${x * 14}px, ${y * 10}px, 0)`;
    if (chipB.current) chipB.current.style.transform = `translate3d(${x * -9}px, ${y * -7}px, 0)`;
  };

  const reset = () => {
    if (chipA.current) chipA.current.style.transform = "translate3d(0,0,0)";
    if (chipB.current) chipB.current.style.transform = "translate3d(0,0,0)";
  };

  return (
    <section id="top" className="relative overflow-hidden pb-10 pt-12 sm:pt-16 lg:pb-14 lg:pt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[680px] grid-lines opacity-70" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-10 px-5 sm:px-7 lg:grid-cols-[1.02fr_0.98fr] lg:gap-4">
        <div className="max-w-[600px]">
          <h1 className="text-balance font-display text-[clamp(2.7rem,5.1vw,4.55rem)] font-semibold leading-[0.99] tracking-[-0.038em] text-ink">
            See Beyond the Numbers.
            <span className="mt-1 block text-[#c3cfe6]">Understand the Market.</span>
          </h1>
          <p className="mt-6 max-w-[50ch] text-pretty text-[15px] leading-relaxed text-muted sm:text-[16px]">
            Explore stock market trends, analyze financial performance, and generate data-driven price forecasts with a
            model you can inspect line by line — Simple Linear Regression, trained on live Yahoo Finance history.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/dashboard"
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-semibold text-accent-ink shadow-[0_16px_40px_-18px_var(--accent)] transition-all hover:brightness-110"
            >
              Explore Dashboard
              <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white/[0.02] px-5 text-[13.5px] font-medium text-ink transition-colors hover:border-border-strong hover:bg-white/[0.04]"
            >
              Discover How It Works
              <ArrowDown size={14} className="text-faint" />
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10.5px] text-faint">
            <li className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Yahoo Finance feed
            </li>
            <li className="inline-flex items-center gap-1.5">
              <LineChart size={11} className="text-[var(--glacier)]" />
              Chronological 70 / 30 split
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-[var(--gold)]" />
              No fabricated prices
            </li>
          </ul>
        </div>

        <div
          onPointerMove={onMove}
          onPointerLeave={reset}
          className="plinth-stage relative mx-auto w-full max-w-[620px]"
        >
          <div className="relative aspect-[5/4] w-full sm:aspect-[4/3]">
            <Image
              src="/brand/hero-plinth.png"
              alt="Chrome cube embossed with currency symbols, a stack of silver coins, and a gold growth arrow on dark lit pedestals."
              fill
              priority
              sizes="(min-width: 1280px) 620px, (min-width: 768px) 58vw, 100vw"
              className="plinth-img object-cover object-[63%_50%]"
              quality={88}
            />

            <span className="plinth-tick left-2 top-3 border-l border-t" aria-hidden="true" />
            <span className="plinth-tick right-3 top-3 border-r border-t" aria-hidden="true" />
            <span className="plinth-tick bottom-3 left-2 border-b border-l" aria-hidden="true" />
            <span className="plinth-tick bottom-3 right-3 border-b border-r" aria-hidden="true" />

            <div className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-border bg-[#070b12]/70 px-2.5 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-60",
                    quotes.length ? "animate-ping bg-accent" : "",
                  )}
                />
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", quotes.length ? "bg-accent" : "bg-warn")} />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {quotes.length ? "Live board" : isLoading ? "Connecting" : "Feed offline"}
              </span>
            </div>

            {reliance ? (
              <div ref={chipA} className="absolute left-0 top-[16%] z-20 transition-transform duration-300 ease-out sm:left-[-2%]">
                <LiveChip quote={reliance} drift="drift-slow" />
              </div>
            ) : null}
            {apple ? (
              <div
                ref={chipB}
                className="absolute bottom-[7%] left-[8%] z-20 transition-transform duration-300 ease-out sm:left-[6%]"
              >
                <LiveChip quote={apple} drift="drift-slower" />
              </div>
            ) : null}

            <div className="absolute bottom-3 right-4 z-20 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--faint)]">
              <CircleDollarSign size={10} />
              Currency cube · coin stack · growth mark
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-center text-[10px] text-[var(--faint)]">
              Live quote chips stay empty while the API is unreachable — nothing is simulated.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
