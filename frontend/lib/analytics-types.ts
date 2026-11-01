import type { ApiMeta, PredictionRow, QualityCounts, SampleInfo, SeriesPoint, Summary } from "@/lib/types";

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  center: number;
  count: number;
}

export interface MarketPayload {
  meta: ApiMeta;
  summary: Summary;
  ohlcv: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  last_updated: string;
}

export interface DashboardPayload {
  meta: ApiMeta;
  summary: Summary;
  series: {
    price: Array<{ date: string; Close: number; sma20: number | null; sma50: number | null }>;
    volume: Array<{ date: string; volume: number }>;
    returns: Array<{ date: string; return_pct: number }>;
    actual_vs_predicted: PredictionRow[];
    model_performance: Array<{ metric: string; model: number | null; naive: number | null }>;
    r2_comparison: { model_r2: number | null; train_r2: number | null; test_label: string };
  };
  model: {
    equation: string;
    intercept: number;
    slope: number;
    mae: number | null;
    rmse: number | null;
    r2: number | null;
    mape: number | null;
    directional_accuracy: number | null;
    naive_mae: number | null;
    beats_naive: boolean;
    sample: SampleInfo;
    trained_at: string;
    model_label: string;
  };
  forecast: {
    date: string;
    date_verified: boolean;
    predicted_price: number;
    percentage_change: number;
    direction: string;
    error_band_low: number | null;
    error_band_high: number | null;
    band_label: string;
  };
  watchlist_overview: {
    rows: Array<{
      ticker: string;
      name: string;
      currency_symbol: string;
      latest_price: number;
      change_pct: number;
      total_return_pct: number;
      sparkline: number[];
      sparkline_dates: string[];
    }>;
    normalized: SeriesPoint[];
  };
  insights: string[];
  disclaimer: string;
}

export interface TrendPayload {
  meta: ApiMeta;
  series: Array<{
    date: string;
    Close: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rolling_high: number | null;
    rolling_low: number | null;
  }>;
  metrics: {
    latest: number;
    average_close: number;
    highest: number;
    lowest: number;
    highest_date: string;
    lowest_date: string;
    distance_from_high_pct: number;
    distance_from_low_pct: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    close_vs_sma20_pct: number | null;
    close_vs_sma50_pct: number | null;
    close_vs_sma200_pct: number | null;
    sma20_slope_5d_pct: number | null;
    sma20_sma50_spread_pct: number | null;
    golden_cross: boolean | null;
    observations: number;
  };
  trends: { short_term: string; medium_term: string; long_term: string };
  insights: string[];
}

export interface ReturnsPayload {
  meta: ApiMeta;
  available: boolean;
  message?: string;
  series?: {
    returns: Array<{ date: string; return_pct: number }>;
    cumulative: Array<{ date: string; cumulative_return_pct: number }>;
    drawdown: Array<{ date: string; drawdown_pct: number }>;
    rolling_volatility: Array<{ date: string; rolling_volatility_pct: number }>;
    histogram: HistogramBin[];
    gains: HistogramBin[];
    losses: HistogramBin[];
  };
  metrics?: {
    average_daily_return_pct: number;
    daily_std_pct: number;
    annualized_volatility_pct: number;
    cumulative_return_pct: number;
    max_drawdown_pct: number;
    max_drawdown_date: string;
    best_day: { date: string; return_pct: number };
    worst_day: { date: string; return_pct: number };
    positive_share_pct: number;
    average_gain_pct: number;
    average_loss_pct: number;
    observations: number;
  };
  insights: string[];
}

export interface ComparisonMetric {
  total_return_pct: number;
  average_daily_return_pct: number;
  annualized_volatility_pct: number;
  start_price: number;
  end_price: number;
  currency: string;
  currency_symbol: string;
}

export interface ComparisonPayload {
  tickers: string[];
  benchmark: string;
  metas: Record<string, { ticker: string; name: string; currency: string; currency_symbol: string; exchange: string }>;
  metrics: Record<string, ComparisonMetric>;
  best: string;
  worst: string;
  common_observations: number;
  date_range: { start: string; end: string };
  average_pairwise_correlation: number;
  series: {
    normalized: SeriesPoint[];
    returns: SeriesPoint[];
    correlation: { x: string[]; y: string[]; z: number[][] };
    rolling_correlation: Record<string, Array<{ date: string; correlation: number }>>;
  };
  insights: string[];
}

