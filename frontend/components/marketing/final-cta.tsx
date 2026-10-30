import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { ParticleField } from "@/components/marketing/tilt";

export function FinalCta() {
  return (
    <section className="relative py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[1280px] px-5 sm:px-7">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <Image
            src="/brand/hero-plinth.png"
            alt=""
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover object-[74%_58%] opacity-85"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, #05070c 0%, rgba(5,7,12,0.96) 36%, rgba(5,7,12,0.62) 64%, rgba(5,7,12,0.28) 100%)",
            }}
          />
          <div
            className="absolute inset-0 sm:hidden"
            style={{ background: "linear-gradient(180deg, rgba(5,7,12,0.55) 0%, rgba(5,7,12,0.94) 62%, #05070c 100%)" }}
          />
          <span
            className="cta-orb left-[58%] top-[-12%] h-64 w-64"
            style={{ background: "radial-gradient(circle, rgba(63,224,172,0.55), transparent 65%)" }}
            aria-hidden="true"
          />
          <span
            className="cta-orb bottom-[-18%] right-[4%] h-72 w-72"
            style={{ background: "radial-gradient(circle, rgba(228,189,125,0.45), transparent 66%)", animationDelay: "-6s" }}
            aria-hidden="true"
          />
          <ParticleField count={5} className="opacity-70" />
          <span className="cta-sheen" aria-hidden="true" />
          <div className="relative z-10 flex min-h-[420px] max-w-[640px] flex-col justify-center px-6 py-12 sm:min-h-[440px] sm:px-10 lg:px-12">
            <span className="gold-rule w-16" aria-hidden="true" />
            <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
              Start Exploring the Market with StockSense AI.
            </h2>
            <p className="mt-4 max-w-[50ch] text-[13.5px] leading-relaxed text-[#c3cfe6]">
              Turn historical stock-market data into interactive insights and understandable machine-learning forecasts.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="btn-sheen group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-semibold text-accent-ink shadow-[0_16px_44px_-18px_var(--accent)] transition-all hover:brightness-110"
              >
                Launch StockSense AI
                <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/methodology"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 text-[13.5px] font-medium text-ink transition-colors hover:bg-white/[0.07]"
              >
                <BookOpen size={14} className="text-[var(--glacier)]" />
                Read the methodology
              </Link>
            </div>
            <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--faint)]">
              Educational analytics · no fabricated prices · not investment advice
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
