"use client";

import { useCountUp, useInView } from "@/components/marketing/motion";

const STATS = [
  {
    value: 14,
    label: "Analysis modules",
    detail: "Dashboard, research, model, monitoring and reference surfaces — all on the same dataset.",
  },
  {
    value: 1,
    label: "Feature in the model",
    detail: "X is the previous adjusted close; no hidden inputs, no ensemble, no black box.",
  },
  {
    value: 2,
    label: "Quote currencies",
    detail: "INR and USD handled with their own symbols, grouping and price precision.",
  },
  {
    value: 12,
    label: "Companies on the board",
    detail: "NSE and NASDAQ names quoted live above, plus any symbol you search.",
  },
];

function Counter({ value }: { value: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>("0px 0px -20% 0px");
  const animated = useCountUp(value, inView, 1100);
  return (
    <span ref={ref} className="tnum tabular-nums">
      <span aria-hidden="true">{Math.round(animated)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

export function StatBand() {
  return (
    <section aria-label="Platform capability at a glance" className="relative border-y border-border/70 bg-white/[0.012]">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-px bg-border/50 px-5 sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="stat-cell bg-[#05080e] px-5 py-7 sm:px-6 lg:px-7 lg:py-9">
            <p className="font-display text-[clamp(2.4rem,4vw,3.35rem)] font-semibold leading-none tracking-[-0.04em] text-ink">
              <Counter value={stat.value} />
            </p>
            <p className="mt-3 text-[12.5px] font-medium text-ink">{stat.label}</p>
            <p className="mt-1.5 max-w-[34ch] text-[11px] leading-relaxed text-[var(--muted)]">{stat.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
