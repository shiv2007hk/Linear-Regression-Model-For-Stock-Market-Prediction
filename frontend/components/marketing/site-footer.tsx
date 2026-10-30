import Link from "next/link";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { FooterAccountLink } from "@/components/marketing/footer-account";

const PLATFORM = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/market-explorer", label: "Market Explorer" },
  { href: "/data-quality", label: "Historical Data" },
  { href: "/trend-analysis", label: "Trend Analysis" },
  { href: "/returns-volatility", label: "Returns & Volatility" },
  { href: "/comparison", label: "Comparison" },
];

const MODEL = [
  { href: "/model-lab", label: "Model Laboratory" },
  { href: "/backtesting", label: "Backtesting" },
  { href: "/forecast-studio", label: "Forecast Studio" },
  { href: "/residual-diagnostics", label: "Residual Diagnostics" },
  { href: "/model-insights", label: "Model Insights" },
  { href: "/methodology", label: "Methodology & Risk" },
];

const WORKSPACE = [
  { href: "/watchlist", label: "Watchlist & Portfolio" },
  { href: "/prediction-journal", label: "Prediction Journal" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-border/60 bg-[#04060a]">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-14 sm:px-7">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_0.9fr_0.9fr_0.85fr]">
          <div id="about">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="StockSense AI home">
              <BrandMark className="h-9 w-9 rounded-xl" />
              <Wordmark subtitle="Understand the market" />
            </Link>
            <p className="mt-4 max-w-[42ch] text-[12px] leading-relaxed text-[var(--muted)]">
              An intelligent stock market analytics platform that turns historical market data into meaningful insights
              using Simple Linear Regression and interactive financial analytics.
            </p>
            <p className="mt-3 max-w-[46ch] text-[10.5px] leading-relaxed text-[var(--faint)]">
              Built as an educational project. Not a broker, not an advisory service, and not a trading system. Yahoo
              Finance data may be delayed or incomplete; forecasts are estimates and will sometimes be wrong.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-[11px] text-ink transition-colors hover:border-border-strong"
              >
                Open workspace <ArrowUpRight size={11} />
              </Link>
              <a
                href="#features"
                className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[11px] text-[var(--muted)] transition-colors hover:border-border-strong hover:text-ink"
              >
                Features
              </a>
              <Link
                href="/methodology"
                className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[11px] text-[var(--muted)] transition-colors hover:border-border-strong hover:text-ink"
              >
                Documentation
              </Link>
            </div>
          </div>

          <nav aria-label="Platform modules">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">Platform</p>
            <ul className="mt-3 space-y-2">
              {PLATFORM.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-[11.5px] text-[var(--muted)] transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Model and documentation">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">Model & docs</p>
            <ul className="mt-3 space-y-2">
              {MODEL.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-[11.5px] text-[var(--muted)] transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Workspace access">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">Workspace</p>
            <ul className="mt-3 space-y-2">
              {WORKSPACE.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-[11.5px] text-[var(--muted)] transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <FooterAccountLink />
              </li>
              <li>
                <Link
                  href="/login?mode=signup"
                  className="text-[11.5px] text-[var(--muted)] transition-colors hover:text-ink"
                >
                  Create a demo session
                </Link>
              </li>
            </ul>
            <p className="mt-5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-[var(--faint)]">
              Python · scikit-learn
              <br />
              pandas · NumPy · yfinance
              <br />
              FastAPI · SQLite · Next.js
              <br />
              TypeScript · Tailwind · Plotly
            </p>
          </nav>
        </div>

        <div className="mt-10 chrome-rule" />

        <div className="mt-5 flex flex-col gap-3 text-[10px] text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} StockSense AI. Educational analytics only — not investment advice.</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono">Data: Yahoo Finance · Charts: Plotly</span>
            <a href="#top" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
              Back to top <ArrowUp size={10} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
