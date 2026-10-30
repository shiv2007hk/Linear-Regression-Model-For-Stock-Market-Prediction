export function currencySymbol(currency?: string | null, symbol?: string | null): string {
  if (symbol) return symbol;
  if (currency === "INR") return "₹";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  if (currency === "JPY") return "¥";
  return currency ? `${currency} ` : "$";
}

function localeFor(currency?: string | null): string {
  return currency === "INR" ? "en-IN" : "en-US";
}

const GLOBAL_UNITS: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const INR_UNITS: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e7, "Cr"],
  [1e5, "L"],
  [1e3, "K"],
];

export function formatNumber(
  value: number | null | undefined,
  opts: { currency?: string | null; symbol?: string | null; digits?: number; compact?: boolean; bare?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const { currency, symbol, digits, compact, bare } = opts;
  const prefix = bare ? "" : currencySymbol(currency, symbol);
  const locale = localeFor(currency);
  if (compact) {
    const units = currency === "INR" ? INR_UNITS : GLOBAL_UNITS;
    const abs = Math.abs(value);
    const unit = units.find(([size]) => abs >= size);
    if (unit) {
      const scaled = value / unit[0];
      return `${prefix}${scaled.toLocaleString(locale, {
        maximumFractionDigits: scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2,
      })}${unit[1]}`;
    }
  }
  const fractionDigits = digits ?? (Math.abs(value) >= 1 ? 2 : 4);
  return `${prefix}${value.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatPrice(value: number | null | undefined, symbol?: string | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${symbol ?? "$"}${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCompact(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return formatNumber(value, { currency, compact: true });
}

export function formatPct(value: number | null | undefined, digits = 2, signed = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatSigned(value: number | null | undefined, symbol?: string | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${symbol ?? "$"}${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function toneFor(value: number | null | undefined): "positive" | "negative" | "muted" {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return "muted";
  return value > 0 ? "positive" : "negative";
}

export function formatDate(value?: string | null, opts: { short?: boolean } = {}): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: opts.short ? undefined : "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return "not yet";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
