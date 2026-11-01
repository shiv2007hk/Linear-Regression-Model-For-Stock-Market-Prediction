"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  FlaskConical,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Lightbulb,
  NotebookPen,
  ScanSearch,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { Reveal } from "@/components/marketing/motion";
import { cn } from "@/components/ui/cn";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Compass,
  Database,
  TrendingUp,
  Activity,
  GitCompareArrows,
  FlaskConical,
  History,
  Sparkles,
  ScanSearch,
  Lightbulb,
  Star,
  NotebookPen,
  BookOpen,
};

const BLURBS: Record<string, string> = {
  "/dashboard": "The live ticker, the fitted model and the most recent runs on one screen.",
  "/market-explorer": "Search any Yahoo Finance symbol and read adjusted OHLCV with its source timestamp.",
  "/data-quality": "Missing dates, duplicate rows and invalid prices, shown before they are removed.",
  "/trend-analysis": "Twenty-, fifty- and two-hundred-session averages, range position and cross context.",
  "/returns-volatility": "Daily and cumulative returns, drawdowns and rolling volatility.",
  "/comparison": "Several symbols normalised to one baseline, without mixing currencies.",
  "/model-lab": "One-feature linear regression on a chronological split, holdout kept separate.",
  "/backtesting": "Expanding-window walk-forward runs scored against naive persistence.",
  "/forecast-studio": "One session ahead, with the equation and an empirical residual band.",
  "/residual-diagnostics": "Normality, autocorrelation and heteroskedasticity tests on the holdout.",
  "/model-insights": "Plain-language readings of the coefficients, intervals and skill.",
  "/watchlist": "Pin symbols and carry them between sessions.",
  "/prediction-journal": "Every forecast logged, then scored when the real close arrives.",
  "/methodology": "The assumptions, the split, and what this model refuses to claim.",
};

const GROUP_TONE: Record<string, string> = {
  Overview: "text-accent",
  Research: "text-[var(--glacier)]",
  "Machine Learning": "text-accent",
  Monitoring: "text-[var(--gold)]",
  Reference: "text-[var(--violet)]",
};

interface OrbitNode {
  href: string;
  label: string;
  group: string;
  icon: LucideIcon;
  blurb: string;
}

const BASE_SPEED = 8;
const DRAG_GAIN = 0.3;

function geometry(width: number) {
  const w = Math.round(Math.min(198, Math.max(128, width * 0.155)));
  return {
    radius: Math.round(Math.min(430, Math.max(190, width * 0.34))),
    w,
    h: Math.round(Math.min(162, Math.max(130, w * 0.82))),
  };
}

