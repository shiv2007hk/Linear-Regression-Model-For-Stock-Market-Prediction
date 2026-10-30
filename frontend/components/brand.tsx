import { cn } from "@/components/ui/cn";

export function BrandMark({ className, glow = true }: { className?: string; glow?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-accent/30 bg-[linear-gradient(145deg,rgba(55,217,166,0.22),rgba(55,217,166,0.04))]",
        glow && "shadow-[0_6px_18px_-10px_var(--accent)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 14.5L7.4 9.8L10.6 12.4L16.7 5.6"
          stroke="var(--accent)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.6 5.4H17V9.6"
          stroke="var(--accent)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16.6" cy="5.5" r="1.6" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function Wordmark({ subtitle = "Market intelligence", className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn("min-w-0", className)}>
      <span className="block font-display text-[15px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        StockSense <span className="text-accent">AI</span>
      </span>
      <span className="mt-0.5 block text-[8.5px] font-medium uppercase tracking-[0.18em] text-faint">{subtitle}</span>
    </span>
  );
}
