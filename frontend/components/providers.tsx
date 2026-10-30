"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SWRConfig } from "swr";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import {
  clearSession as clearStoredSession,
  displayName as displaySessionName,
  readSession,
  writeSession,
  type Session,
} from "@/lib/session";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("stocksense-theme");
    const initial: Theme = stored === "light" ? "light" : "dark";
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.classList.toggle("light", initial === "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem("stocksense-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  name: string | null;
  signIn: (input: { email: string; name?: string }, remember?: boolean) => Session;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "stocksense-session") setSession(readSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback<SessionContextValue["signIn"]>((input, remember = true) => {
    const next: Session = {
      name: (input.name ?? "").trim(),
      email: input.email.trim(),
      signedInAt: new Date().toISOString(),
    };
    writeSession(next, remember);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ready,
      name: session ? displaySessionName(session) : null,
      signIn,
      signOut,
    }),
    [session, ready, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

interface TickerContextValue {
  ticker: string;
  period: string;
  splitRatio: number;
  refreshToken: number;
  setTicker: (ticker: string) => void;
  setPeriod: (period: string) => void;
  setSplitRatio: (ratio: number) => void;
  refresh: () => void;
}

const TickerContext = createContext<TickerContextValue | null>(null);

export const DEFAULT_TICKER = "RELIANCE.NS";

export function TickerProvider({ children }: { children: ReactNode }) {
  const [ticker, setTickerState] = useState(DEFAULT_TICKER);
  const [period, setPeriodState] = useState("2y");
  const [splitRatio, setSplitRatio] = useState(0.7);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    // Landing-page deep links (?ticker=TCS.NS) win over the last used symbol.
    const params = new URLSearchParams(window.location.search);
    const queryTicker = params.get("ticker")?.trim().toUpperCase();
    const queryPeriod = params.get("period");
    const storedTicker = window.localStorage.getItem("stocksense-ticker");
    const storedPeriod = window.localStorage.getItem("stocksense-period");
    if (queryTicker) {
      setTickerState(queryTicker);
      window.localStorage.setItem("stocksense-ticker", queryTicker);
    } else if (storedTicker) {
      setTickerState(storedTicker);
    }
    if (queryPeriod) {
      setPeriodState(queryPeriod);
      window.localStorage.setItem("stocksense-period", queryPeriod);
    } else if (storedPeriod) {
      setPeriodState(storedPeriod);
    }
  }, []);

  const setTicker = useCallback((next: string) => {
    const clean = next.trim().toUpperCase();
    if (!clean) return;
    setTickerState(clean);
    window.localStorage.setItem("stocksense-ticker", clean);
  }, []);

  const setPeriod = useCallback((next: string) => {
    setPeriodState(next);
    window.localStorage.setItem("stocksense-period", next);
  }, []);

  const refresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  const value = useMemo<TickerContextValue>(
    () => ({
      ticker,
      period,
      splitRatio,
      refreshToken,
      setTicker,
      setPeriod,
      setSplitRatio,
      refresh,
    }),
    [ticker, period, splitRatio, refreshToken, setTicker, setPeriod, refresh],
  );

  return <TickerContext.Provider value={value}>{children}</TickerContext.Provider>;
}

export function useTicker(): TickerContextValue {
  const ctx = useContext(TickerContext);
  if (!ctx) throw new Error("useTicker must be used inside TickerProvider");
  return ctx;
}

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (toast: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastIcon = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback<ToastContextValue["pushToast"]>((toast) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [
      ...current.slice(-3),
      { id, title: toast.title, description: toast.description, tone: toast.tone ?? "info" },
    ]);
    window.setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = toastIcon[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-2/95 p-3 shadow-pop backdrop-blur animate-fade-up",
                toast.tone === "error" ? "border-negative/40" : toast.tone === "success" ? "border-accent/40" : "border-border-strong",
              )}
              role="status"
            >
              <Icon
                size={16}
                className={cn(
                  "mt-0.5 shrink-0",
                  toast.tone === "error" ? "text-negative" : toast.tone === "success" ? "text-accent" : "text-info",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded p-0.5 text-faint transition-colors hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        shouldRetryOnError: false,
        dedupingInterval: 4000,
        keepPreviousData: true,
      }}
    >
      <ThemeProvider>
        <SessionProvider>
          <TickerProvider>
            <ToastProvider>{children}</ToastProvider>
          </TickerProvider>
        </SessionProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
