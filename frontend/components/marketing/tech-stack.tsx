"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  siFastapi,
  siNextdotjs,
  siNumpy,
  siPandas,
  siPlotly,
  siPython,
  siReact,
  siScikitlearn,
  siSqlite,
  siTailwindcss,
  siTypescript,
  type SimpleIcon,
} from "simple-icons";

interface Tech {
  name: string;
  role: string;
  icon?: SimpleIcon;
  glyph?: string;
}

const TECH: Tech[] = [
  { name: "Python", role: "Analysis runtime", icon: siPython },
  { name: "pandas", role: "Cleaning & frames", icon: siPandas },
  { name: "NumPy", role: "Numerical core", icon: siNumpy },
  { name: "scikit-learn", role: "The regression", icon: siScikitlearn },
  { name: "yfinance", role: "Yahoo Finance feed", glyph: "Y!" },
  { name: "FastAPI", role: "Typed REST API", icon: siFastapi },
  { name: "SQLite", role: "Local persistence", icon: siSqlite },
  { name: "React", role: "Interface runtime", icon: siReact },
  { name: "Next.js", role: "App router", icon: siNextdotjs },
  { name: "TypeScript", role: "Typed client", icon: siTypescript },
  { name: "Tailwind CSS", role: "Design tokens", icon: siTailwindcss },
  { name: "Plotly", role: "Interactive charts", icon: siPlotly },
];

export function TechStack() {
  return (
    <section id="technology" className="relative border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-5 sm:px-7 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
        <div className="self-start">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
            Built with tools you can name.
          </h2>
          <p className="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
            There is no proprietary black box between the closing price and the forecast. Data cleaning, the regression,
            the evaluation and the charts all run on open libraries.
          </p>
          <Link
            href="/methodology"
            className="group mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-ink"
          >
            How each calculation works
            <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border/50 sm:grid-cols-3 lg:grid-cols-4">
          {TECH.map((tech) => (
            <li
              key={tech.name}
              className="tech-cell group flex flex-col gap-3 bg-[#060a11] px-4 py-4 transition-colors hover:bg-[#080d16]"
            >
              <span className="flex h-8 w-8 items-center justify-center text-[var(--chrome)] opacity-80 transition-colors group-hover:text-accent group-hover:opacity-100">
                {tech.icon ? (
                  <svg viewBox="0 0 24 24" width="19" height="19" role="img" aria-label={tech.icon.title} fill="currentColor">
                    <path d={tech.icon.path} />
                  </svg>
                ) : (
                  <span className="tech-glyph font-mono text-[12px] font-bold tracking-tight">{tech.glyph}</span>
                )}
              </span>
              <span>
                <span className="block text-[11.5px] font-medium text-ink">{tech.name}</span>
                <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.09em] text-[var(--faint)]">
                  {tech.role}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
