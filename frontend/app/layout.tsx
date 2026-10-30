import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "StockSense AI — Stock Market Analytics & Price Prediction",
    template: "%s · StockSense AI",
  },
  description:
    "End-to-end stock market analytics and next-observation price forecasting with Simple Linear Regression, live Yahoo Finance data via yfinance, and interactive Plotly dashboards.",
  applicationName: "StockSense AI",
  keywords: [
    "stock market analytics",
    "simple linear regression",
    "yfinance",
    "price prediction",
    "financial dashboard",
  ],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#070b11",
  width: "device-width",
  initialScale: 1,
};

const themeScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("stocksense-theme");
    var theme = stored === "light" ? "light" : "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
  } catch (error) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
