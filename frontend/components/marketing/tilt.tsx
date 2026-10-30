"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "@/components/marketing/motion";
import { cn } from "@/components/ui/cn";

export function TiltCard({
  children,
  className,
  max = 6,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType === "touch") return;
    const node = inner.current;
    if (!node) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      node.style.setProperty("--tilt-x", `${(0.5 - py) * max}deg`);
      node.style.setProperty("--tilt-y", `${(px - 0.5) * max}deg`);
      node.style.setProperty("--glare-x", `${px * 100}%`);
      node.style.setProperty("--glare-y", `${py * 100}%`);
    });
  };

  const reset = () => {
    const node = inner.current;
    if (!node) return;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
    node.style.setProperty("--glare-x", "50%");
    node.style.setProperty("--glare-y", "50%");
  };

  return (
    <div
      onPointerMove={move}
      onPointerLeave={reset}
      className={cn("tilt-card", className)}
    >
      <div ref={inner} className="tilt-card-inner">
        {children}
        {glare ? <span className="tilt-glare" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

export function ScrollProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.current?.style.setProperty("--progress", progress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="scroll-progress" aria-hidden="true">
      <span ref={bar} />
    </div>
  );
}

export function ParticleField({ count = 6, className }: { count?: number; className?: string }) {
  const seeds = Array.from({ length: count }, (_, index) => index);
  const positions: Array<CSSProperties> = [
    { left: "7%", top: "24%", ["--dx" as string]: "8px", ["--dy" as string]: "-18px", ["--dur" as string]: "11s", ["--delay" as string]: "0s" },
    { left: "18%", top: "68%", ["--dx" as string]: "-7px", ["--dy" as string]: "-12px", ["--dur" as string]: "9s", ["--delay" as string]: "-2.4s" },
    { left: "34%", top: "12%", ["--dx" as string]: "6px", ["--dy" as string]: "-22px", ["--dur" as string]: "13s", ["--delay" as string]: "-4.1s" },
    { left: "72%", top: "18%", ["--dx" as string]: "-9px", ["--dy" as string]: "-16px", ["--dur" as string]: "10s", ["--delay" as string]: "-1.2s" },
    { left: "88%", top: "44%", ["--dx" as string]: "5px", ["--dy" as string]: "-14px", ["--dur" as string]: "12s", ["--delay" as string]: "-5.3s" },
    { left: "62%", top: "82%", ["--dx" as string]: "-6px", ["--dy" as string]: "-20px", ["--dur" as string]: "9.5s", ["--delay" as string]: "-3.1s" },
  ];
  return (
    <div className={cn("hero-particles", className)} aria-hidden="true">
      {seeds.map((index) => (
        <span key={index} className="hero-particle" style={positions[index % positions.length]} />
      ))}
    </div>
  );
}
