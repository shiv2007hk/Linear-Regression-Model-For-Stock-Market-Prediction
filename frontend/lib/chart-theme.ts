export type ChartPalette = ReturnType<typeof palette>;

export function palette(isDark: boolean) {
  return isDark
    ? {
        ink: "#e7eef7",
        muted: "#8fa0b8",
        faint: "#5f7089",
        grid: "rgba(148,174,205,0.10)",
        axis: "rgba(148,174,205,0.20)",
        surface: "#0e1621",
        border: "rgba(148,174,205,0.22)",
        accent: "#37d9a6",
        blue: "#6ba7ff",
        amber: "#f2b45c",
        red: "#ff6b7d",
        violet: "#a78bfa",
        teal: "#2dd4bf",
        gray: "#7c8ca3",
        band: "rgba(55,217,166,0.10)",
        isDark,
      }
    : {
        ink: "#0b1725",
        muted: "#566a82",
        faint: "#7d8ea3",
        grid: "rgba(13,31,54,0.08)",
        axis: "rgba(13,31,54,0.18)",
        surface: "#ffffff",
        border: "rgba(13,31,54,0.14)",
        accent: "#0f9f7a",
        blue: "#2f6fd6",
        amber: "#b9791a",
        red: "#d93a50",
        violet: "#7c5ce0",
        teal: "#0d9488",
        gray: "#6b7d93",
        band: "rgba(15,159,122,0.08)",
        isDark,
      };
}

export const SERIES_COLORS = ["accent", "blue", "amber", "violet", "red"] as const;

export function seriesColor(index: number, pal: ChartPalette): string {
  const key = SERIES_COLORS[index % SERIES_COLORS.length];
  return pal[key];
}

type AxisKind = "currency" | "percent" | "number" | "compact";

function axisConfig(kind: AxisKind, pal: ChartPalette, currencySymbol: string) {
  const base = {
    gridcolor: pal.grid,
    zerolinecolor: pal.axis,
    linecolor: pal.axis,
    tickfont: { size: 10.5, color: pal.faint },
    titlefont: { size: 11, color: pal.muted },
    automargin: true,
    fixedrange: false,
  };
  if (kind === "currency") {
    return { ...base, tickprefix: currencySymbol, tickformat: ",.0f" };
  }
  if (kind === "percent") {
    return { ...base, ticksuffix: "%", tickformat: ",.1f" };
  }
  if (kind === "compact") {
    return { ...base, tickformat: "~s" };
  }
  return { ...base, tickformat: ",.2~f" };
}

export function baseLayout(
  pal: ChartPalette,
  opts: {
    height?: number;
    xTitle?: string;
    yTitle?: string;
    currencySymbol?: string;
    yKind?: AxisKind;
    xKind?: "date" | "number" | "category";
    showLegend?: boolean;
    margin?: { l?: number; r?: number; t?: number; b?: number };
    hovermode?: "x unified" | "closest" | false;
    barmode?: "group" | "overlay" | "relative" | "stack";
  } = {},
) {
  const {
    height = 300,
    xTitle,
    yTitle,
    currencySymbol = "$",
    yKind = "currency",
    xKind = "date",
    showLegend = true,
    margin,
    hovermode = "x unified",
    barmode,
  } = opts;

  return {
    height,
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter Variable, Inter, Segoe UI, sans-serif", size: 11, color: pal.muted },
    margin: {
      l: margin?.l ?? 52,
      r: margin?.r ?? 14,
      t: margin?.t ?? 10,
      b: margin?.b ?? 34,
    },
    hoverlabel: {
      bgcolor: pal.isDark ? "#111b27" : "#ffffff",
      bordercolor: pal.border,
      font: { family: "JetBrains Mono Variable, Consolas, monospace", size: 11, color: pal.ink },
      align: "left",
    },
    hovermode,
    barmode,
    dragmode: "pan",
    showlegend: showLegend,
    legend: {
      orientation: "h",
      x: 0,
      xanchor: "left",
      y: 1.12,
      yanchor: "bottom",
      font: { size: 10.5, color: pal.muted },
      bgcolor: "rgba(0,0,0,0)",
      itemclick: "toggle",
      itemdoubleclick: "toggleothers",
    },
    xaxis: {
      ...axisConfig(xKind === "date" ? "number" : "number", pal, currencySymbol),
      type: xKind === "category" ? "category" : xKind === "number" ? "linear" : "date",
      showgrid: false,
      title: xTitle ? { text: xTitle, font: { size: 10.5, color: pal.faint } } : undefined,
      tickformat: xKind === "date" ? undefined : undefined,
      nticks: 8,
    },
    yaxis: {
      ...axisConfig(yKind, pal, currencySymbol),
      title: yTitle ? { text: yTitle, font: { size: 10.5, color: pal.faint } } : undefined,
      rangemode: "normal",
    },
    transition: { duration: 0 },
  };
}

