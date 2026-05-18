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
                  <Skeleton className="h-5 w-5 rounded-full" />
                  {eventWidths.map((w, ei) => (
                    <Skeleton key={ei} className={cn("h-4 rounded", w)} />
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
              <Skeleton className="h-6 w-6 mx-auto rounded-full" />
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
    const AGENDA_PATTERN = [2, 1, 3, 1, 2, 1, 2] as const;
    return (
      <div className={cn("space-y-5 p-4 animate-fade-in", className)}>
        {AGENDA_PATTERN.map((count, di) => (
          <div key={di} className="space-y-2">
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
                  <Skeleton className="h-3 w-3 rounded-full shrink-0" />
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

// Skeleton for event dialog
export function EventDialogSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <Skeleton className="h-6 w-32" variant="shimmer" />
        <Skeleton className="h-6 w-6 rounded" variant="shimmer" />
      </div>

      {/* Title field */}
      <div
        className="space-y-2 animate-slide-in"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" variant="shimmer" />
          <Skeleton className="h-4 w-12" variant="shimmer" />
        </div>
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Description field */}
      <div
        className="space-y-2 animate-slide-in"
        style={{ animationDelay: "0.2s" }}
      >
        <Skeleton className="h-4 w-20" variant="shimmer" />
        <Skeleton className="h-20 w-full rounded" variant="wave" />
      </div>

      {/* Calendar selection */}
      <div
        className="space-y-2 animate-slide-in"
        style={{ animationDelay: "0.3s" }}
      >
        <Skeleton className="h-4 w-16" variant="shimmer" />
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Date and time fields */}
      <div
        className="grid grid-cols-2 gap-4 animate-slide-in"
        style={{ animationDelay: "0.4s" }}
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-4 animate-slide-in"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
      </div>

      {/* All day toggle */}
      <div
        className="flex items-center space-x-2 animate-slide-in"
        style={{ animationDelay: "0.6s" }}
      >
        <Skeleton className="h-4 w-4 rounded" variant="shimmer" />
        <Skeleton className="h-4 w-24" variant="shimmer" />
      </div>

      {/* Location field */}
      <div
        className="space-y-2 animate-slide-in"
        style={{ animationDelay: "0.7s" }}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" variant="shimmer" />
          <Skeleton className="h-4 w-16" variant="shimmer" />
        </div>
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Action buttons */}
      <div
        className="flex justify-between pt-4 border-t border-border animate-scale-in"
        style={{ animationDelay: "0.8s" }}
      >
        <Skeleton className="h-10 w-16 rounded" variant="shimmer" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-16 rounded" variant="shimmer" />
          <Skeleton className="h-10 w-12 rounded" variant="shimmer" />
        </div>
      </div>
    </div>
  );
}

// Skeleton for sidebar calendar
export function SidebarCalendarSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-fade-in">
      {/* Header with navigation */}
      <div className="flex items-center justify-between animate-slide-in">
        <Skeleton className="h-5 w-20" variant="shimmer" />
        <div className="flex gap-1">
          <Skeleton className="h-6 w-6 rounded" variant="shimmer" />
          <Skeleton className="h-6 w-6 rounded" variant="shimmer" />
        </div>
      </div>

      {/* Mini calendar skeleton */}
      <div
        className="space-y-1 animate-slide-in"
        style={{ animationDelay: "0.1s" }}
      >
        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-3 w-full text-center"
              variant="shimmer"
            />
          ))}
        </div>

        {/* Calendar dates */}
        {Array.from({ length: 6 }).map((_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, dayIndex) => {
              const isToday = weekIndex === 2 && dayIndex === 3; // Mock today
              return (
                <Skeleton
                  key={dayIndex}
                  className={`h-6 w-6 ${isToday ? "rounded-full" : "rounded"}`}
                  variant={isToday ? "shimmer" : "wave"}
                  style={{
                    animationDelay: `${(weekIndex * 7 + dayIndex) * 0.02}s`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* My Calendars section */}
      <div
        className="space-y-3 animate-slide-in"
        style={{ animationDelay: "0.2s" }}
      >
        <Skeleton className="h-4 w-24" variant="shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 transition-colors"
          >
            <Skeleton className="h-3 w-3 rounded-full" variant="shimmer" />
            <Skeleton className="h-4 flex-1" variant="wave" />
            <Skeleton className="h-4 w-4 rounded" variant="shimmer" />
          </div>
        ))}
      </div>

      {/* Categories section */}
      <div
        className="space-y-3 animate-slide-in"
        style={{ animationDelay: "0.3s" }}
      >
        <Skeleton className="h-4 w-20" variant="shimmer" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 transition-colors"
          >
            <Skeleton
              className="h-3 w-3 rounded-full"
              variant="shimmer"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
            <Skeleton
              className="h-4 flex-1"
              variant="wave"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
