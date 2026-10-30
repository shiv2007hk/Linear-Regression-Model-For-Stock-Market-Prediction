"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSWRConfig } from "swr";
import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  Compass,
  Database,
  FlaskConical,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  TriangleAlert,
  X,
  ExternalLink,
} from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/components/ui/cn";
import { Badge, Button, IconButton, StatusDot } from "@/components/ui/primitives";
import { TickerSearch } from "@/components/ticker-search";
import { BrandMark, Wordmark } from "@/components/brand";
import { useApi, useNow } from "@/lib/hooks";
import { apiSend } from "@/lib/api";
import { formatPct, formatPrice, relativeTime } from "@/lib/format";
import { useSession, useTheme, useTicker, useToast } from "@/components/providers";
import { initials } from "@/lib/session";
import type { Summary } from "@/lib/types";

const ICONS: Record<string, typeof LayoutDashboard> = {
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useApi<{ status: string; yfinance_version: string; database: string }>("/api/health");
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-1 pb-5 pt-1">
        <BrandMark className="h-9 w-9 rounded-xl" />
        <Wordmark subtitle="Market intelligence" />
      </Link>

      <nav className="flex-1 space-y-4 overflow-y-auto pb-4 no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-faint/80">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className="nav-item"
                    data-active={active}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={14.5} strokeWidth={1.9} className={cn(active ? "text-accent" : "text-faint")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-border bg-surface/60 p-3">
        <div className="flex items-center justify-between">
          <span className="micro-label">System</span>
          <StatusDot tone={data?.status === "ok" ? "accent" : "warn"} pulse />
        </div>
        <dl className="mt-2 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Data source</dt>
            <dd className="text-muted">Yahoo Finance</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Model</dt>
            <dd className="text-muted">Simple Linear Regression</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Engine</dt>
            <dd className="font-mono text-muted">yfinance {data?.yfinance_version ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 border-t border-border pt-2 text-[9.5px] leading-relaxed text-faint">
          Educational analytics. Not investment advice. Data may be delayed.
        </p>
      </div>
    </div>
  );
}

function PeriodSelect() {
  const { period, setPeriod } = useTicker();
  const options = [
    { value: "3mo", label: "3M" },
    { value: "6mo", label: "6M" },
    { value: "1y", label: "1Y" },
    { value: "2y", label: "2Y" },
    { value: "5y", label: "5Y" },
    { value: "max", label: "Max" },
  ];
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Date range</span>
      <select
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-lg border border-border bg-surface-2 pl-2.5 pr-7 font-mono text-[11px] text-muted transition-colors hover:border-border-strong hover:text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 text-faint" />
    </label>
  );
}

