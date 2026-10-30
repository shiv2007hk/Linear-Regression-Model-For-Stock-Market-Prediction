"use client";

import type { ReactNode } from "react";
import { Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";

export function DataBoundary({
  loading,
  error,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  children,
}: {
  loading: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (error) {
    return <ErrorState message={error.message} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <>
        {skeleton ?? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}
      </>
    );
  }
  if (isEmpty) {
    return <>{empty ?? <EmptyState title="No data available" description="Adjust the stock or date range and try again." />}</>;
  }
  return <>{children}</>;
}

export function PanelSkeleton({ height = 280, rows = 1 }: { height?: number; rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-44" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full" style={{ height }} />
      ))}
    </div>
  );
}
