"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Compass,
  Database,
  FlaskConical,
  GitCompareArrows,
  History,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { TiltCard } from "@/components/marketing/tilt";
import { cn } from "@/components/ui/cn";

type Tone = "emerald" | "glacier" | "gold";

interface Feature {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: "Research" | "Machine learning" | "Forecasting";
  tone: Tone;
  span: string;
  equation?: boolean;
}

const TONE: Record<Tone, string> = {
  emerald: "text-accent",
  glacier: "text-[var(--glacier)]",
  gold: "text-[var(--gold)]",
};

const FEATURES: Feature[] = [
  {
    title: "Stock Market Explorer",
    description:
      "Search any Yahoo Finance symbol, pick a window from three months to maximum history, and inspect adjusted OHLCV with the source timestamp attached.",
    href: "/market-explorer",
    icon: Compass,
    category: "Research",
    tone: "glacier",
    span: "md:col-span-6 lg:col-span-5",
  },
  {
    title: "Historical Data Analysis",
    description:
      "Every cleaned observation stays visible, alongside missing values, duplicate dates and invalid prices removed before modelling.",
    href: "/data-quality",
    icon: Database,
    category: "Research",
    tone: "glacier",
    span: "md:col-span-3 lg:col-span-4",
  },
  {
    title: "Price Trend Analysis",
    description: "Twenty-, fifty- and two-hundred-session averages, range position and golden-cross context.",
    href: "/trend-analysis",
    icon: TrendingUp,
    category: "Research",
    tone: "glacier",
    span: "md:col-span-3 lg:col-span-3",
  },
  {
    title: "Returns & Volatility",
    description: "Daily and cumulative returns, drawdowns, rolling volatility and the full gain/loss distribution.",
    href: "/returns-volatility",
    icon: Activity,
    category: "Research",
    tone: "glacier",
    span: "md:col-span-3 lg:col-span-3",
  },
  {
    title: "Comparative Stock Analysis",
    description: "Normalize several symbols to one baseline and compare returns, volatility and correlation without mixing currencies.",
    href: "/comparison",
    icon: GitCompareArrows,
    category: "Research",
    tone: "glacier",
    span: "md:col-span-3 lg:col-span-3",
  },
  {
    title: "ML Model Laboratory",
    description:
      "Fit one-feature Simple Linear Regression on a chronological split. Holdout metrics stay separate from the operational refit.",
    href: "/model-lab",
    icon: FlaskConical,
    category: "Machine learning",
    tone: "emerald",
    span: "md:col-span-6 lg:col-span-6",
    equation: true,
  },
  {
    title: "Backtesting & Evaluation",
    description:
      "Expanding-window walk-forward runs scored with MAE, RMSE, R², MAPE and directional accuracy against a naive persistence baseline.",
    href: "/backtesting",
    icon: History,
    category: "Machine learning",
    tone: "emerald",
    span: "md:col-span-3 lg:col-span-6",
  },
  {
    title: "Forecast Studio",
    description:
      "One observation ahead: the next adjusted close, the fitted equation, and an empirical 5–95% residual band — never a promise.",
    href: "/forecast-studio",
    icon: Sparkles,
    category: "Forecasting",
    tone: "gold",
    span: "md:col-span-3 lg:col-span-6",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-20 sm:py-24">
      <div className="mx-auto w-full max-w-[1280px] px-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[640px]">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              Research tools that show their work.
            </h2>
            <p className="mt-3 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
              Eight entry points into the same pipeline: one cleaned price history, one regression, many honest ways to
              interrogate it.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--muted)] transition-colors hover:text-ink"
          >
            Open the dashboard
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border transition-colors group-hover:border-accent/40 group-hover:text-accent">
              <ArrowUpRight size={12} />
            </span>
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.href} delay={Math.min(index * 45, 220)} className={feature.span}>
                <TiltCard className="h-full rounded-2xl" max={5}>
                  <Link
                    href={feature.href}
                    className="ticket group relative flex h-full min-h-[172px] flex-col overflow-hidden rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.006))] p-5 [transform-style:preserve-3d] hover:border-[rgba(174,188,255,0.3)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.008))]"
                  >
                    <span
                      className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: "radial-gradient(circle, rgba(174,188,255,0.13), transparent 66%)" }}
                      aria-hidden="true"
                    />
                    <div className="relative flex items-start justify-between gap-3 [transform-style:preserve-3d]">
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110",
                          TONE[feature.tone],
                        )}
                        style={{ transform: "translateZ(26px)" }}
                      >
                        <Icon size={16} strokeWidth={1.8} />
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--faint)]">
                        {feature.category}
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-[16.5px] font-semibold leading-snug tracking-[-0.015em] text-ink">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 max-w-[46ch] text-[11.5px] leading-relaxed text-[var(--muted)]">
                      {feature.description}
                    </p>
                    {feature.equation ? (
                      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-[#070b12]/70 px-3 py-2.5">
                        <span className="font-mono text-[12.5px] text-[var(--chrome)]" aria-label="Y equals b zero plus b one times X">
                          Y = b<sub>0</sub> + b<sub>1</sub>X
                        </span>
                        <span className="text-right font-mono text-[8.5px] uppercase leading-tight tracking-[0.1em] text-[var(--faint)]">
                          previous close
                          <br />→ current close
                        </span>
                      </div>
                    ) : null}
                    <span className="mt-auto flex items-center gap-1.5 pt-4 text-[10.5px] font-medium text-[var(--faint)] transition-colors group-hover:text-ink">
                      Open module
                      <ArrowUpRight size={11} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
