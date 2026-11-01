"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useTicker } from "@/components/providers";
import { cn } from "@/components/ui/cn";
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  streamTurn,
  type CopilotStatus,
  type ToolCallSummary,
} from "@/lib/copilot";

interface Entry {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolCallSummary[];
  error: { code: string; message: string } | null;
  note: string | null;
  streaming: boolean;
}

const STORAGE_KEY = "stocksense-copilot-conversation";
const SUGGESTIONS = [
  "What model actually powers the forecast here?",
  "Explain the current ticker's R-squared and error band.",
  "Is this series trending, and on what evidence?",
  "What is this model not able to see?",
];

let sequence = 0;
const nextId = () => {
  sequence += 1;
  return `entry-${sequence}`;
};

function toolLabel(tool: ToolCallSummary): string {
  if (tool.ok) return `${tool.name} · ${tool.characters ?? 0} chars`;
  return `${tool.name} · refused${tool.error?.code ? ` (${tool.error.code})` : ""}`;
}

export function Copilot() {
  const pathname = usePathname();
  const { ticker, period } = useTicker();
  const { data: status, error: statusError, mutate } = useApi<CopilotStatus>("/api/chat/status");
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<{ id: number; title: string; message_count: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const conversationId = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const ready = Boolean(status?.configured);
  const checking = !status && !statusError;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    conversationId.current = stored ? Number(stored) : null;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => composerRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries, busy]);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = useCallback((id: string, change: Partial<Entry> | ((entry: Entry) => Partial<Entry>)) => {
    setEntries((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...(typeof change === "function" ? change(row) : change) } : row)),
    );
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || busy || !ready) return;

      setDraft("");
      const userId = nextId();
      const assistantId = nextId();
      setEntries((rows) => [
        ...rows,
        { id: userId, role: "user", text: message, tools: [], error: null, note: null, streaming: false },
        { id: assistantId, role: "assistant", text: "", tools: [], error: null, note: null, streaming: true },
      ]);

      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);

      let settled = false;
      try {
        for await (const event of streamTurn(
          {
            message,
            conversation_id: conversationId.current,
            context: { page: pathname, ticker, period },
          },
          controller.signal,
        )) {
          if (event.type === "start") {
            conversationId.current = event.conversation_id;
            if (typeof window !== "undefined") {
              window.localStorage.setItem(STORAGE_KEY, String(event.conversation_id));
            }
            patch(assistantId, {
              note: `${event.model} · ${event.history_messages} history message${event.history_dropped ? ` · ${event.history_dropped} aged out` : ""}`,
            });
          } else if (event.type === "token") {
            patch(assistantId, (row) => ({ text: row.text + event.delta }));
          } else if (event.type === "tool" && event.phase === "result") {
            patch(assistantId, (row) => ({ tools: [...row.tools, ...event.results] }));
          } else if (event.type === "done") {
            settled = true;
            patch(assistantId, {
              streaming: false,
              note:
                event.finish_reason === "error"
                  ? null
                  : `${event.finish_reason} · ${event.tool_rounds} tool round${event.tool_rounds === 1 ? "" : "s"}${event.truncated ? " · truncated" : ""}`,
            });
          } else if (event.type === "error") {
            settled = true;
            patch(assistantId, { streaming: false, error: event.error });
          }
        }
        if (!settled) patch(assistantId, { streaming: false });
      } catch (caught) {
        const aborted = (caught as Error).name === "AbortError";
        patch(assistantId, {
          streaming: false,
          error: aborted
            ? null
            : { code: "client_error", message: (caught as Error).message || "The Copilot request failed." },
          note: aborted ? "stopped by you" : null,
        });
      } finally {
        setBusy(false);
        abort.current = null;
        requestAnimationFrame(() => composerRef.current?.focus());
      }
    },
    [busy, patch, pathname, period, ready, ticker],
  );

  const openHistory = useCallback(async () => {
    setHistoryOpen((value) => !value);
    if (historyOpen) return;
    setHistoryLoading(true);
    try {
      const payload = await fetchConversations();
      setConversations(payload.conversations.map((row) => ({ id: row.id, title: row.title, message_count: row.message_count })));
    } catch {
      setConversations([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyOpen]);

  const loadConversation = useCallback(
    async (id: number) => {
      const detail = await fetchConversation(id);
      setEntries(
        detail.messages
          .filter((row) => row.role === "user" || row.role === "assistant")
          .map((row) => ({
            id: nextId(),
            role: row.role as "user" | "assistant",
            text: row.content,
            tools: row.tool_name ? [{ name: row.tool_name, ok: !row.error_code, characters: null, error: null }] : [],
            error: row.error_code ? { code: row.error_code, message: "This turn ended with an error." } : null,
            note: null,
            streaming: false,
          })),
      );
      conversationId.current = id;
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, String(id));
      setHistoryOpen(false);
    },
    [],
  );

  const startNew = useCallback(() => {
    setEntries([]);
    conversationId.current = null;
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    setHistoryOpen(false);
  }, []);

  const removeConversation = useCallback(
    async (id: number) => {
      try {
        await deleteConversation(id);
        setConversations((rows) => rows.filter((row) => row.id !== id));
        if (conversationId.current === id) startNew();
      } catch {
        // The row stays; the user can retry.
      }
    },
    [startNew],
  );

  const statusTone = useMemo(() => {
    if (checking) return { label: "Checking", dot: "bg-[var(--faint)]" };
    if (!ready) return { label: "Not configured", dot: "bg-warn" };
    return { label: status?.model ?? "DeepSeek", dot: "bg-accent" };
  }, [checking, ready, status?.model]);

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close the AI Copilot" : "Open the AI Copilot"}
        className="copilot-launcher panel fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2.5 rounded-full pl-3.5 pr-4 text-[12.5px] font-medium text-ink"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Sparkles size={16} className={cn("relative z-10", ready ? "text-accent" : "text-[var(--faint)]")} />
        </span>
        <span className="hidden sm:inline">AI Copilot</span>
        <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} aria-hidden="true" />
      </button>

      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="StockSense AI Copilot"
          className="copilot-panel panel fixed bottom-[84px] right-4 z-40 flex max-h-[min(78vh,680px)] w-[min(calc(100vw-2rem),410px)] flex-col overflow-hidden rounded-2xl sm:right-5"
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles size={14} className={ready ? "text-accent" : "text-[var(--faint)]"} />
            <h2 className="font-display text-[14.5px] font-semibold tracking-[-0.015em] text-ink">AI Copilot</h2>
            <span className="chip ml-1 gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} aria-hidden="true" />
              {statusTone.label}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => void mutate()}
                className="copilot-icon"
                aria-label="Re-check Copilot configuration"
                title="Re-check configuration"
              >
                <RefreshCw size={12} />
              </button>
              <button type="button" onClick={() => void openHistory()} className="copilot-icon" aria-label="Conversation history" title="History">
                <History size={13} />
              </button>
              <button type="button" onClick={startNew} className="copilot-icon" aria-label="Start a new chat" title="New chat">
                <Plus size={13} />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="copilot-icon" aria-label="Close the AI Copilot" title="Close">
                <X size={13} />
              </button>
            </div>
          </header>

          {historyOpen ? (
            <div className="max-h-52 overflow-auto border-b border-border bg-black/[0.12] px-3 py-2">
              {historyLoading ? (
                <p className="flex items-center gap-2 py-2 text-[11.5px] text-muted">
                  <Loader2 size={12} className="animate-spin" /> Loading conversations…
                </p>
              ) : conversations.length === 0 ? (
                <p className="py-2 text-[11.5px] text-faint">No saved conversations yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {conversations.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void loadConversation(row.id)}
                        className="min-w-0 flex-1 truncate text-left text-[12px] text-muted transition-colors hover:text-ink"
                      >
                        {row.title}
                        <span className="ml-1.5 font-mono text-[9.5px] text-faint">{row.message_count}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeConversation(row.id)}
                        className="copilot-icon"
                        aria-label={`Delete conversation ${row.title}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {entries.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {ready ? (
                    <>
                      Ask about this screen, a symbol, or the regression itself. Every answer comes from this app's own
                      read-only tools — the Copilot has no way to invent a number, and no way to change anything.
                    </>
                  ) : statusError ? (
                    <>The backend is not reachable, so the Copilot cannot answer. Start the FastAPI service on port 8010.</>
                  ) : checking ? (
                    <>Checking whether the Copilot is configured…</>
                  ) : (
                    <>The Copilot is switched off rather than simulated — it will not answer without a credential.</>
                  )}
                </p>

                {ready ? (
                  <ul className="space-y-1.5">
                    {SUGGESTIONS.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => void send(item)}
                          className="w-full rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-left text-[12px] leading-snug text-muted transition-colors hover:border-[rgba(174,188,255,0.35)] hover:text-ink"
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-warn/35 bg-warn/[0.07] p-3">
                    <p className="text-[12px] font-medium text-ink">DeepSeek key required</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      {status?.reason ??
                        "Set DEEPSEEK_API_KEY in the backend environment (backend/.env or the process environment), then restart uvicorn."}
                    </p>
                    <ol className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-muted">
                      <li>1. Add <code className="font-mono text-[11px] text-ink">STOCKSENSE_DEEPSEEK_API_KEY=***</code> to backend/.env</li>
                      <li>2. Restart the backend on port 8010</li>
                      <li>3. Press re-check in this header</li>
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className={entry.role === "user" ? "flex justify-end" : "copilot-turn"}>
                  {entry.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-[rgba(174,188,255,0.22)] bg-[rgba(174,188,255,0.09)] px-3 py-2 text-[12.5px] leading-relaxed text-ink">
                      {entry.text}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {entry.tools.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.tools.map((tool, index) => (
                            <span
                              key={`${entry.id}-tool-${index}`}
                              className={cn(
                                "chip max-w-full truncate",
                                tool.ok ? "text-accent" : "border-warn/40 text-warn",
                              )}
                              title={tool.error?.message ?? undefined}
                            >
                              {toolLabel(tool)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink" aria-live="polite">
                        {entry.text}
                        {entry.streaming ? <span className="copilot-caret" aria-hidden="true" /> : null}
                      </p>
                      {entry.error ? (
                        <p className="rounded-lg border border-negative/35 bg-negative/[0.07] px-2.5 py-2 text-[11.5px] leading-relaxed text-ink">
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-negative">
                            {entry.error.code}
                          </span>
                          <br />
                          {entry.error.message}
                        </p>
                      ) : null}
                      {entry.note ? (
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{entry.note}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                rows={2}
                disabled={!ready || busy}
                placeholder={
                  ready ? "Ask about this screen, a symbol or the model… (Ctrl+Enter to send)" : "Add a DeepSeek API key to enable the Copilot"
                }
                className="input min-h-[52px] flex-1 resize-none leading-relaxed"
                aria-label="Message the AI Copilot"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted transition-colors hover:text-ink"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send(draft)}
                  disabled={!ready || draft.trim().length === 0}
                  className="btn-sheen flex h-9 w-9 items-center justify-center rounded-xl border border-accent/45 bg-accent/15 text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-faint"
                  aria-label="Send message"
                  title="Send (Ctrl+Enter)"
                >
                  <ArrowUp size={14} />
                </button>
              )}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              {status?.disclaimer ?? "Read-only tools over this app's data. Educational analysis, not investment advice."}
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
