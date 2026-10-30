"use client";

import type { ReactNode } from "react";
import { useTicker } from "@/components/providers";
import { useApi } from "@/lib/hooks";
import { qs } from "@/lib/api";
import { cn } from "@/components/ui/cn";
import { Badge, Label, StatusDot } from "@/components/ui/primitives";
import { KpiCard } from "@/components/dashboard-ui";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { ApiMeta } from "@/lib/types";

export function useTickerApi<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
) {
  const { ticker, period, refreshToken } = useTicker();
  const key = `${path}${qs({ ticker, period, ...params, _r: refreshToken })}`;
  return useApi<T>(key);
}

export interface KpiItem {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
  deltaLabel?: string;
  footer?: ReactNode;
  tone?: "positive" | "negative" | "muted";
  emphasis?: boolean;
}

export function KpiGrid({ items, columns = 4 }: { items: KpiItem[]; columns?: 2 | 3 | 4 | 5 | 6 }) {
  const grid =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : columns === 5
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          : columns === 6
            ? "sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
            : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-1 gap-2.5", grid)}>
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}

export function SourceStrip({ meta, extra }: { meta?: ApiMeta; extra?: ReactNode }) {
  if (!meta) return null;
  const sourceLabel =
    meta.source === "database" ? "stored history" : meta.source === "cache" ? "cached response" : "Yahoo Finance fetch";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-faint">
      <span className="inline-flex items-center gap-1.5">
        <StatusDot tone={meta.stale ? "warn" : "accent"} />
        {meta.stale ? "Stale cached data" : sourceLabel}
      </span>
      <span className="text-border-strong">|</span>
      <span>
        {meta.price_label} · {meta.adjusted ? "adjusted OHLC" : "raw OHLC"} · {meta.exchange}
      </span>
      <span className="text-border-strong">|</span>
      <span title={formatDateTime(meta.retrieved_at)}>
        retrieved {relativeTime(meta.retrieved_at)} · {meta.observations.toLocaleString()} observations
      </span>
      {extra}
    </div>
  );
}

export function SplitControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-[210px] flex-col gap-1">
      <span className="flex items-center justify-between gap-2 text-[10px] text-faint">
        <span>Chronological split</span>
        <span className="font-mono text-muted">
          {Math.round(value * 100)}% train / {100 - Math.round(value * 100)}% test
        </span>
      </span>
      <input
        type="range"
        min={50}
        max={90}
        step={5}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent disabled:cursor-not-allowed"
        aria-label="Train/test split percentage"
      />
    </label>
  );
}

export function InfoRows({
  rows,
  className,
}: {
  rows: Array<{ label: string; value: ReactNode; hint?: string; mono?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border/70", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[11px] text-faint">{row.label}</dt>
          <dd className={cn("text-right text-[11.5px] text-muted", row.mono !== false && "tnum font-mono")}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({
  label,
  title,
  description,
  actions,
}: {
  label?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {label ? <Label className="mb-1 block">{label}</Label> : null}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-[11.5px] text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "positive" | "negative" | "muted" }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-2.5 py-2">
      <p className="micro-label">{label}</p>
      <p
        className={cn(
          "tnum mt-1 font-mono text-[13px] font-medium text-ink",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function MetaBadges({ meta, extra }: { meta?: ApiMeta; extra?: ReactNode }) {
  if (!meta) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="neutral" className="font-mono">
        {meta.ticker}
      </Badge>
      <Badge tone="neutral">{meta.exchange}</Badge>
      <Badge tone={meta.adjusted ? "accent" : "warn"}>{meta.adjusted ? "Adjusted data" : "Unadjusted data"}</Badge>
      <Badge tone={meta.stale ? "warn" : "info"}>{meta.stale ? "Stale cache" : "Data verified"}</Badge>
      {extra}
    </div>
  );
}
