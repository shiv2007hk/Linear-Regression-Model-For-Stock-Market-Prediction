import type { ReactNode } from "react";

export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
