"use client";

import { useId } from "react";

export function Sparkline({
  values,
  width = 96,
  height = 28,
  positive,
  strokeWidth = 1.4,
}: {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  if (!values.length) return <span className="text-[10px] text-faint">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const isUp = positive ?? values[values.length - 1] >= values[0];
  const color = isUp ? "var(--positive)" : "var(--negative)";
  const area = `M0,${height} L${points.join(" L")} L${width},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <polyline
        className="spark-draw"
        points={points.join(" ")}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
