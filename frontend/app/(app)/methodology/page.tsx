"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Cpu,
  Database,
  GitBranch,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard-ui";
import { Badge, Label } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/page-kit";
import { cn } from "@/components/ui/cn";

const PIPELINE = [
  { step: "01", title: "Fetch", detail: "Yahoo Finance daily adjusted OHLCV via yfinance" },
  { step: "02", title: "Clean", detail: "Sort dates, collapse duplicates, drop invalid closes" },
  { step: "03", title: "Lag", detail: "X = previous adjusted close, Y = current adjusted close" },
  { step: "04", title: "Split", detail: "Chronological train/test split, never shuffled" },
  { step: "05", title: "Fit", detail: "Ordinary least squares on the training window only" },
  { step: "06", title: "Evaluate", detail: "Holdout metrics plus naive persistence baseline" },
  { step: "07", title: "Refit", detail: "Refit on all valid history, then forecast next observation" },
];

const METRICS = [
  { name: "MAE", formula: "mean(|y − ŷ|)", tells: "Average absolute miss in price units", caveat: "Scale-dependent; not comparable across tickers with different prices" },
  { name: "MSE", formula: "mean((y − ŷ)²)", tells: "Squared error, penalises large misses", caveat: "Units are squared, so magnitude is hard to read directly" },
  { name: "RMSE", formula: "√MSE", tells: "Error in price units with extra weight on large misses", caveat: "Still scale-dependent" },
  { name: "R²", formula: "1 − SS_res / SS_tot", tells: "Share of variance explained relative to the mean", caveat: "Inflated by price persistence; can be negative out of sample" },
  { name: "MAPE", formula: "mean(|y − ŷ| / |y|) × 100", tells: "Average percentage miss", caveat: "Unstable when the actual price is near zero" },
  { name: "Directional accuracy", formula: "share(sign(ŷ − y_prev) = sign(y − y_prev))", tells: "How often the predicted direction is right", caveat: "Ignores magnitude; a small correct move and a huge correct miss score equally" },
];

const ENDPOINTS = [
  { method: "GET", path: "/api/market-data", purpose: "Cleaned OHLCV bars for a ticker and period" },
  { method: "GET", path: "/api/market-data/quality", purpose: "Raw-versus-cleaned data quality summary" },
  { method: "GET", path: "/api/market-data/dataset", purpose: "Paginated, sortable cleaned dataset" },
  { method: "GET", path: "/api/market-data/dataset.csv", purpose: "CSV export of the cleaned dataset" },
  { method: "POST", path: "/api/market-data/refresh", purpose: "Force a refresh and persist to SQLite" },
  { method: "GET", path: "/api/dashboard", purpose: "Aggregated dashboard payload" },
  { method: "GET", path: "/api/analytics/trend", purpose: "Moving averages and trend readings" },
  { method: "GET", path: "/api/analytics/returns", purpose: "Returns, volatility, drawdown and histograms" },
  { method: "GET", path: "/api/analytics/comparison", purpose: "Normalised comparison and correlation matrix" },
  { method: "POST", path: "/api/model/train", purpose: "Train and persist a model run" },
  { method: "GET", path: "/api/model/metrics", purpose: "Latest stored evaluation, or a computed fallback" },
  { method: "GET", path: "/api/model/backtest", purpose: "Holdout predictions, residuals and walk-forward" },
  { method: "POST", path: "/api/model/forecast", purpose: "Operational forecast; never persists" },
  { method: "GET", path: "/api/model/diagnostics", purpose: "Residual diagnostics on the holdout" },
  { method: "GET", path: "/api/model/insights", purpose: "Coefficient explanations and sensitivity" },
  { method: "GET", path: "/api/watchlist", purpose: "Persisted watchlist with live quotes" },
  { method: "POST", path: "/api/watchlist", purpose: "Add and validate a ticker" },
  { method: "DELETE", path: "/api/watchlist/{id}", purpose: "Remove a watchlist item" },
  { method: "GET", path: "/api/predictions", purpose: "Journal records; resolves pending rows on load" },
  { method: "POST", path: "/api/predictions", purpose: "Save a prediction with full audit metadata" },
  { method: "GET", path: "/api/alerts", purpose: "Rules and recent alert events" },
  { method: "POST", path: "/api/alerts", purpose: "Create an in-app alert rule" },
  { method: "POST", path: "/api/alerts/evaluate", purpose: "Evaluate enabled rules against fresh data" },
];

