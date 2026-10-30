"use client";

import { useApi } from "@/lib/hooks";
import type { FeaturedPayload } from "@/lib/types";

export function useFeatured() {
  const { data, error, isLoading, mutate } = useApi<FeaturedPayload>("/api/market-data/featured");
  return {
    data,
    quotes: data?.quotes ?? [],
    error,
    isLoading,
    mutate,
  };
}
