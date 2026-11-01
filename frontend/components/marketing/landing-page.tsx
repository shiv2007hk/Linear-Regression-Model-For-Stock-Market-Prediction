"use client";

import { LandingNav } from "@/components/marketing/landing-nav";
import { ScrollProgress } from "@/components/marketing/tilt";
import { Hero } from "@/components/marketing/hero";
import { TickerTape } from "@/components/marketing/ticker-tape";
import { StatBand } from "@/components/marketing/stat-band";
import { MarketBoard } from "@/components/marketing/market-board";
import { Features } from "@/components/marketing/features";
import { ModuleOrbit } from "@/components/marketing/module-orbit";
import { ModelFlow } from "@/components/marketing/model-flow";
import { AnalyticsShowcase } from "@/components/marketing/analytics-showcase";
import { TechStack } from "@/components/marketing/tech-stack";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

export function LandingPage() {
  return (
    <div className="cinema min-h-dvh">
      <ScrollProgress />
      <LandingNav />
      <main id="main-content">
        <Hero />
        <TickerTape />
        <StatBand />
        <MarketBoard />
        <Features />
        <ModuleOrbit />
        <ModelFlow />
        <AnalyticsShowcase />
        <TechStack />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
