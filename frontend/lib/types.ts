export interface ApiMeta {
  ticker: string;
  name: string;
  currency: string;
  currency_symbol: string;
  exchange: string;
  exchange_code?: string;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  website?: string | null;
  summary?: string;
  market_cap?: number | null;
  trailing_pe?: number | null;
  beta?: number | null;
  adjusted: boolean;
  price_label: string;
  interval?: string;
  period?: string;
  start: string;
  end: string;
  observations: number;
  data_provider: string;
  retrieved_at: string;
  source: string;
  stale: boolean;
  warning?: string | null;
  quote_type?: string;
  last_dividend?: { date: string; amount: number } | null;
  last_split?: { date: string; ratio: number } | null;
  quality?: QualityCounts;
  [key: string]: unknown;
}

export interface QualityCounts {
  raw_records: number;
  cleaned_records?: number;
  missing_values: number;
  duplicate_dates: number;
  invalid_prices: number;
  rows_removed?: number;
  usable_pct?: number | null;
}

export interface SeriesPoint {
  date: string;
  [key: string]: string | number | null | undefined;
}

export interface Summary {
  ticker: string;
  name: string;
  currency: string;
  currency_symbol: string;
  exchange: string;
  sector?: string | null;
  latest_price: number;
  previous_close: number;
  change: number;
  change_pct: number;
  high_52w: number;
  low_52w: number;
  high_52w_date: string;
  low_52w_date: string;
  total_records: number;
  annualized_volatility_pct: number | null;
  average_volume: number | null;
  latest_volume: number | null;
  period_start: string;
  period_end: string;
  range_high?: number;
  range_low?: number;
  range_high_date?: string;
  range_low_date?: string;
  distance_from_range_high_pct?: number;
  median_volume?: number;
  positive_days_pct?: number;
  data_age_seconds?: number;
  volume_series?: Array<{ date: string; volume: number }>;
  meta?: ApiMeta;
}

export interface FeaturedQuote {
  ticker: string;
  name: string;
  exchange: string;
  region: string;
  currency: string;
  currency_symbol: string;
  price: number;
  previous_close: number;
  change: number | null;
  change_pct: number | null;
  as_of: string;
  retrieved_at: string;
  source: string;
  stale: boolean;
  sparkline: number[];
}

export interface FeaturedPayload {
  quotes: FeaturedQuote[];
  unavailable: Array<{ ticker: string; reason: string }>;
  available: boolean;
  count: number;
  fetched_at: string;
  cached: boolean;
  message: string;
  disclaimer: string;
}

export interface Metrics {
  label?: string;
  mae: number | null;
  mse: number | null;
  rmse: number | null;
  r2: number | null;
  mape: number | null;
  directional_accuracy: number | null;
  n: number;
}

export interface SampleInfo {
  train_size: number;
  test_size: number;
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  total_rows: number;
}

export interface ModelResult {
  ticker: string;
  meta: ApiMeta;
  model_type: "lag" | "trend";
  model_label: string;
  trained_at: string;
  split_ratio: number;
  coefficients: { intercept: number; slope: number; equation: string; training_r2: number | null };
  operational_coefficients: {
    intercept: number;
    slope: number;
    equation: string;
    n_observations: number;
    fitted_through: string;
  };
  sample: SampleInfo;
  metrics: { test: Metrics; naive: Metrics; train: Metrics; improvement?: { mae_pct: number | null; rmse_pct: number | null } };
  series: {
    test: PredictionRow[];
    residuals: Array<{ date: string; residual: number }>;
  };
  scatter: { train: ScatterPoint[]; test: ScatterPoint[]; line: Array<{ x: number; y: number }> };
  residual_stats: ResidualStats;
  insights: string[];
  currency_symbol: string;
  feature_label: string;
  target_label: string;
  run_id?: number;
  persisted?: boolean;
}

export interface PredictionRow {
  date: string;
  x: number | null;
  actual: number | null;
  predicted: number | null;
  naive: number | null;
  previous: number | null;
  error: number | null;
  abs_error: number | null;
  pct_error: number | null;
  direction_correct: boolean | null;
}

export interface ScatterPoint {
  x: number;
  y: number;
  date: string;
}

export interface ResidualStats {
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  mean_abs?: number;
  overpredicted_share?: number;
  underpredicted_share?: number;
}

export interface WatchlistQuote {
  ticker: string;
  name: string;
  currency: string;
  currency_symbol: string;
  latest_price: number;
  change: number;
  change_pct: number;
  total_return_pct: number;
  volatility_pct: number;
  sparkline: number[];
  sparkline_dates: string[];
  normalized: Array<{ date: string; value: number }>;
  last_date: string;
  retrieved_at: string;
}

export interface WatchlistPayload {
  items: Array<{
    id: number;
    ticker: string;
    date_added: string;
    quote: WatchlistQuote | null;
    model_status: {
      run_id: number;
      trained_at: string;
      mae: number | null;
      r2: number | null;
      mape: number | null;
      directional_accuracy: number | null;
      train_start: string;
      train_end: string;
    } | null;
  }>;
  analytics: {
    count: number;
    with_quotes: number;
    best: string | null;
    worst: string | null;
    most_volatile: string | null;
    last_update: string | null;
    volatility_ranking: Array<{ ticker: string; volatility_pct: number }>;
  };
  series: {
    normalized: Array<{ ticker: string; points: Array<{ date: string; value: number }> }>;
    returns_bar: Array<{ ticker: string; total_return_pct: number }>;
    risk_return: Array<{ ticker: string; volatility_pct: number; return_pct: number }>;
  };
  insights: string[];
}
