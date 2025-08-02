"use client";

import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";

interface CalendarSkeletonProps {
  view?: "month" | "week" | "day" | "agenda";
  className?: string;
}

export function CalendarSkeleton({
  view = "month",
  className,
}: CalendarSkeletonProps) {
  if (view === "month") {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* Calendar grid skeleton */}
        <div className="space-y-2">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>

          {/* Calendar cells */}
          {Array.from({ length: 6 }).map((_, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <div key={dayIndex} className="h-24 p-1 space-y-1">
                  <Skeleton className="h-4 w-6" />
                  {/* Random event skeletons */}
                  {Math.random() > 0.7 && <Skeleton className="h-4 w-full" />}
                  {Math.random() > 0.8 && <Skeleton className="h-4 w-3/4" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "week") {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* Week view skeleton */}
        <div className="space-y-2">
          {/* Days header */}
          <div className="grid grid-cols-8 gap-1">
            <div /> {/* Time column */}
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>

          {/* Time slots */}
          {Array.from({ length: 12 }).map((_, hourIndex) => (
            <div key={hourIndex} className="grid grid-cols-8 gap-1">
              <Skeleton className="h-12 w-16" />
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <div key={dayIndex} className="h-12 p-1">
                  {Math.random() > 0.8 && <Skeleton className="h-10 w-full" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "day") {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* Day view skeleton */}
        <div className="space-y-2">
          {/* Day header */}
          <Skeleton className="h-16 w-full" />

          {/* Time slots */}
          {Array.from({ length: 24 }).map((_, hourIndex) => (
            <div key={hourIndex} className="flex gap-2">
              <Skeleton className="h-12 w-16" />
              <div className="flex-1 h-12 p-1">
                {Math.random() > 0.9 && <Skeleton className="h-10 w-3/4" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "agenda") {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* Agenda items skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, dayIndex) => (
            <div key={dayIndex} className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <div className="space-y-2 pl-4">
                {Array.from({ length: Math.floor(Math.random() * 4) + 1 }).map(
                  (_, eventIndex) => (
                    <div key={eventIndex} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// Skeleton for event dialog
export function EventDialogSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="w-28 space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="w-28 space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>

      <div className="flex justify-between">
        <Skeleton className="h-10 w-10" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-16" />
        </div>
      </div>
    </div>
  );
}

// Skeleton for sidebar calendar
export function SidebarCalendarSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-1">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-6 w-6" />
        </div>
      </div>

      {/* Mini calendar skeleton */}
      <div className="space-y-1">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-4" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, dayIndex) => (
              <Skeleton key={dayIndex} className="h-6 w-6" />
            ))}
          </div>
        ))}
      </div>

      {/* Categories skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
