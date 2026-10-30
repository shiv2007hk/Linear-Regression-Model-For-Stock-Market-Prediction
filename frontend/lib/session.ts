export interface Session {
  name: string;
  email: string;
  signedInAt: string;
}

export const SESSION_KEY = "stocksense-session";

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.email === "string" && typeof row.name === "string" && typeof row.signedInAt === "string";
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isSession(parsed)) return parsed;
    } catch {
      // corrupted demo session: fall through to the next store
    }
  }
  return null;
}

export function writeSession(session: Session, remember: boolean): void {
  const primary = remember ? window.localStorage : window.sessionStorage;
  const secondary = remember ? window.sessionStorage : window.localStorage;
  secondary.removeItem(SESSION_KEY);
  primary.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function displayName(session: Session): string {
  const name = session.name.trim();
  if (name) return name;
  return session.email.split("@")[0] || "Guest";
}

export function initials(value: string): string {
  const parts = value
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "SS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
