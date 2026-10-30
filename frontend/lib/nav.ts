export interface NavItem {
  href: string;
  label: string;
  icon: string;
  short?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", short: "00" }],
  },
  {
    label: "Research",
    items: [
      { href: "/market-explorer", label: "Market Explorer", icon: "Compass" },
      { href: "/data-quality", label: "Historical Data", icon: "Database" },
      { href: "/trend-analysis", label: "Trend Analysis", icon: "TrendingUp" },
      { href: "/returns-volatility", label: "Returns & Volatility", icon: "Activity" },
      { href: "/comparison", label: "Comparison", icon: "GitCompareArrows" },
    ],
  },
  {
    label: "Machine Learning",
    items: [
      { href: "/model-lab", label: "Model Lab", icon: "FlaskConical" },
      { href: "/backtesting", label: "Backtesting", icon: "History" },
      { href: "/forecast-studio", label: "Forecast Studio", icon: "Sparkles" },
      { href: "/residual-diagnostics", label: "Residual Diagnostics", icon: "ScanSearch" },
      { href: "/model-insights", label: "Model Insights", icon: "Lightbulb" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/watchlist", label: "Watchlist", icon: "Star" },
      { href: "/prediction-journal", label: "Prediction Journal", icon: "NotebookPen" },
    ],
  },
  {
    label: "Reference",
    items: [{ href: "/methodology", label: "Methodology", icon: "BookOpen" }],
  },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, item.label])),
);