export interface QualityMetrics {
  raw_records: number;
  cleaned_records: number;
  quality: QualityCounts;
  missing_by_field: Record<string, number>;
  missing_total: number;
  duplicate_dates: number;
  invalid_prices: number;
  first_date: string;
  last_date: string;
  rows_removed: number;
  usable_pct: number | null;
  unique_dates: number;
  price_min: number;
  price_max: number;
  price_mean: number;
}

export interface DataQualityPayload {
  meta: ApiMeta;
  metrics: QualityMetrics;
  series: {
    price_histogram: HistogramBin[];
    monthly_counts: Array<{ month: string; observations: number }>;
    daily_counts: Array<{ date: string; observations: number }>;
    availability: Array<{ month: string; observations: number }>;
  };
  insights: string[];
}

export interface DatasetPayload {
  meta: ApiMeta;
  rows: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  total: number;
  page: number;
  page_size: number;
  pages: number;
  quality: QualityMetrics;
  dataset_definition: string;
}

export interface Coefficients {
  intercept: number;
  slope: number;
  equation: string;
  training_r2: number | null;
}

export interface OperationalCoefficients {
  intercept: number;
  slope: number;
  equation: string;
  n_observations: number;
  fitted_through: string;
}

export interface BaseMetrics {
  label?: string;
  mae: number | null;
  mse: number | null;
  rmse: number | null;
  r2: number | null;
  mape: number | null;
  directional_accuracy: number | null;
  n: number;
}

export interface MetricsBundle {
  test: BaseMetrics;
  naive: BaseMetrics;
  train: BaseMetrics;
  improvement?: { mae_pct: number | null; rmse_pct: number | null };
}

export interface ModelMetricsPayload {
  ticker: string;
  meta: ApiMeta;
  model_label: string;
  coefficients: Coefficients;
  operational_coefficients?: OperationalCoefficients;
  sample: SampleInfo;
  metrics: MetricsBundle;
  residual_stats: {
    count: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    mean_abs: number;
    overpredicted_share: number;
    underpredicted_share: number;
  };
  trained_at: string;
  insights: string[];
}

export interface DirectionRow {
  date: string;
  actual_direction: number;
  predicted_direction: number;
  correct: boolean | null;
}

export interface WalkForwardPayload {
  metrics: BaseMetrics;
  n_predictions: number;
  initial_train_size: number;
  method: string;
  series: Array<{ date: string; actual: number; predicted: number; previous: number; error: number; abs_error: number; direction_correct: boolean }>;
}

export interface BacktestPayload extends ModelMetricsPayload {
  series: {
    test: PredictionRow[];
    predictions_vs_actual: Array<{ date: string; actual: number; predicted: number; previous: number }>;
    direction: DirectionRow[];
    residuals: Array<{ date: string; residual: number }>;
  };
  walk_forward: WalkForwardPayload | null;
  disclaimer: string;
}

export interface ForecastStep {
  step: number;
  forecast_date: string;
  input_price: number;
  predicted_price: number;
  change: number;
  change_pct: number;
}

export interface ForecastPayload {
  ticker: string;
  name: string;
  currency: string;
  currency_symbol: string;
  last_observation: { date: string; close: number };
  forecast: {
    date: string;
    date_verified: boolean;
    calendar: string;
    calendar_note: string;
    predicted_price: number;
    absolute_change: number;
    percentage_change: number;
    direction: string;
    error_band_low: number | null;
    error_band_high: number | null;
    band_label: string;
    generated_at: string;
  };
  equation: string;
  coefficients: { intercept: number; slope: number };
  horizon: number;
  steps: ForecastStep[];
  history: Array<{ date: string; close: number }>;
  error_histogram: HistogramBin[];
  residual_stats: ModelMetricsPayload["residual_stats"];
  insights: string[];
  model_sample: SampleInfo;
  metrics: BaseMetrics;
  meta: ApiMeta;
  model: {
    equation: string;
    holdout_intercept: number;
    holdout_slope: number;
    operational_intercept: number;
    operational_slope: number;
    sample: SampleInfo;
    test_metrics: BaseMetrics;
    naive_metrics: BaseMetrics;
  };
}

