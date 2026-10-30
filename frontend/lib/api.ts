export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8010";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON error body
  }
  const message =
    payload?.error?.message ??
    payload?.detail?.message ??
    (typeof payload?.detail === "string" ? payload.detail : null) ??
    `The API returned HTTP ${res.status}.`;
  const code = payload?.error?.code ?? payload?.detail?.code;
  return new ApiError(message, res.status, code, payload?.error?.details);
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      `Cannot reach the StockSense API at ${API_BASE}. Start the FastAPI backend and try again.`,
      0,
      "network_error",
    );
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `Cannot reach the StockSense API at ${API_BASE}. Is the backend running?`,
      0,
      "network_error",
    );
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}
