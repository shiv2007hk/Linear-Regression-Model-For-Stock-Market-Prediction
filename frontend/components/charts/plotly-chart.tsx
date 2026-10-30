"use client";

import { useEffect, useRef, useState } from "react";
import { PLOTLY_CONFIG } from "@/lib/chart-theme";
import { useTheme } from "@/components/providers";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

export type PlotlyTrace = Record<string, unknown>;

interface PlotlyChartProps {
  data: PlotlyTrace[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  height?: number;
  className?: string;
  resetKey?: string;
  ariaLabel?: string;
}

export function PlotlyChart({
  data,
  layout = {},
  config,
  height = 300,
  className,
  resetKey,
  ariaLabel,
}: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    let cancelled = false;
    import("plotly.js-dist-min")
      .then((mod) => {
        if (cancelled) return;
        plotlyRef.current = mod.default;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !plotlyRef.current || !ref.current) return;
    const finalLayout: Record<string, unknown> = {
      ...layout,
      height,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      ...(resetKey ? { uirevision: resetKey } : {}),
    };
    plotlyRef.current
      .react(ref.current, data, finalLayout, { ...PLOTLY_CONFIG, ...config })
      .catch(() => setFailed(true));
  }, [data, layout, height, ready, resetKey, isDark, config]);

  useEffect(() => {
    const element = ref.current;
    return () => {
      if (plotlyRef.current && element) {
        try {
          plotlyRef.current.purge(element);
        } catch {
          // container may already be detached
        }
      }
    };
  }, []);

  if (failed) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-lg border border-dashed border-border text-[11.5px] text-muted", className)}
        style={{ height }}
      >
        Charting library failed to load in this browser.
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)} style={{ minHeight: height }}>
      {!ready ? <Skeleton className="absolute inset-0" /> : null}
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel ?? "Interactive financial chart"}
        className={cn("w-full transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")}
        style={{ height }}
      />
    </div>
  );
}
