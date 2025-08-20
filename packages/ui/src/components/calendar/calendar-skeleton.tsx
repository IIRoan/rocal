"use client";

import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";
import { addDays, startOfWeek, format } from "date-fns";

interface CalendarSkeletonProps {
  view?: "month" | "week" | "day" | "agenda";
  className?: string;
}

export function CalendarSkeleton({
  view = "month",
  className,
}: CalendarSkeletonProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const daysOfWeek = Array.from({ length: 7 }, (_, i) => 
    format(addDays(weekStart, i), 'EEE')
  );

  if (view === "month") {
    return (
      <div className={cn("space-y-4 animate-fade-in", className)}>
        {/* Header skeleton - matches actual calendar header */}
        

        {/* Calendar grid skeleton - matches actual structure */}
        <div className="space-y-0 border border-border rounded-lg overflow-hidden">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {daysOfWeek.map((day, i) => (
              <div key={i} className="p-2 text-center border-r border-border last:border-r-0">
                <Skeleton className="h-4 w-8 mx-auto" variant="shimmer" />
              </div>
            ))}
          </div>

          {/* Calendar cells with realistic event distribution */}
          {Array.from({ length: 6 }).map((_, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {Array.from({ length: 7 }).map((_, dayIndex) => {
                const cellIndex = weekIndex * 7 + dayIndex;
                const hasEvents = cellIndex % 3 === 0 || cellIndex % 5 === 0;
                const eventCount = hasEvents ? Math.floor(Math.random() * 3) + 1 : 0;
                
                return (
                  <div 
                    key={dayIndex} 
                    className="h-24 p-2 border-r border-border last:border-r-0 space-y-1"
                    style={{ animationDelay: `${(weekIndex * 7 + dayIndex) * 0.02}s` }}
                  >
                    <Skeleton className="h-4 w-6" variant="shimmer" />
                    {/* Realistic event skeletons */}
                    {Array.from({ length: eventCount }).map((_, eventIndex) => (
                      <Skeleton 
                        key={eventIndex} 
                        className={`h-4 ${eventIndex === 0 ? 'w-full' : eventIndex === 1 ? 'w-3/4' : 'w-1/2'}`} 
                        variant="wave"
                        style={{ animationDelay: `${(weekIndex * 7 + dayIndex) * 0.02 + eventIndex * 0.1}s` }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "week") {
    return (
      <div className={cn("space-y-4 animate-fade-in", className)}>
        {/* Header skeleton - matches week view header */}

        {/* Week view skeleton - matches actual week grid */}
        <div className="flex flex-col border border-border rounded-lg overflow-hidden">
          {/* Days header with time zone indicator */}
          <div className="grid grid-cols-8 border-b border-border bg-muted/30">
            <div className="p-3 border-r border-border">
              <Skeleton className="h-4 w-12" variant="shimmer" />
            </div>
            {daysOfWeek.map((day, i) => (
              <div key={i} className="p-3 text-center border-r border-border last:border-r-0">
                <Skeleton className="h-4 w-8 mx-auto mb-1" variant="shimmer" />
                <Skeleton className="h-6 w-6 mx-auto rounded-full" variant="shimmer" />
              </div>
            ))}
          </div>

          {/* Time slots - 24 hour format */}
          <div className="flex-1 overflow-hidden">
            {Array.from({ length: 24 }).map((_, hourIndex) => (
              <div key={hourIndex} className="grid grid-cols-8 border-b border-border last:border-b-0 min-h-[60px]">
                <div className="p-2 border-r border-border bg-muted/10">
                  <Skeleton className="h-4 w-12" variant="shimmer" />
                </div>
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const hasEvent = (hourIndex >= 9 && hourIndex <= 17) && Math.random() > 0.85;
                  return (
                    <div key={dayIndex} className="p-1 border-r border-border last:border-r-0 relative">
                      {hasEvent && (
                        <Skeleton 
                          className="h-12 w-full rounded" 
                          variant="wave"
                          style={{ animationDelay: `${hourIndex * 0.05 + dayIndex * 0.02}s` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === "day") {
    return (
      <div className={cn("space-y-4 animate-fade-in", className)}>
        {/* Header skeleton - matches day view header */}

        {/* Day view skeleton - matches single day layout */}
        <div className="flex border border-border rounded-lg overflow-hidden">
          {/* Time column */}
          <div className="w-20 border-r border-border bg-muted/10">
            {Array.from({ length: 24 }).map((_, hourIndex) => (
              <div key={hourIndex} className="h-16 p-2 border-b border-border last:border-b-0">
                <Skeleton className="h-4 w-12" variant="shimmer" />
              </div>
            ))}
          </div>

          {/* Day content */}
          <div className="flex-1">
            {/* Current time indicator placeholder */}
            <div className="relative">
              {Array.from({ length: 24 }).map((_, hourIndex) => {
                const hasEvent = (hourIndex >= 9 && hourIndex <= 17) && Math.random() > 0.8;
                const eventLength = hasEvent ? Math.floor(Math.random() * 3) + 1 : 0;
                
                return (
                  <div key={hourIndex} className="h-16 p-2 border-b border-border last:border-b-0 relative">
                    {hasEvent && (
                      <Skeleton 
                        className={`w-4/5 rounded absolute left-2 top-2`}
                        style={{ height: `${eventLength * 60}px` }}
                        variant="wave"
                      />
                    )}
                  </div>
                );
              })}
              
              {/* Current time indicator skeleton */}
              <div className="absolute left-0 top-32 w-full flex items-center z-10">
                <Skeleton className="h-0.5 w-full bg-red-400" variant="shimmer" />
                <Skeleton className="h-3 w-3 rounded-full bg-red-400 -ml-1.5" variant="shimmer" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "agenda") {
    return (
      <div className={cn("space-y-4 animate-fade-in", className)}>
        {/* Header skeleton - matches agenda view header */}

        {/* Agenda items skeleton - matches actual agenda layout */}
        <div className="space-y-6 px-4">
          {Array.from({ length: 8 }).map((_, dayIndex) => {
            const eventCount = Math.floor(Math.random() * 4) + 1;
            return (
              <div 
                key={dayIndex} 
                className="space-y-3 animate-slide-in"
                style={{ animationDelay: `${dayIndex * 0.1}s` }}
              >
                {/* Date header */}
                <div className="flex items-center gap-3 pb-2 border-b border-border">
                  <Skeleton className="h-5 w-24" variant="shimmer" />
                  <Skeleton className="h-1 flex-1" variant="shimmer" />
                </div>
                
                {/* Events for the day */}
                <div className="space-y-3 pl-6">
                  {Array.from({ length: eventCount }).map((_, eventIndex) => (
                    <div 
                      key={eventIndex} 
                      className="flex items-start gap-4 p-3 rounded-lg border border-border animate-scale-in"
                      style={{ animationDelay: `${dayIndex * 0.1 + eventIndex * 0.05}s` }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Skeleton className="h-4 w-12" variant="wave" />
                        <Skeleton className="h-2 w-8" variant="wave" />
                      </div>
                      <Skeleton className="h-3 w-3 rounded-full mt-0.5" variant="shimmer" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-full" variant="wave" />
                        <Skeleton className="h-3 w-3/4" variant="wave" />
                        {eventIndex % 3 === 0 && (
                          <Skeleton className="h-3 w-1/2" variant="wave" />
                        )}
                      </div>
                      <Skeleton className="h-6 w-16 rounded" variant="shimmer" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
      <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" variant="shimmer" />
          <Skeleton className="h-4 w-12" variant="shimmer" />
        </div>
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Description field */}
      <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        <Skeleton className="h-4 w-20" variant="shimmer" />
        <Skeleton className="h-20 w-full rounded" variant="wave" />
      </div>

      {/* Calendar selection */}
      <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.3s' }}>
        <Skeleton className="h-4 w-16" variant="shimmer" />
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Date and time fields */}
      <div className="grid grid-cols-2 gap-4 animate-slide-in" style={{ animationDelay: '0.4s' }}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" variant="shimmer" />
          <Skeleton className="h-10 w-full rounded" variant="wave" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 animate-slide-in" style={{ animationDelay: '0.5s' }}>
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
      <div className="flex items-center space-x-2 animate-slide-in" style={{ animationDelay: '0.6s' }}>
        <Skeleton className="h-4 w-4 rounded" variant="shimmer" />
        <Skeleton className="h-4 w-24" variant="shimmer" />
      </div>

      {/* Location field */}
      <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.7s' }}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" variant="shimmer" />
          <Skeleton className="h-4 w-16" variant="shimmer" />
        </div>
        <Skeleton className="h-10 w-full rounded" variant="wave" />
      </div>

      {/* Action buttons */}
      <div className="flex justify-between pt-4 border-t border-border animate-scale-in" style={{ animationDelay: '0.8s' }}>
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
      <div className="space-y-1 animate-slide-in" style={{ animationDelay: '0.1s' }}>
        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full text-center" variant="shimmer" />
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
                  className={`h-6 w-6 ${isToday ? 'rounded-full' : 'rounded'}`}
                  variant={isToday ? "shimmer" : "wave"}
                  style={{ animationDelay: `${(weekIndex * 7 + dayIndex) * 0.02}s` }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* My Calendars section */}
      <div className="space-y-3 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        <Skeleton className="h-4 w-24" variant="shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 transition-colors">
            <Skeleton className="h-3 w-3 rounded-full" variant="shimmer" />
            <Skeleton className="h-4 flex-1" variant="wave" />
            <Skeleton className="h-4 w-4 rounded" variant="shimmer" />
          </div>
        ))}
      </div>

      {/* Categories section */}
      <div className="space-y-3 animate-slide-in" style={{ animationDelay: '0.3s' }}>
        <Skeleton className="h-4 w-20" variant="shimmer" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 transition-colors">
            <Skeleton className="h-3 w-3 rounded-full" variant="shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
            <Skeleton className="h-4 flex-1" variant="wave" style={{ animationDelay: `${i * 0.1}s` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
