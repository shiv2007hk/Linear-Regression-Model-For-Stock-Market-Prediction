"use client";

import useSWR from "swr";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export function useApi<T>(key: string | null) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    key,
    (path: string) => apiGet<T>(path),
    { keepPreviousData: true },
  );
  return {
    data,
    error: error as Error | undefined,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = () => setMatches(media.matches);
    handler();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useCopyToClipboard(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, []);
  return [copied, copy];
}