export interface DiagnosticsStats {
  n: number;
  mean: number;
  std: number;
  skewness: number;
  excess_kurtosis: number;
  jarque_bera_stat: number;
  jarque_bera_p: number;
  breusch_pagan_stat: number;
  breusch_pagan_p: number;
  acf_band: number;
  sigma_band: number;
  significant_acf_lags: number[];
  outlier_threshold: number;
}

export interface DiagnosticsPayload {
  available: boolean;
  message?: string;
  stats: DiagnosticsStats;
  series: {
    vs_fitted: Array<{ fitted: number; residual: number; date: string }>;
    over_time: Array<{ date: string; residual: number; band: number }>;
    histogram: HistogramBin[];
    qq: { points: Array<{ theoretical: number; sample: number }>; slope: number; intercept: number };
    acf: Array<{ lag: number; value: number }>;
  };
  outliers: Array<{ date: string; residual: number; actual: number; predicted: number; z_score: number }>;
  insights: string[];
  ticker: string;
  meta: ApiMeta;
  sample: SampleInfo;
  coefficients: Coefficients;
}

export interface ModelInsightsPayload {
  meta: ApiMeta;
  equation: string;
  coefficients: Coefficients;
  operational_coefficients: OperationalCoefficients;
  feature: { name: string; description: string };
  target: { name: string; description: string };
  sample: SampleInfo;
  metrics: MetricsBundle;
  scatter: {
    train: Array<{ x: number; y: number; date: string }>;
    test: Array<{ x: number; y: number; date: string }>;
    line: Array<{ x: number; y: number }>;
  };
  example: {
    x: number;
    intercept: number;
    slope: number;
    predicted: number;
    math: string;
    one_unit_change: number;
    currency_symbol: string;
    currency: string;
  };
  sensitivity: Array<{ x: number; predicted: number; difference_vs_latest: number; x_change_pct: number }>;
  prediction_comparison: Array<{ input_price: number; predicted_price: number }>;
  residual_histogram: HistogramBin[];
  explanations: string[];
  disclaimer: string;
}

export interface PredictionRecord {
  id: number;
  ticker: string;
  model_run_id: number | null;
  base_date: string;
  input_price: number;
  predicted_price: number;
  predicted_change_pct: number;
  forecast_date: string;
  forecast_date_verified: boolean;
  coefficients: { intercept: number; slope: number };
  train_range: { start: string; end: string };
  metrics: { mae: number | null; rmse: number | null; r2: number | null; mape: number | null };
  prediction_ts: string;
  actual_price: number | null;
  absolute_error: number | null;
  percentage_error: number | null;
  resolved_at: string | null;
  status: string;
}

export interface PredictionsPayload {
  predictions: PredictionRecord[];
  stats: {
    total: number;
    resolved: number;
    pending: number;
    mae: number | null;
    mape: number | null;
    directional_hit_rate: number | null;
  };
  by_ticker: Array<{ ticker: string; count: number; mae: number | null; mape: number | null }>;
  monthly: Array<{ month: string; count: number; mape: number | null }>;
  series: {
    predictions_vs_actual: Array<{
      date: string;
      ticker: string;
      input_price: number;
      predicted_price: number;
      actual_price: number | null;
      percentage_error: number | null;
      resolved_at: string | null;
    }>;
    error_over_time: Array<{ date: string; ticker: string; percentage_error: number | null }>;
    error_histogram: HistogramBin[];
  };
  insights: string[];
  auto_resolved_now: number;
}

export interface AlertRecord {
  id: number;
  ticker: string | null;
  alert_type: string;
  threshold: number | null;
  enabled: boolean;
  created_ts: string;
}

export interface AlertEventRecord {
  id: number;
  alert_id: number;
  ticker: string | null;
  alert_type: string;
  message: string;
  created_ts: string;
}

export interface AlertsPayload {
  alerts: AlertRecord[];
  events: AlertEventRecord[];
  alert_types: Array<{ type: string; description: string }>;
  scheduling_note: string;
}
