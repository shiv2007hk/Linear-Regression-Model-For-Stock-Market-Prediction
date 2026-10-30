"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/components/ui/cn";

export const buttonClass = (
  variant: "primary" | "secondary" | "ghost" | "danger" = "secondary",
  size: "sm" | "md" = "sm",
  className?: string,
) =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]",
    variant === "primary" &&
      "bg-accent text-accent-ink hover:brightness-110 shadow-[0_8px_20px_-12px_var(--accent)]",
    variant === "secondary" && "border border-border bg-surface-2 text-ink hover:border-border-strong hover:bg-surface-3",
    variant === "ghost" && "text-muted hover:bg-surface-3 hover:text-ink",
    variant === "danger" && "border border-negative/35 text-negative hover:bg-negative/10",
    className,
  );

export function Button({
  variant = "secondary",
  size = "sm",
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 size={13} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "accent" | "negative" | "warn" | "info" | "violet";

const toneClass: Record<Tone, string> = {
  neutral: "border-border bg-surface-3 text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent",
  negative: "border-negative/30 bg-negative/10 text-negative",
  warn: "border-warn/30 bg-warn/10 text-warn",
  info: "border-info/30 bg-info/10 text-info",
  violet: "border-violet/30 bg-violet/10 text-violet",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium tracking-wide",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function InfoHint({ text, label }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label ?? "Metric explanation"}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-faint transition-colors hover:text-muted focus-visible:text-muted"
      >
        <Info size={11.5} strokeWidth={2.2} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[130%] left-1/2 z-30 w-60 -translate-x-1/2 rounded-lg border border-border-strong bg-surface-3 px-2.5 py-2 text-left text-[11px] font-normal leading-relaxed text-muted opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin text-accent", className)} size={16} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 bg-surface/40 text-center",
        compact ? "gap-1.5 px-4 py-8" : "gap-2 px-6 py-14",
      )}
    >
      {icon ? <div className="mb-1 text-faint">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-[11.5px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = "Could not load this data",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-negative/25 bg-negative/[0.04] px-6 py-12 text-center">
      <AlertTriangle size={20} className="text-negative" />
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="max-w-xl text-[11.5px] leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          <RefreshCw size={12} /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5", className)}
      role="group"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "xs" ? "px-2 py-1 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
            value === option.value
              ? "bg-surface-3 text-ink shadow-[inset_0_0_0_1px_var(--border-strong)]"
              : "text-faint hover:text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("input h-8 cursor-pointer appearance-none pr-7", className)} {...props}>
      {children}
    </select>
  );
}

export function StatusDot({
  tone = "accent",
  pulse = false,
  className,
}: {
  tone?: "accent" | "warn" | "negative" | "muted";
  pulse?: boolean;
  className?: string;
}) {
  const color =
    tone === "accent"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-warn"
        : tone === "negative"
          ? "bg-negative"
          : "bg-faint";
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color, pulse && "animate-pulse-soft", className)} />
  );
}

export function Panel({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("panel", className)}>{children}</Tag>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline my-4", className)} />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("micro-label", className)}>{children}</span>;
}
