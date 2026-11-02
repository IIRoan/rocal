"use client";

import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";
import type { CalendarView } from "./types";

interface CalendarSkeletonProps {
  view?: CalendarView;
  className?: string;
  compactView?: boolean;
}

// Deterministic event pattern per cell index (no Math.random)
const CELL_EVENT_WIDTHS: Record<number, string[]> = {
  2: ["w-full"],
  5: ["w-4/5", "w-3/5"],
  8: ["w-full"],
  11: ["w-3/4"],
  14: ["w-full", "w-2/3"],
  18: ["w-4/5"],
  22: ["w-full", "w-1/2"],
  26: ["w-3/4"],
  30: ["w-full"],
  33: ["w-3/5"],
};

const AGENDA_EVENT_COUNTS = { mon: 2, tue: 1, wed: 3, thu: 1, fri: 2, sat: 1, sun: 2 };

export function CalendarSkeleton({
  view = "month",
  className,
  compactView = false,
}: CalendarSkeletonProps) {
  if (view === "month") {
    return (
      <div className={cn("flex flex-col animate-fade-in", className)}>
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="py-2 px-3 border-r border-border/60 last:border-r-0"
            >
              <Skeleton className="h-3 w-7" />
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, w) => (
          <div
            key={w}
            className="grid grid-cols-7 border-b border-border/60 last:border-b-0 flex-1"
          >
            {Array.from({ length: 7 }).map((_, d) => {
              const idx = w * 7 + d;
              const eventWidths = CELL_EVENT_WIDTHS[idx] ?? [];
              return (
                <div
                  key={d}
                  className="p-2 border-r border-border/60 last:border-r-0 space-y-1 min-h-[5rem]"
                >
                  <Skeleton className="size-5 rounded-full" />
                  {eventWidths.map((width) => (
                    <Skeleton key={width} className={cn("h-4 rounded", width)} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  if (view === "week" || view === "3day") {
    const cols = view === "3day" ? 3 : 7;
    return (
      <div className={cn("flex flex-col h-full animate-fade-in", className)}>
        <div
          className="grid border-b border-border/60 bg-muted/20 shrink-0"
          style={{ gridTemplateColumns: `4rem repeat(${cols}, 1fr)` }}
        >
          <div className="p-3 border-r border-border/60" />
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="p-3 text-center border-r border-border/60 last:border-r-0 space-y-1"
            >
              <Skeleton className="h-3 w-6 mx-auto" />
              <Skeleton className="size-6 mx-auto rounded-full" />
            </div>
          ))}
        </div>
        <Skeleton className="flex-1 rounded-none" variant="wave" />
      </div>
    );
  }

  if (view === "day") {
    return (
      <div className={cn("flex h-full animate-fade-in", className)}>
        <div className="w-16 shrink-0 border-r border-border/60 bg-muted/10 space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start justify-end pr-2 pt-1"
              style={{ height: `${compactView ? 36 : 48}px` }}
            >
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        <Skeleton className="flex-1 rounded-none" variant="wave" />
      </div>
    );
  }

  if (view === "agenda") {
    return (
      <div className={cn("space-y-5 p-4 animate-fade-in", className)}>
        {Object.entries(AGENDA_EVENT_COUNTS).map(([day, count]) => (
          <div key={day} className="space-y-2">
            <div className="flex items-center gap-3 pb-1 border-b border-border/50">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-px flex-1" />
            </div>
            <div className="space-y-2 pl-4">
              {Array.from({ length: count }).map((_, ei) => (
                <div
                  key={ei}
                  className="flex items-center gap-3 py-2 px-3 rounded-md border border-border/40"
                >
                  <Skeleton className="h-3 w-10 shrink-0" />
                  <Skeleton className="size-3 rounded-full shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
