import type { Metadata } from "next";
import { LoginView } from "@/components/marketing/login-view";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to StockSense AI with a browser-only demo profile, or continue as a guest to the analytics workspace.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <LoginView initialMode={mode === "signup" ? "signup" : "signin"} />;
}