function RefreshButton() {
  const { ticker, period, refresh } = useTicker();
  const { pushToast } = useToast();
  const { mutate } = useSWRConfig();
  const [loading, setLoading] = useState(false);

  const doRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiSend<{ message: string; row_count: number }>("/api/market-data/refresh", "POST", {
        ticker,
        period,
        interval: "1d",
      });
      await mutate(() => true);
      refresh();
      pushToast({
        title: `${ticker} refreshed`,
        description: `${result.row_count.toLocaleString()} observations loaded. ${result.message}`,
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Refresh failed",
        description: (error as Error).message,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [ticker, period, mutate, refresh, pushToast]);

  return (
    <Button variant="secondary" onClick={doRefresh} loading={loading} className="hidden sm:inline-flex" title="Bypass the cache and refetch from Yahoo Finance">
      <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
      Refresh
    </Button>
  );
}

interface AlertEvent {
  id: number;
  ticker: string | null;
  alert_type: string;
  message: string;
  created_ts: string;
}

function AlertsBell() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { ticker } = useTicker();
  const { data, mutate } = useApi<{ events: AlertEvent[]; alerts: unknown[] }>("/api/alerts");
  const { pushToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const events = data?.events ?? [];
  const today = new Date().toDateString();
  const todayCount = events.filter((event) => new Date(event.created_ts).toDateString() === today).length;

  const evaluate = async () => {
    setBusy(true);
    try {
      const result = await apiSend<{ checked: number; new_events: AlertEvent[] }>(
        `/api/alerts/evaluate?ticker=${encodeURIComponent(ticker)}`,
        "POST",
      );
      await mutate();
      pushToast({
        title: result.new_events.length ? `${result.new_events.length} alert(s) triggered` : "Alerts checked",
        description: `${result.checked} enabled rule(s) evaluated against current data.`,
        tone: result.new_events.length ? "info" : "success",
      });
    } catch (error) {
      pushToast({ title: "Alert check failed", description: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <IconButton label="Alerts" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Bell size={14} />
        {todayCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8.5px] font-bold text-accent-ink">
            {todayCount}
          </span>
        ) : null}
      </IconButton>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div>
              <p className="text-[12px] font-medium text-ink">In-app alerts</p>
              <p className="text-[10px] text-faint">Evaluated on demand, not scheduled.</p>
            </div>
            <Button variant="primary" onClick={evaluate} loading={busy} className="!h-7 !px-2">
              Check
            </Button>
          </div>
          <div className="max-h-72 overflow-auto">
            {events.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-faint">
                No alert events yet. Manage rules in the Prediction Journal.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {events.slice(0, 8).map((event) => (
                  <li key={event.id} className="flex gap-2 px-3 py-2.5">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0 text-warn" />
                    <div>
                      <p className="text-[11px] leading-snug text-muted">{event.message}</p>
                      <p className="mt-0.5 text-[9.5px] text-faint">{relativeTime(event.created_ts)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/prediction-journal#alerts"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-t border-border px-3 py-2 text-[10.5px] text-muted hover:text-ink"
          >
            Manage alert rules
            <ExternalLink size={10} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <IconButton label={isDark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
    </IconButton>
  );
}

const ACCOUNT_LINKS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/watchlist", icon: Star, label: "Watchlist" },
  { href: "/prediction-journal", icon: NotebookPen, label: "Prediction journal" },
];

function SessionMenu() {
  const { session, ready, name, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready) return null;

  if (!session) {
    return (
      <Link
        href="/login"
        className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-ink sm:w-auto sm:px-2.5"
        aria-label="Sign in"
        title="Sign in"
      >
        <LogIn size={12} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        title={name ?? "Account"}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 pl-0.5 pr-1.5 transition-colors hover:border-border-strong"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/12 font-mono text-[9.5px] font-semibold text-accent">
          {initials(name ?? "")}
        </span>
        <span className="hidden max-w-[92px] truncate text-[11px] text-muted lg:block">{name}</span>
        <ChevronDown size={11} className="text-faint" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-pop"
        >
          <div className="border-b border-border px-3 py-3">
            <p className="truncate text-[12px] font-medium text-ink">{name}</p>
            <p className="truncate text-[10px] text-faint">{session.email}</p>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] text-faint">
              Demo session · local to this browser
            </p>
          </div>
          <div className="p-1.5">
            {ACCOUNT_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <Icon size={13} className="text-faint" />
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <span className="flex items-center gap-2">
                <Compass size={13} className="text-faint" />
                Landing page
              </span>
              <ExternalLink size={10} className="text-faint" />
            </Link>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                signOut();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <LogOut size={13} className="text-faint" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuoteChip() {
  const { ticker } = useTicker();
  const { data } = useApi<Summary>(`/api/market-data/summary?ticker=${encodeURIComponent(ticker)}&period=3mo`);
  const now = useNow(15000);
  if (!data) {
    return (
      <div className="hidden items-center gap-2 lg:flex">
        <div className="skeleton h-8 w-48" />
      </div>
    );
  }
  const tone = data.change >= 0 ? "text-positive" : "text-negative";
  const ageSeconds = data.meta?.retrieved_at
    ? Math.max(0, Math.round((now - new Date(data.meta.retrieved_at).getTime()) / 1000))
    : null;
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <div className="flex flex-col leading-tight">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
          <span className="font-mono">{data.ticker}</span>
          <span className="max-w-[130px] truncate text-[10px] font-normal text-faint">{data.exchange}</span>
        </span>
        <span className="text-[9.5px] text-faint">Yahoo Finance · adjusted</span>
      </div>
      <div className="flex flex-col items-end leading-tight">
        <span className="tnum font-mono text-[12.5px] font-medium text-ink">
          {formatPrice(data.latest_price, data.currency_symbol)}
        </span>
        <span className={cn("tnum text-[10px] font-medium", tone)}>
          {formatPct(data.change_pct)} <span className="text-faint">today</span>
        </span>
      </div>
      <div className="hidden items-center gap-1 xl:flex" title={data.meta?.stale ? "Stale data" : "Fresh data"}>
        <StatusDot tone={data.meta?.stale ? "warn" : data.meta?.source === "cache" ? "muted" : "accent"} />
        <span className="text-[9.5px] text-faint">
          {data.meta?.stale ? "stale" : data.meta?.source === "cache" ? "cached" : "live"} ·{" "}
          {ageSeconds !== null && ageSeconds < 90 ? `${ageSeconds}s` : relativeTime(data.meta?.retrieved_at)}
        </span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-border bg-bg/80 px-4 py-4 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 h-full w-[272px] border-r border-border bg-bg px-4 py-4 shadow-pop animate-fade-up">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-surface-3 hover:text-ink"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/75 backdrop-blur-xl">
          <div className="flex h-[60px] items-center gap-3 px-3 sm:px-5 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-ink lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={15} />
            </button>
            <div className="min-w-0 flex-1 sm:max-w-[330px]">
              <TickerSearch />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <QuoteChip />
              <span className="hidden h-5 w-px bg-border sm:block" />
              <PeriodSelect />
              <RefreshButton />
              <AlertsBell />
              <ThemeToggle />
              <Link
                href="/methodology"
                className="hidden h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-ink sm:inline-flex"
              >
                <BookOpen size={12} />
                Docs
              </Link>
              <SessionMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-3 py-5 sm:px-5 lg:px-6 lg:py-6">
          {children}
          <footer className="mt-10 flex flex-col gap-2 border-t border-border pt-4 text-[10px] text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>
              StockSense AI · Educational stock analytics · Simple Linear Regression · Data via Yahoo Finance (yfinance)
            </p>
            <p className="flex items-center gap-1.5">
              <StatusDot tone="accent" />
              Predictions are not investment advice.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
