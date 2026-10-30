"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X, CornerDownLeft } from "lucide-react";
import { useApi, useDebounced } from "@/lib/hooks";
import { useTicker } from "@/components/providers";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/primitives";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quote_type: string;
  sector?: string | null;
}

export function TickerSearch({ compact = false }: { compact?: boolean }) {
  const { ticker, setTicker } = useTicker();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const debounced = useDebounced(query, 280);
  const shouldSearch = open && debounced.trim().length >= 2;
  const { data, isValidating } = useApi<{ results: SearchResult[] }>(
    shouldSearch ? `/api/market-data/search?q=${encodeURIComponent(debounced.trim())}` : null,
  );
  const results = shouldSearch ? data?.results ?? [] : [];

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const choose = (symbol: string) => {
    setTicker(symbol);
    setQuery("");
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
  };

  const submit = () => {
    if (highlight >= 0 && results[highlight]) {
      choose(results[highlight].symbol);
      return;
    }
    const raw = query.trim().toUpperCase();
    if (raw) choose(raw);
  };

  return (
    <div ref={wrapRef} className={cn("relative", compact ? "w-full" : "w-full max-w-[330px]")}>
      <div className="relative">
        <Search size={13.5} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((h) => Math.max(h - 1, -1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={ticker}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          spellCheck={false}
          className="input h-8 pl-8 pr-16 font-mono text-[11.5px] uppercase tracking-wide"
        />
        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isValidating && shouldSearch ? (
            <Spinner className="!text-faint" />
          ) : query ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setOpen(true);
              }}
              className="pointer-events-auto rounded p-0.5 text-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[9px] text-faint">/</kbd>
          )}
        </div>
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-pop"
        >
          {!shouldSearch ? (
            <div className="px-3 py-2.5 text-[11px] leading-relaxed text-faint">
              Type at least two characters, then pick a Yahoo Finance symbol. Examples:{" "}
              <button type="button" className="font-mono text-muted hover:text-accent" onClick={() => choose("RELIANCE.NS")}>
                RELIANCE.NS
              </button>
              ,{" "}
              <button type="button" className="font-mono text-muted hover:text-accent" onClick={() => choose("AAPL")}>
                AAPL
              </button>
              ,{" "}
              <button type="button" className="font-mono text-muted hover:text-accent" onClick={() => choose("^NSEI")}>
                ^NSEI
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-faint">
              {isValidating ? "Searching Yahoo Finance…" : "No matches. Press Enter to try the raw symbol."}
            </div>
          ) : (
            <ul className="max-h-72 overflow-auto py-1">
              {results.map((result, index) => (
                <li key={result.symbol}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(result.symbol)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                      index === highlight ? "bg-accent/10" : "hover:bg-surface-3",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-medium text-ink">{result.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-faint">
                        {result.symbol} · {result.exchange} {result.quote_type ? `· ${result.quote_type}` : ""}
                      </span>
                    </span>
                    <CornerDownLeft size={11} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-3 py-1.5 text-[9.5px] text-faint">
            Data from Yahoo Finance symbol search. Symbols are not guaranteed to be listed or tradable.
          </div>
        </div>
      ) : null}
    </div>
  );
}
