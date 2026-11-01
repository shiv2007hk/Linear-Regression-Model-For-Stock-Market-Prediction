import { API_BASE } from "@/lib/api";

export interface CopilotToolSpec {
  name: string;
  description: string;
}

export interface CopilotStatus {
  configured: boolean;
  available: boolean;
  enabled: boolean;
  model: string;
  base_url: string;
  reason: string | null;
  streaming: boolean;
  tools: CopilotToolSpec[];
  limits: {
    timeout_seconds: number;
    max_output_tokens: number;
    rate_limit_requests: number;
    rate_limit_window_seconds: number;
    history_messages: number;
    tool_rounds: number;
  };
  disclaimer: string;
}

export interface ConversationRow {
  id: number;
  title: string;
  model: string;
  created_ts: string;
  updated_ts: string;
  message_count: number;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  tool_name: string | null;
  error_code: string | null;
  created_ts: string;
}

export interface ToolCallSummary {
  name: string;
  ok: boolean;
  characters: number | null;
  error?: { code: string; message: string } | null;
}

export type CopilotEvent =
  | {
      type: "start";
      conversation_id: number;
      model: string;
      history_messages: number;
      history_dropped: number;
      tools: string[];
    }
  | { type: "token"; delta: string }
  | { type: "tool"; phase: "request"; round: number; calls: Array<{ function?: { name?: string } }> }
  | { type: "tool"; phase: "result"; round: number; results: ToolCallSummary[] }
  | {
      type: "done";
      conversation_id: number;
      finish_reason: string;
      tool_rounds: number;
      characters: number;
      truncated: boolean;
    }
  | { type: "error"; error: { code: string; message: string }; conversation_id?: number };

export interface CopilotContext {
  page: string;
  section?: string;
  ticker?: string;
  period?: string;
}

export function parseFrames(buffer: string): { events: CopilotEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: CopilotEvent[] = [];
  for (const part of parts) {
    const dataLine = part
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    try {
      const payload = JSON.parse(dataLine.slice(5).trim()) as CopilotEvent;
      if (payload && typeof payload.type === "string") events.push(payload);
    } catch {
      // A partial or malformed frame is dropped; the stream keeps going.
    }
  }
  return { events, rest };
}

export async function fetchConversations(signal?: AbortSignal): Promise<{ conversations: ConversationRow[]; count: number }> {
  const res = await fetch(`${API_BASE}/api/chat/conversations`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Conversation list unavailable (HTTP ${res.status}).`);
  return res.json();
}

export async function fetchConversation(
  id: number,
  signal?: AbortSignal,
): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Conversation ${id} unavailable (HTTP ${res.status}).`);
  return res.json();
}

export async function deleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`Could not delete conversation (HTTP ${res.status}).`);
}

/** POST /api/chat/stream and yield every SSE frame until the server closes the turn. */
export async function* streamTurn(
  params: { message: string; conversation_id?: number | null; context?: CopilotContext },
  signal: AbortSignal,
): AsyncGenerator<CopilotEvent> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        message: params.message,
        conversation_id: params.conversation_id ?? null,
        context: params.context ?? null,
      }),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Could not reach the backend. The Copilot sent no request and produced no answer.");
  }

  if (!res.ok) {
    let message = `The Copilot returned HTTP ${res.status}.`;
    let code = `http_${res.status}`;
    try {
      const payload = await res.json();
      message = payload?.error?.message ?? message;
      code = payload?.error?.code ?? code;
    } catch {
      // non-JSON error body
    }
    yield { type: "error", error: { code, message } };
    return;
  }

  if (!res.body) {
    yield { type: "error", error: { code: "chat_stream_unavailable", message: "The browser gave no response body to read." } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseFrames(buffer);
    buffer = rest;
    for (const event of events) yield event;
  }
  const { events } = parseFrames(`${buffer}\n\n`);
  for (const event of events) yield event;
}
