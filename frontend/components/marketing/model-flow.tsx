"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";

const STEPS = [
  {
    title: "Fetch the history",
    body: "A symbol is requested through yfinance with adjusted prices, then normalised to one clean daily index.",
    tag: "yfinance · auto_adjust",
  },
  {
    title: "Clean the prices",
    body: "Duplicate dates, missing closes and non-positive prices are removed and counted — never silently patched.",
    tag: "pandas · quality report",
  },
  {
    title: "Build the lag",
    body: "Each row pairs X, the previous adjusted close, with Y, the current adjusted close. The first observation is dropped.",
    tag: "one-observation lag",
  },
  {
    title: "Fit the regression",
    body: "Ordinary least squares estimates b0 and b1 on the earliest 70% of observations in date order. No shuffling.",
    tag: "scikit-learn · chronological",
  },
  {
    title: "Score the holdout",
    body: "The newest 30% is predicted once. MAE, RMSE, R², MAPE and directional accuracy are reported against a naive baseline.",
    tag: "holdout · naive test",
  },
  {
    title: "Forecast once",
    body: "The model is refit on all history, applied to the most recent close, and published with an empirical residual band.",
    tag: "one observation ahead",
  },
];

export function ModelFlow() {
  return (
    <section id="how-it-works" className="relative border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-5 sm:px-7 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
        <div className="self-start lg:sticky lg:top-24">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
            From yesterday&apos;s close to one honest estimate.
          </h2>
          <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            The model is deliberately small. Six steps keep the data path, the fitting window and the evaluation window
            visible from start to finish.
          </p>

          <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.008))]">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">Regression equation</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" aria-hidden="true" />
            </div>
            <div className="px-4 py-5">
              <p className="font-mono text-[clamp(1.6rem,3vw,2.1rem)] tracking-[-0.02em] text-[var(--gold)]">
                Y = b<sub>0</sub> + b<sub>1</sub>X
              </p>
              <dl className="mt-4 grid gap-2 text-[11.5px]">
                <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-2">
                  <dt className="font-mono text-[var(--glacier)]">X</dt>
                  <dd className="text-right text-[var(--muted)]">Previous adjusted closing price</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-2">
                  <dt className="font-mono text-[var(--gold)]">Y</dt>
                  <dd className="text-right text-[var(--muted)]">Current adjusted closing price</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-2">
                  <dt className="font-mono text-[var(--faint)]">b0, b1</dt>
                  <dd className="text-right text-[var(--muted)]">Intercept and slope from the training window</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-border/70 px-4 py-2.5 text-[10px] leading-relaxed text-[var(--faint)]">
              The holdout fit and the operational refit are reported separately, so evaluation skill is never confused with
              the coefficients used for the live forecast.
            </div>
          </div>

          <Link
            href="/methodology"
            className="group mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-ink"
          >
            Read the methodology
            <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ol className="relative">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.title} delay={Math.min(index * 45, 220)} className="relative grid grid-cols-[38px_1fr] gap-4 pb-7 last:pb-0">
              <div className="relative flex flex-col items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-[#070b12] font-mono text-[10px] text-[var(--chrome)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-gradient-to-b from-border-strong to-border/30" aria-hidden="true" />
                ) : null}
              </div>
              <div className="border-b border-border/50 pb-6 last:border-0 last:pb-0">
                <h3 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{step.title}</h3>
                <p className="mt-1.5 max-w-[54ch] text-[12px] leading-relaxed text-[var(--muted)]">{step.body}</p>
                <span className="mt-2.5 inline-flex items-center rounded-full border border-border/80 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--faint)]">
                  {step.tag}
                </span>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>

      <div className="mx-auto mt-10 w-full max-w-[1280px] px-5 sm:px-7">
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-border/70 bg-white/[0.015] px-4 py-3 text-[10.5px] text-[var(--faint)] sm:flex-row sm:items-center">
          <p>Every forecast is a statistical estimate of the next observation — not a trading signal or investment advice.</p>
          <Link href="/forecast-studio" className="inline-flex items-center gap-1 font-medium text-[var(--muted)] hover:text-ink">
            Open Forecast Studio <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>
    </section>
  );
}
