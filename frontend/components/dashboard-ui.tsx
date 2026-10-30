"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { InfoHint, Label } from "@/components/ui/primitives";
import { toneFor } from "@/lib/format";

export function ChartCard({
  title,
  eyebrow,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          {eyebrow ? <Label className="mb-1 block">{eyebrow}</Label> : null}
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          {description ? <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("px-3 pb-3 pt-3 sm:px-4", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-border/60 px-4 py-2 text-[10.5px] leading-relaxed text-faint sm:px-5">{footer}</div>
      ) : null}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  footer,
  tone,
  icon,
  className,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
  deltaLabel?: string;
  footer?: ReactNode;
  tone?: "positive" | "negative" | "muted";
  icon?: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  const resolvedTone = tone ?? toneFor(delta);
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface/70 px-3.5 py-3 transition-colors hover:border-border-strong",
        emphasis && "border-accent/25 bg-[linear-gradient(160deg,rgba(55,217,166,0.07),transparent_55%)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="micro-label">{label}</span>
          {hint ? <InfoHint text={hint} label={`${label} explanation`} /> : null}
        </div>
        {icon ? <span className="text-faint transition-colors group-hover:text-muted">{icon}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn("tnum font-mono text-[1.28rem] font-medium leading-none tracking-[-0.02em] text-ink", emphasis && "text-accent")}>
          {value}
        </span>
        {delta !== undefined && delta !== null ? (
          <span
            className={cn(
              "tnum inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium",
              resolvedTone === "positive" && "bg-accent/10 text-accent",
              resolvedTone === "negative" && "bg-negative/10 text-negative",
              resolvedTone === "muted" && "bg-surface-3 text-muted",
            )}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toFixed(2)}%
          </span>
        ) : null}
      </div>
      {deltaLabel ? <p className="mt-1 text-[10.5px] text-faint">{deltaLabel}</p> : null}
      {footer ? <div className="mt-2 text-[10.5px] leading-relaxed text-faint">{footer}</div> : null}
    </div>
  );
}

export function InsightPanel({
  insights,
  title = "What the data says",
  eyebrow = "Analytical read",
  disclaimer,
  className,
  columns = 1,
}: {
  insights: string[];
  title?: string;
  eyebrow?: string;
  disclaimer?: string;
  className?: string;
  columns?: 1 | 2;
}) {
  if (!insights.length) return null;
  return (
    <section className={cn("panel px-4 py-4 sm:px-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{eyebrow}</Label>
          <h3 className="mt-1 text-[13.5px] font-semibold text-ink">{title}</h3>
        </div>
        <span className="chip">Computed</span>
      </div>
      <ul className={cn("mt-3 grid gap-x-6 gap-y-2.5", columns === 2 ? "md:grid-cols-2" : "grid-cols-1")}>
        {insights.map((text, index) => (
          <li key={`${index}-${text.slice(0, 24)}`} className="flex gap-2.5 text-[11.8px] leading-relaxed text-muted">
            <span className="mt-[3px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {disclaimer ? (
        <p className="mt-3 border-t border-border/60 pt-2.5 text-[10.5px] leading-relaxed text-faint">{disclaimer}</p>
      ) : null}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 pb-1", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <Label className="mb-1.5 block">{eyebrow}</Label> : null}
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.8rem]">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-pretty text-[12.5px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </header>
  );
}

export function ChartFootnote({ children }: { children: ReactNode }) {
  return <span className="text-[10.5px] text-faint">{children}</span>;
}
