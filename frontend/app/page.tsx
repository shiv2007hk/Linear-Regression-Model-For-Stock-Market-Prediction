import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: {
    absolute: "StockSense AI — Understand the Market. Predict with Intelligence.",
  },
  description:
    "An intelligent stock market analytics platform that transforms historical market data into meaningful insights using Simple Linear Regression and interactive financial analytics.",
};

export default function HomePage() {
  return <LandingPage />;
}