export function ModuleOrbit() {
  const nodes = useMemo<OrbitNode[]>(
    () =>
      NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => ({
          href: item.href,
          label: item.label,
          group: group.label,
          icon: ICONS[item.icon] ?? LayoutDashboard,
          blurb: BLURBS[item.href] ?? item.label,
        })),
      ),
    [],
  );

  const step = 360 / nodes.length;
  const measureRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<Array<HTMLDivElement | null>>([]);
  const angle = useRef(0);
  const inertia = useRef(0);
  const target = useRef<number | null>(null);
  const dragging = useRef(false);
  const dragTravel = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const resting = useRef(false);
  const reduced = useRef(false);
  const frontRef = useRef(0);
  const detach = useRef<(() => void) | null>(null);

  const [dims, setDims] = useState(() => geometry(1200));
  const [front, setFront] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const paint = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.style.transform = `rotateY(${angle.current}deg)`;
    let best = 0;
    let bestDepth = -2;
    for (let i = 0; i < nodes.length; i += 1) {
      const el = cardsRef.current[i];
      const raw = ((angle.current + i * step) % 360 + 360) % 360;
      const depth = Math.cos((raw * Math.PI) / 180);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = i;
      }
      if (!el) continue;
      const opacity = depth <= -0.12 ? 0 : 0.24 + 0.76 * ((depth + 1) / 2);
      el.style.setProperty("--orbit-opacity", opacity.toFixed(3));
      el.style.pointerEvents = depth > 0.02 ? "auto" : "none";
    }
    if (best !== frontRef.current) {
      frontRef.current = best;
      setFront(best);
    }
  }, [nodes.length, step]);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const apply = (width: number) => setDims(geometry(width));
    apply(el.clientWidth || 1200);
    const observer = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paint();
    if (reduced.current) return;

    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (!dragging.current) {
        if (target.current !== null) {
          const diff = target.current - angle.current;
          if (Math.abs(diff) < 0.05) {
            angle.current = target.current;
            target.current = null;
          } else {
            angle.current += diff * Math.min(1, dt * 5.2);
          }
        } else {
          inertia.current *= Math.pow(0.42, dt);
          if (Math.abs(inertia.current) < 0.4) inertia.current = 0;
          const base = resting.current ? 0 : BASE_SPEED;
          if (inertia.current !== 0 || base !== 0) angle.current += (base + inertia.current) * dt;
        }
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  useEffect(() => () => detach.current?.(), []);

  const beginDrag = (down: React.PointerEvent<HTMLDivElement>) => {
    if (down.pointerType === "mouse" && down.button !== 0) return;
    dragging.current = true;
    dragTravel.current = 0;
    inertia.current = 0;
    lastX.current = down.clientX;
    lastTime.current = down.timeStamp;
    setIsDragging(true);

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      detach.current = null;
    };
    const move = (event: PointerEvent) => {
      const dx = event.clientX - lastX.current;
      const dt = Math.max((event.timeStamp - lastTime.current) / 1000, 0.008);
      lastX.current = event.clientX;
      lastTime.current = event.timeStamp;
      dragTravel.current += Math.abs(dx);
      angle.current += dx * DRAG_GAIN;
      target.current = null;
      inertia.current = (dx * DRAG_GAIN) / dt;
      paint();
    };
    const end = () => {
      dragging.current = false;
      setIsDragging(false);
      inertia.current = Math.max(-260, Math.min(260, inertia.current));
      cleanup();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    detach.current = cleanup;
  };

  const goTo = (index: number) => {
    const desired = -index * step;
    const diff = ((((desired - angle.current) % 360) + 540) % 360) - 180;
    if (reduced.current) {
      angle.current += diff;
      paint();
      return;
    }
    target.current = angle.current + diff;
    inertia.current = 0;
  };

  const active = nodes[front];

  return (
    <section id="modules" className="relative overflow-hidden py-20 sm:py-24">
      <div ref={measureRef} className="mx-auto w-full max-w-[1280px] px-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[620px]">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              Every module, on one turning axis.
            </h2>
            <p className="mt-3 max-w-[58ch] text-[13.5px] leading-relaxed text-muted">
              Fourteen surfaces, one pipeline. Drag the ring, use the arrows, or pick a dot — the card facing you is the
              module you are about to open.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo((front - 1 + nodes.length) % nodes.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/[0.03] text-muted transition-colors hover:border-[rgba(174,188,255,0.4)] hover:text-ink"
              aria-label="Previous module"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => goTo((front + 1) % nodes.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/[0.03] text-muted transition-colors hover:border-[rgba(174,188,255,0.4)] hover:text-ink"
              aria-label="Next module"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <Reveal delay={60}>
          <div
            className="orbit-scene mt-6 h-[clamp(310px,44vw,430px)] w-full select-none"
            data-dragging={isDragging ? "true" : "false"}
            style={
              {
                "--orbit-r": `${dims.radius}px`,
                "--orbit-w": `${dims.w}px`,
                "--orbit-h": `${dims.h}px`,
              } as React.CSSProperties
            }
            role="group"
            aria-label="Module orbit"
            tabIndex={0}
            onPointerDown={beginDrag}
            onPointerEnter={() => {
              resting.current = true;
            }}
            onPointerLeave={() => {
              resting.current = false;
            }}
            onFocus={() => {
              resting.current = true;
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) resting.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                goTo((front + 1) % nodes.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                goTo((front - 1 + nodes.length) % nodes.length);
              }
            }}
          >
            <div className="orbit-stage">
              <div className="orbit-track" aria-hidden="true" />
              <div className="orbit-track-outer" aria-hidden="true" />
              <div className="orbit-core" aria-hidden="true" />
              <div ref={ringRef} className="orbit-ring">
                {nodes.map((node, index) => {
                  const Icon = node.icon;
                  const isFront = index === front;
                  return (
                    <div
                      key={node.href}
                      ref={(el) => {
                        cardsRef.current[index] = el;
                      }}
                      className="orbit-card"
                      data-front={isFront ? "true" : "false"}
                      style={{ transform: `rotateY(${index * step}deg) translateZ(${dims.radius}px)` }}
                    >
                      <Link
                        href={node.href}
                        className="orbit-link"
                        tabIndex={isFront ? 0 : -1}
                        onClick={(event) => {
                          if (dragTravel.current > 8) event.preventDefault();
                        }}
                      >
                        <span
                          className={cn(
                            "orbit-glyph transition-colors",
                            GROUP_TONE[node.group] ?? "text-[var(--glacier)]",
                          )}
                        >
                          <Icon size={15} strokeWidth={1.8} />
                        </span>
                        <span className="mt-2.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--faint)]">
                          {node.group}
                        </span>
                        <h3 className="mt-1 font-display text-[13.5px] font-semibold leading-tight tracking-[-0.015em] text-ink">
                          {node.label}
                        </h3>
                        <span className="orbit-edge" aria-hidden="true" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="orbit-fade-left" aria-hidden="true" />
            <div className="orbit-fade-right" aria-hidden="true" />
          </div>
        </Reveal>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div key={active.href} className="orbit-readout-in panel flex flex-col gap-1 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex items-center gap-3 sm:w-[240px] sm:shrink-0">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--faint)]">
                {String(front + 1).padStart(2, "0")} / {String(nodes.length).padStart(2, "0")}
              </span>
              <span className={cn("micro-label", GROUP_TONE[active.group] ?? "text-[var(--glacier)]")}>
                {active.group}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.02em] text-ink">
                {active.label}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{active.blurb}</p>
            </div>
            <Link
              href={active.href}
              className="btn-sheen inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(174,188,255,0.32)] bg-white/[0.05] px-4 py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:border-accent/50"
            >
              Open module
              <ArrowUpRight size={13} />
            </Link>
          </div>

          <div className="orbit-dots" role="tablist" aria-label="Jump to module">
            {nodes.map((node, index) => (
              <button
                key={node.href}
                type="button"
                role="tab"
                aria-selected={index === front}
                aria-label={node.label}
                data-active={index === front ? "true" : "false"}
                onClick={() => goTo(index)}
                className="orbit-dot"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
