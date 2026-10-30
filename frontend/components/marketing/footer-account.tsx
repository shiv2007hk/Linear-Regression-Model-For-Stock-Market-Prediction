"use client";

import Link from "next/link";
import { useSession } from "@/components/providers";

const CLASS = "text-[11.5px] text-[var(--muted)] transition-colors hover:text-ink";

export function FooterAccountLink() {
  const { session, ready, signOut } = useSession();
  if (ready && session) {
    return (
      <button type="button" onClick={signOut} className={CLASS}>
        Sign out
      </button>
    );
  }
  return (
    <Link href="/login" className={CLASS}>
      Sign in
    </Link>
  );
}
