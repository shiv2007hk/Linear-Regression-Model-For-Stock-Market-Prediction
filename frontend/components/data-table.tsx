"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/primitives";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T, index: number) => ReactNode;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowKey,
  emptyTitle = "No rows",
  emptyDescription,
  maxHeight = "none",
  dense = false,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
  maxHeight?: string;
  dense?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="table-shell">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={getRowKey(row, index)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      dense && "!py-1.5",
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row, index) : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState compact title={emptyTitle} description={emptyDescription} />
          </div>
        ) : null}
      </div>
      {footer ? <div className="border-t border-border bg-surface px-3 py-2 text-[10.5px] text-faint">{footer}</div> : null}
    </div>
  );
}
