"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, LogIn, LogOut, Menu, X } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { useSession, useToast } from "@/components/providers";
import { initials } from "@/lib/session";
import { cn } from "@/components/ui/cn";

const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#analytics", label: "Analytics" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#technology", label: "Technology" },
  { href: "#about", label: "About" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const { session, name, ready, signOut } = useSession();
  const { pushToast } = useToast();

  const handleSignOut = () => {
    signOut();
    setOpen(false);
    pushToast({
      title: "Signed out",
      description: "The demo profile was cleared from this browser.",
      tone: "info",
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const signedIn = ready && session;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-[#05070c]/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1280px] items-center gap-4 px-5 sm:px-7">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="StockSense AI home">
          <BrandMark className="h-9 w-9 rounded-xl" />
          <Wordmark subtitle="Market intelligence" className="hidden sm:block" />
        </Link>

        <nav aria-label="Landing sections" className="ml-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-underline relative rounded-full px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-4">
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="hidden items-center gap-2 rounded-full border border-border bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-border-strong sm:flex"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 font-mono text-[10px] font-semibold text-accent">
                  {initials(name ?? "")}
                </span>
                <span className="max-w-[110px] truncate text-[12px] font-medium text-ink">{name}</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-white/[0.02] px-3 text-[12px] font-medium text-[var(--muted)] transition-colors hover:border-negative/40 hover:text-negative sm:inline-flex"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
            >
              <LogIn size={13} />
              Sign in
            </Link>
          )}
          <Link
            href={signedIn ? "/dashboard" : "/login?mode=signup"}
            className="btn-sheen group inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-ink shadow-[0_10px_28px_-14px_var(--accent)] transition-all hover:brightness-110"
          >
            {signedIn ? "Open workspace" : "Get started"}
            <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-ink lg:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <div
        id="landing-mobile-nav"
        hidden={!open}
        className={cn("border-t border-border bg-[#05070c]/97 backdrop-blur-xl lg:hidden", !open && "hidden")}
      >
        <nav aria-label="Landing sections, mobile" className="mx-auto grid max-w-[1280px] gap-1 px-5 py-4">
          {LINKS.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-[14px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
            >
              {link.label}
              <span className="font-mono text-[10px] text-faint">{String(index + 1).padStart(2, "0")}</span>
            </a>
          ))}
          {signedIn ? (
            <div className="mt-2 border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-2.5 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 font-mono text-[10px] font-semibold text-accent">
                  {initials(name ?? "")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink">{name}</p>
                  <p className="text-[9.5px] text-faint">Demo session · local to this browser</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink"
                >
                  Open workspace
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border text-[13px] font-medium text-muted transition-colors hover:border-negative/40 hover:text-negative"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-full border border-border text-[13px] font-medium text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink"
              >
                Get started
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