export default function MethodologyPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Reference · Methodology"
        title="How StockSense computes everything"
        description="A deliberately narrow model, a leakage-safe evaluation pipeline and honest labels on every number. This page documents the exact rules the backend applies."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">Simple Linear Regression only</Badge>
            <Badge tone="info">Yahoo Finance live data</Badge>
            <Badge tone="neutral">Open-source stack</Badge>
            <Badge tone="warn">Educational, not advice</Badge>
          </div>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Guarantee icon={<Database size={14} />} title="Real data only" body="Prices come from Yahoo Finance. No synthetic or hardcoded chart data exists anywhere in the app." />
        <Guarantee icon={<ShieldCheck size={14} />} title="No leakage" body="The model is fitted on the training window only. The holdout is never touched during fitting." />
        <Guarantee icon={<Cpu size={14} />} title="One model" body="X = previous adjusted close. No extra features, no moving averages, no hidden ensembles." />
        <Guarantee icon={<BookOpen size={14} />} title="Labeled limits" body="Every forecast carries a model label, an empirical error band and a data-delay disclaimer." />
      </div>

      <section className="panel px-4 py-4 sm:px-5">
        <SectionTitle label="Pipeline" title="From a ticker symbol to a forecast" description="Every page reads from the same pipeline. The order below is the order in which data is transformed." />
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[repeat(7,minmax(0,1fr))]">
          {PIPELINE.map((stage, index) => (
            <div key={stage.step} className="relative rounded-lg border border-border bg-surface/60 px-2.5 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] text-accent">{stage.step}</span>
                {index < PIPELINE.length - 1 ? <ArrowRight size={11} className="hidden text-faint xl:block" /> : null}
              </div>
              <p className="mt-1 text-[11.5px] font-semibold text-ink">{stage.title}</p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-faint">{stage.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="panel px-4 py-4 sm:px-5">
          <SectionTitle label="Model specification" title="One feature, one target" description="The model is deliberately minimal so its behaviour is fully auditable." />
          <div className="mt-3 space-y-2">
            <Formula label="Feature" formula="X_t = Close_{t−1}" note="Previous adjusted close" />
            <Formula label="Target" formula="Y_t = Close_t" note="Current adjusted close (one-period lag)" />
            <Formula label="Model" formula="Ŷ = β₀ + β₁ · X" note="Ordinary least squares with an intercept" />
            <Formula label="Slope" formula="β₁ = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²" note="Estimated on the training window only" />
            <Formula label="Intercept" formula="β₀ = ȳ − β₁ · x̄" note="Shown for completeness; X = 0 has no financial meaning" />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            The optional time-index trend model is a separate educational mode. It uses the row index as X, is labeled as such everywhere, and is never mixed
            into the lag model.
          </p>
        </section>

        <SplitExplorer />
      </div>

      <section className="panel px-4 py-4 sm:px-5">
        <SectionTitle
          label="Lags and leakage"
          title="The first row has no previous close"
          description="Building the supervised dataset drops the first observation because there is no X for it. Nothing is back-filled."
        />
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Row</th>
                <th>Date</th>
                <th className="text-right">Adjusted close</th>
                <th className="text-right">X (previous close)</th>
                <th className="text-right">Y (current close)</th>
                <th>Usable?</th>
              </tr>
            </thead>
            <tbody>
              {[
                { row: "t−3", date: "day 1", close: "C₁", x: "—", y: "C₁", usable: "No — no lag" },
                { row: "t−2", date: "day 2", close: "C₂", x: "C₁", y: "C₂", usable: "Yes" },
                { row: "t−1", date: "day 3", close: "C₃", x: "C₂", y: "C₃", usable: "Yes" },
                { row: "t", date: "day 4", close: "C₄", x: "C₃", y: "C₄", usable: "Yes" },
              ].map((row) => (
                <tr key={row.row}>
                  <td className="font-mono text-[10.5px] text-faint">{row.row}</td>
                  <td className="text-[10.5px] text-muted">{row.date}</td>
                  <td className="tnum text-right font-mono text-[10.5px]">{row.close}</td>
                  <td className="tnum text-right font-mono text-[10.5px] text-accent">{row.x}</td>
                  <td className="tnum text-right font-mono text-[10.5px]">{row.y}</td>
                  <td className="text-[10.5px] text-muted">{row.usable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <LeakageRule title="Chronological only" body="The split follows row order. Shuffling is never applied, because random splits let future information leak into training." />
          <LeakageRule title="Fit on train" body="Coefficients are estimated from the training rows. The test rows are read once, for evaluation, after fitting." />
          <LeakageRule title="Refit after evaluation" body="The operational forecast refits on every valid row, but that refit happens after the holdout metrics are recorded." />
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="panel px-4 py-4 sm:px-5">
          <SectionTitle label="Metrics" title="What each number means" description="Every metric is computed on out-of-sample predictions unless explicitly labeled otherwise." />
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="table-shell">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Formula</th>
                  <th>What it tells you</th>
                  <th>Caveat</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr key={metric.name}>
                    <td className="whitespace-nowrap text-[10.5px] font-medium text-ink">{metric.name}</td>
                    <td className="whitespace-nowrap font-mono text-[10px] text-muted">{metric.formula}</td>
                    <td className="text-[10.5px] text-muted">{metric.tells}</td>
                    <td className="text-[10.5px] text-faint">{metric.caveat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <div className="flex items-center gap-2">
              <GitBranch size={14} className="text-accent" />
              <Label>Naive baseline</Label>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              The benchmark predicts that the next close equals the current close: <span className="font-mono text-ink">ŷ_t = y_(t−1)</span>. It is evaluated
              on exactly the same holdout rows as the regression.
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              A regression that cannot beat this baseline on MAE is not adding forecast value, even when its R² looks respectable. The app states this
              explicitly wherever model results appear.
            </p>
          </section>
          <section className="panel px-4 py-4">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-accent" />
              <Label>Walk-forward</Label>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Backtesting optionally runs an expanding-window walk-forward: for each test date, the model is refitted using only observations available
              before that date, then asked to predict one step ahead.
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              This is slower and more realistic than a single holdout. It still cannot simulate news, liquidity or execution.
            </p>
          </section>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel px-4 py-4">
          <SectionTitle label="Forecasting" title="Operational rules" description="How the next-observation forecast differs from the evaluation model." />
          <ul className="mt-3 space-y-2">
            {[
              "The operational model refits on all valid observations after the holdout metrics are recorded.",
              "A one-step forecast applies the same equation to the latest adjusted close.",
              "Multi-step horizons are recursive: each predicted value becomes the next input; uncertainty compounds.",
              "The displayed band is the empirical 5th–95th percentile of holdout residuals — not a statistical confidence interval.",
              "The next trading date comes from pandas_market_calendars; an unverified weekday fallback is labeled when no calendar is available.",
              "No future actual prices are invented. A saved prediction resolves only when a real subsequent observation exists.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2 text-[10.8px] leading-relaxed text-muted">
                <Check size={11} className="mt-0.5 shrink-0 text-accent" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel px-4 py-4">
          <SectionTitle label="Data integrity" title="Fetching, cleaning and caching" description="What happens before any number reaches a chart." />
          <ul className="mt-3 space-y-2">
            {[
              "yfinance is called with auto_adjust=True; the UI labels whether the payload is adjusted.",
              "Dates are sorted ascending, duplicates collapse and non-positive or unusable closes are dropped.",
              "Successful fetches are cached with a TTL and persisted to SQLite for reuse.",
              "If a live fetch fails, stored history can be served with an explicit stale flag.",
              "Every payload carries its provider, retrieval timestamp, exchange, observation count and currency.",
              "Yahoo Finance can be delayed, revised or incomplete. Treat it as research data, not exchange-grade data.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2 text-[10.8px] leading-relaxed text-muted">
                <Check size={11} className="mt-0.5 shrink-0 text-accent" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel px-4 py-4 sm:px-5">
        <SectionTitle label="Architecture" title="What talks to what" description="A Next.js client, a FastAPI service and a single SQLite database. No hidden third-party model APIs." />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Layer title="Next.js frontend" subtitle="React 19 · TypeScript · Tailwind · Plotly" items={["App Router pages", "SWR data hooks", "Plotly interactive charts", "Accessible component primitives"]} />
          <Layer title="FastAPI backend" subtitle="Python · pandas · scikit-learn · scipy" items={["REST endpoints with Pydantic validation", "Leakage-safe ML pipeline", "Yahoo Finance adapter and cache", "Structured error envelopes"]} />
          <Layer title="SQLite storage" subtitle="SQLAlchemy 2.x · PostgreSQL-compatible" items={["stock_data", "model_runs", "prediction_history", "watchlist · alerts · alert_events"]} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-faint">
          <span className="rounded border border-border bg-surface px-2 py-1">Browser</span>
          <ArrowRight size={11} />
          <span className="rounded border border-border bg-surface px-2 py-1">Next.js on :3000</span>
          <ArrowRight size={11} />
          <span className="rounded border border-border bg-surface px-2 py-1">FastAPI on :8010</span>
          <ArrowRight size={11} />
          <span className="rounded border border-border bg-surface px-2 py-1">SQLite</span>
        </div>
      </section>

      <section className="panel px-4 py-4 sm:px-5">
        <SectionTitle label="API reference" title="REST surface" description="Errors are returned as { error: { code, message } } with appropriate HTTP status codes." />
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={`${endpoint.method}-${endpoint.path}`}>
                  <td>
                    <span className={cn("rounded px-1.5 py-0.5 font-mono text-[9.5px] font-medium", methodTone(endpoint.method))}>{endpoint.method}</span>
                  </td>
                  <td className="whitespace-nowrap font-mono text-[10px] text-muted">{endpoint.path}</td>
                  <td className="text-[10.5px] text-muted">{endpoint.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-faint">Additional routes: GET /api/model/runs, GET /api/market-data/search, PATCH and DELETE /api/alerts/{"{id}"}.</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel px-4 py-4">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-accent" />
            <Label>Run locally</Label>
          </div>
          <CodeBlock
            lines={[
              "cd backend",
              "python -m venv .venv",
              ".venv\\Scripts\\activate        # Windows",
              "pip install -r requirements.txt",
              "uvicorn main:app --reload --port 8010",
            ]}
          />
          <CodeBlock
            lines={[
              "cd frontend",
              "npm install",
              "npm run dev                    # http://localhost:3000",
            ]}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Set <span className="font-mono text-muted">NEXT_PUBLIC_API_URL</span> to the backend URL. The app defaults to{" "}
            <span className="font-mono text-muted">http://127.0.0.1:8010</span>. See the README for deployment and troubleshooting.
          </p>
        </section>

        <section className="panel px-4 py-4">
          <SectionTitle label="Stack" title="Open-source components" />
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[
              ["Next.js", "App Router"],
              ["React", "UI runtime"],
              ["TypeScript", "Strict types"],
              ["Tailwind CSS", "Design system"],
              ["Plotly", "Interactive charts"],
              ["FastAPI", "REST API"],
              ["pandas", "Time series"],
              ["scikit-learn", "LinearRegression"],
              ["scipy / statsmodels", "Diagnostics"],
              ["SQLAlchemy + SQLite", "Persistence"],
              ["yfinance", "Market data"],
              ["pandas_market_calendars", "Trading dates"],
            ].map(([name, role]) => (
              <div key={name} className="flex items-center justify-between gap-2 rounded border border-border bg-surface/60 px-2 py-1.5">
                <span className="text-[10.5px] text-ink">{name}</span>
                <span className="text-[9px] text-faint">{role}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-warn/30 bg-warn/[0.05] px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warn">
          <ShieldCheck size={13} /> Limitations and disclaimer
        </p>
        <p className="mt-1.5 text-[10.8px] leading-relaxed text-muted">
          This platform is an educational analytics tool. A one-feature autoregression cannot incorporate earnings, news, policy, sentiment, liquidity or
          macro shocks. Relationships estimated on past prices can break down. Forecasts, bands and journal records are not investment advice, not
          recommendations and not a promise of future performance. Yahoo Finance data may be delayed or revised. No brokerage, fees, taxes or slippage are
          modelled anywhere in the app.
        </p>
      </section>
    </div>
  );
}

function Guarantee({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <section className="panel flex items-start gap-2.5 px-3.5 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">{icon}</span>
      <div>
        <p className="text-[11.5px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{body}</p>
      </div>
    </section>
  );
}

function Formula({ label, formula, note }: { label: string; formula: string; note: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">{label}</span>
        <span className="font-mono text-[11px] font-medium text-accent">{formula}</span>
      </div>
      <p className="mt-0.5 text-[9.5px] text-faint">{note}</p>
    </div>
  );
}

function LeakageRule({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10.5px] font-medium text-ink">
        <Check size={10} className="text-accent" /> {title}
      </p>
      <p className="mt-1 text-[9.5px] leading-relaxed text-faint">{body}</p>
    </div>
  );
}

function Layer({ title, subtitle, items }: { title: string; subtitle: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-3">
      <p className="text-[11.5px] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 font-mono text-[9px] text-faint">{subtitle}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5 text-[10px] leading-relaxed text-muted">
            <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent/70" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface/70 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
      {lines.join("\n")}
    </pre>
  );
}

function SplitExplorer() {
  const [trainPct, setTrainPct] = useState(70);
  const testPct = 100 - trainPct;
  return (
    <section className="panel px-4 py-4 sm:px-5">
      <SectionTitle label="Chronological split" title="Older data trains, newer data tests" description="Slide to see how the split changes. The real split is controlled by the global split control, 50–90%." />
      <div className="mt-4 flex h-10 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-center bg-accent/15 text-[10px] font-medium text-accent" style={{ width: `${trainPct}%` }}>
          Train {trainPct}%
        </div>
        <div className="flex items-center justify-center border-l border-border bg-surface-3 text-[10px] font-medium text-muted" style={{ width: `${testPct}%` }}>
          Test {testPct}%
        </div>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-faint">
        <span>oldest observation</span>
        <span>most recent observation</span>
      </div>
      <input
        type="range"
        min={50}
        max={90}
        step={5}
        value={trainPct}
        onChange={(event) => setTrainPct(Number(event.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent"
        aria-label="Illustrative train percentage"
      />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <SmallStat label="Fit rows" value={`${trainPct}%`} />
        <SmallStat label="Holdout rows" value={`${testPct}%`} />
        <SmallStat label="Shuffle" value="Never" />
      </div>
      <p className="mt-2 text-[9.5px] leading-relaxed text-faint">
        This slider is illustrative only. Evaluation uses the split selected in the app header; the operational forecast always refits on 100% of valid rows.
      </p>
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-2.5 py-1.5">
      <p className="micro-label">{label}</p>
      <p className="tnum mt-0.5 font-mono text-[12px] font-medium text-ink">{value}</p>
    </div>
  );
}

function methodTone(method: string): string {
  if (method === "GET") return "bg-info/10 text-info";
  if (method === "POST") return "bg-accent/10 text-accent";
  if (method === "DELETE") return "bg-negative/10 text-negative";
  return "bg-warn/10 text-warn";
}