export const PLOTLY_CONFIG = {
  displayModeBar: false,
  displaylogo: false,
  responsive: true,
  scrollZoom: false,
  doubleClick: "reset",
  showTips: false,
};

type TraceOptions = {
  x: Array<string | number>;
  y: Array<number | null>;
  name: string;
  color: string;
  width?: number;
  dash?: "solid" | "dot" | "dash";
  fill?: "tozeroy" | "tonexty" | "toself";
  fillColor?: string;
  opacity?: number;
  hovertemplate?: string;
  visible?: boolean | "legendonly";
};

export function lineTrace({
  x,
  y,
  name,
  color,
  width = 1.7,
  dash = "solid",
  fill,
  fillColor,
  opacity = 1,
  hovertemplate,
  visible,
}: TraceOptions) {
  return {
    type: "scatter",
    mode: "lines",
    x,
    y,
    name,
    visible,
    line: { color, width, dash, shape: "linear" },
    fill: fill ?? "none",
    fillcolor: fillColor,
    opacity,
    connectgaps: false,
    hovertemplate: hovertemplate ?? `${name}: %{y:,.2f}<extra></extra>`,
  };
}

export function areaTrace(opts: TraceOptions & { lineColor?: string }) {
  return lineTrace({ ...opts, fill: opts.fill ?? "tozeroy", fillColor: opts.fillColor });
}

export function barTrace({
  x,
  y,
  name,
  color,
  opacity = 0.9,
  hovertemplate,
  width,
}: {
  x: Array<string | number>;
  y: Array<number | null>;
  name: string;
  color: string;
  opacity?: number;
  hovertemplate?: string;
  width?: number;
}) {
  return {
    type: "bar",
    x,
    y,
    name,
    width,
    marker: { color, line: { width: 0 } },
    opacity,
    hovertemplate: hovertemplate ?? `${name}: %{y:,.2f}<extra></extra>`,
  };
}

export function scatterTrace({
  x,
  y,
  name,
  color,
  size = 6,
  opacity = 0.75,
  symbol = "circle",
  text,
  hovertemplate,
  mode = "markers",
  lineWidth = 0,
}: {
  x: Array<number | string | null>;
  y: Array<number | null>;
  name: string;
  color: string;
  size?: number;
  opacity?: number;
  symbol?: string;
  text?: Array<string>;
  hovertemplate?: string;
  mode?: "markers" | "lines+markers" | "lines" | "markers+text";
  lineWidth?: number;
}) {
  return {
    type: "scatter",
    mode,
    x,
    y,
    name,
    text,
    marker: {
      color,
      size,
      opacity,
      symbol,
      line: { color, width: lineWidth },
    },
    hovertemplate: hovertemplate ?? `${name}: %{y:,.2f}<extra></extra>`,
  };
}

export function gradientFill(pal: ChartPalette): string {
  return pal.isDark ? "rgba(55,217,166,0.16)" : "rgba(15,159,122,0.14)";
}

export function axisFormatForTick(kind: AxisKind, pal: ChartPalette): Partial<typeof baseLayout> {
  return axisConfig(kind, pal, "");
}
