import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        negative: "var(--negative)",
        positive: "var(--positive)",
        warn: "var(--warn)",
        info: "var(--info)",
        violet: "var(--violet)",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "Segoe UI Variable", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "JetBrains Mono", "Cascadia Mono", "Consolas", "monospace"],
        display: ["Bricolage Grotesque Variable", "Bricolage Grotesque", "Inter Variable", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 30px -18px rgba(0,0,0,0.6)",
        pop: "0 24px 60px -24px rgba(0,0,0,0.65)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
