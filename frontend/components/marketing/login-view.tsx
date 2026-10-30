"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  Eye,
  EyeOff,
  Info,
  LineChart,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { useSession } from "@/components/providers";
import { initials } from "@/lib/session";
import { cn } from "@/components/ui/cn";

type Mode = "signin" | "signup";
type Errors = { name?: string; email?: string; password?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function safeNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("next") ?? "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return "/dashboard";
  return raw;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12px] font-medium text-[#d5dff2]">
          {label}
        </label>
        {hint ? <span className="text-[10px] text-[var(--faint)]">{hint}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11px] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = cn(
  "h-11 w-full rounded-xl border bg-[#080d15] px-3.5 text-[14px] text-ink transition-colors",
  "placeholder:text-[var(--faint)] focus:outline-none focus:ring-4 focus:ring-accent/10",
);

export function LoginView({ initialMode = "signin" }: { initialMode?: Mode }) {
  const router = useRouter();
  const { session, ready, name: sessionName, signIn, signOut } = useSession();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const clearError = (field: keyof Errors) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Errors = {};
    if (!EMAIL.test(email.trim())) next.email = "Enter a valid email address, like you@example.com.";
    if (password.length < 8) next.password = "Use at least 8 characters. This is a demo password, not a stored credential.";
    if (mode === "signup" && name.trim().length > 60) next.name = "Keep the display name under 60 characters.";

    if (next.email || next.password || next.name) {
      setErrors(next);
      if (next.name) nameRef.current?.focus();
      else if (next.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    signIn({ email: email.trim(), name: name.trim() }, remember);
    router.replace(safeNext());
  };

  const borderFor = (field: keyof Errors) =>
    errors[field]
      ? "border-negative/60 focus:border-negative/70 focus:ring-negative/10"
      : "border-border focus:border-accent/55";

  return (
    <div className="cinema min-h-dvh">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1560px] lg:grid-cols-[1.04fr_0.96fr]">
        <aside className="relative hidden overflow-hidden border-r border-border lg:block">
          <Image
            src="/brand/hero-plinth.png"
            alt="Chrome currency cube, stacked silver coins, and a gold growth arrow lit on dark pedestals."
            fill
            priority
            sizes="(min-width: 1560px) 800px, 52vw"
            className="object-cover object-[66%_50%] opacity-[0.92]"
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,12,0.95)_0%,rgba(5,7,12,0.62)_46%,rgba(5,7,12,0.16)_100%)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(0deg,#05070c_0%,rgba(5,7,12,0.62)_34%,transparent_72%)]"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] grid-lines opacity-60" aria-hidden="true" />

          <div className="relative z-10 flex h-full flex-col p-10 xl:p-14">
            <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="StockSense AI home">
              <BrandMark className="h-9 w-9 rounded-xl" />
              <Wordmark subtitle="Market intelligence" />
            </Link>

            <div className="mt-auto max-w-[430px]">
              <p className="font-display text-[clamp(2rem,2.7vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
                Understand the Market.
                <span className="mt-1 block text-[#c3cfe6]">Predict with Intelligence.</span>
              </p>
              <p className="mt-4 max-w-[42ch] text-[13.5px] leading-relaxed text-muted">
                Historical market data, a single transparent regression line, and interactive analytics — grounded in
                live Yahoo Finance history.
              </p>

              <div className="mt-8 grid gap-3.5">
                <div className="flex items-start gap-2.5">
                  <LineChart size={14} className="mt-0.5 shrink-0 text-[var(--glacier)]" />
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-[var(--chrome)]">Simple Linear Regression.</span> Y = b₀ + b₁X,
                    evaluated on a held-out window.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Activity size={14} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-[var(--chrome)]">Yahoo Finance via yfinance.</span> Live adjusted
                    closes, cached and timestamped. No fabricated prices.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-[var(--chrome)]">Browser-only demo session.</span> No server
                    account is created in this build.
                  </p>
                </div>
              </div>

              <p className="mt-8 border-t border-border pt-4 text-[10px] text-faint">
                Educational analytics · Not investment advice · Data may be delayed
              </p>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-dvh flex-col">
          <div className="relative h-[132px] overflow-hidden border-b border-border lg:hidden">
            <Image
              src="/brand/hero-plinth.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[66%_42%] opacity-80"
            />
            <div
              className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,12,0.94),rgba(5,7,12,0.35))]"
              aria-hidden="true"
            />
            <div className="relative z-10 flex h-full items-center justify-between px-5">
              <Link href="/" className="flex items-center gap-2.5" aria-label="StockSense AI home">
                <BrandMark className="h-8 w-8 rounded-lg" />
                <Wordmark subtitle="Market intelligence" />
              </Link>
              <Link
                href="/"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-[#05070c]/60 px-3 text-[11px] font-medium text-muted backdrop-blur-sm transition-colors hover:text-ink"
              >
                <ArrowLeft size={12} />
                Home
              </Link>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
            <div className="w-full max-w-[420px] animate-fade-up">
              <Link
                href="/"
                className="mb-8 hidden items-center gap-1.5 text-[11.5px] font-medium text-faint transition-colors hover:text-ink lg:inline-flex"
              >
                <ArrowLeft size={12} />
                Back to landing
              </Link>

              {ready && session ? (
                <div>
                  <h1 className="font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
                    You&rsquo;re already signed in.
                  </h1>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                    This browser holds a demo profile. Continue into the workspace or end the session.
                  </p>

                  <div className="mt-7 flex items-center gap-3 rounded-2xl border border-border bg-white/[0.02] p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/12 font-mono text-[12px] font-semibold text-accent">
                      {initials(sessionName ?? "")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{sessionName}</p>
                      <p className="truncate text-[11px] text-faint">{session.email}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-2">
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-semibold text-accent-ink transition-all hover:brightness-110"
                    >
                      Continue to workspace
                      <ArrowRight size={14} />
                    </Link>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border text-[12.5px] font-medium text-muted transition-colors hover:border-border-strong hover:text-ink"
                    >
                      <LogOut size={13} />
                      Sign out of this browser
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1
                    className="font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[2.15rem]"
                    aria-live="polite"
                  >
                    {mode === "signin" ? "Sign in to your workspace." : "Create your demo workspace."}
                  </h1>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                    {mode === "signin"
                      ? "Pick up your charts, journal, and watchlist where you left them."
                      : "No email confirmation, no server account — just a local profile for this browser."}
                  </p>

                  <form noValidate onSubmit={submit} className="mt-7 space-y-4">
                    {mode === "signup" ? (
                      <Field id="login-name" label="Display name" hint="Optional" error={errors.name}>
                        <input
                          ref={nameRef}
                          id="login-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          value={name}
                          onChange={(event) => {
                            setName(event.target.value);
                            clearError("name");
                          }}
                          placeholder="Ada Lovelace"
                          aria-invalid={Boolean(errors.name)}
                          aria-describedby={errors.name ? "login-name-error" : undefined}
                          className={cn(inputClass, borderFor("name"))}
                        />
                      </Field>
                    ) : null}

                    <Field id="login-email" label="Email" error={errors.email}>
                      <input
                        ref={emailRef}
                        id="login-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          clearError("email");
                        }}
                        placeholder="you@example.com"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "login-email-error" : undefined}
                        className={cn(inputClass, borderFor("email"))}
                      />
                    </Field>

                    <Field
                      id="login-password"
                      label="Password"
                      hint={mode === "signin" ? "Demo: any 8+ characters" : "At least 8 characters"}
                      error={errors.password}
                    >
                      <div className="relative">
                        <input
                          ref={passwordRef}
                          id="login-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "signin" ? "current-password" : "new-password"}
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            clearError("password");
                          }}
                          placeholder={mode === "signin" ? "Enter your password" : "Create a password"}
                          aria-invalid={Boolean(errors.password)}
                          aria-describedby={errors.password ? "login-password-error" : undefined}
                          className={cn(inputClass, borderFor("password"), "pr-11")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/[0.04] hover:text-ink"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </Field>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(event) => setRemember(event.target.checked)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-[#080d15] accent-[var(--accent)]"
                        />
                        Keep me signed in on this device
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-semibold text-accent-ink shadow-[0_14px_34px_-18px_var(--accent)] transition-all hover:brightness-110"
                    >
                      {mode === "signin" ? "Sign in" : "Create demo account"}
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>

                  <div className="mt-5 flex items-center gap-3">
                    <span className="hairline flex-1" />
                    <span className="text-[9.5px] uppercase tracking-[0.16em] text-[var(--faint)]">or</span>
                    <span className="hairline flex-1" />
                  </div>

                  <Link
                    href="/dashboard"
                    className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-white/[0.02] text-[12.5px] font-medium text-ink transition-colors hover:border-border-strong hover:bg-white/[0.04]"
                  >
                    Continue as guest
                    <ArrowRight size={13} className="text-faint" />
                  </Link>

                  <p className="mt-5 text-center text-[11.5px] text-muted">
                    {mode === "signin" ? "New to StockSense AI?" : "Already have a demo profile?"}{" "}
                    <button
                      type="button"
                      onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                      className="font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
                    >
                      {mode === "signin" ? "Create an account" : "Sign in instead"}
                    </button>
                  </p>

                  <div className="mt-7 flex gap-2.5 rounded-xl border border-[rgba(228,189,125,0.22)] bg-[rgba(228,189,125,0.05)] p-3.5">
                    <Info size={14} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                    <p className="text-[11px] leading-relaxed text-muted">
                      <span className="font-medium text-[var(--chrome)]">Demo access.</span> No account is created and
                      no credentials are sent anywhere. The profile you enter lives only in this browser and can be
                      cleared by signing out.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4 sm:px-8">
            <p className="text-center text-[10px] text-faint lg:text-left">
              StockSense AI · Demo session · Educational analytics, not investment advice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
