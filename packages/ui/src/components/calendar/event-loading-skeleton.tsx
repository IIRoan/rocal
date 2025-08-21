"use client";

import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { InlineLogoSpinner } from "../ui/logo-spinner";

interface EventLoadingSkeletonProps {
  view?: "month" | "week" | "day" | "agenda";
  className?: string;
  showSpinner?: boolean;
  compactView?: boolean;
}

export function EventLoadingSkeleton({
  view = "month",
  className,
  showSpinner = true,
  compactView = false
}: EventLoadingSkeletonProps) {

  if (view === "month") {
    return (
      <div className={cn("relative", className)}>
        {/* Overlay with subtle background */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
          {showSpinner && (
            <div className="bg-background/90 border border-border rounded-lg p-4 shadow-lg animate-fade-in">
              <InlineLogoSpinner 
                messageContext="CALENDAR_LOAD"
                enableCycling={true}
              />
            </div>
          )}
        </div>

        {/* Month grid with event placeholders */}
        <div className="grid grid-cols-7 gap-1 animate-pulse">
          {Array.from({ length: 42 }).map((_, i) => {
            // Simulate realistic event distribution
            const hasEvents = Math.random() > 0.7;
            const eventCount = hasEvents ? Math.floor(Math.random() * 3) + 1 : 0;
            
            return (
              <div key={i} className="h-24 p-1 border border-border/30 space-y-1">
                {/* Day number placeholder */}
                <Skeleton className="h-3 w-6" variant="shimmer" />
                
                {/* Event placeholders */}
                {Array.from({ length: eventCount }).map((_, eventIndex) => (
                  <Skeleton 
                    key={eventIndex}
                    className={`h-3 ${eventIndex === 0 ? 'w-full' : eventIndex === 1 ? 'w-3/4' : 'w-1/2'}`}
                    variant="wave"
                    style={{ animationDelay: `${i * 0.01 + eventIndex * 0.1}s` }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "week") {
    return (
      <div className={cn("relative", className)}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
          {showSpinner && (
            <div className="bg-background/90 border border-border rounded-lg p-4 shadow-lg animate-fade-in">
              <InlineLogoSpinner 
                messageContext="CALENDAR_LOAD"
                enableCycling={true}
              />
            </div>
          )}
        </div>

        {/* Week view with time slots */}
        <div className="flex flex-col animate-pulse">
          {/* Time slots */}
          {Array.from({ length: 24 }).map((_, hourIndex) => (
            <div key={hourIndex} className={`grid grid-cols-8 border-b border-border/30 ${compactView ? 'min-h-[51px]' : 'min-h-[60px]'}`}>
              {/* Time column */}
              <div className="p-2 border-r border-border/30">
                <Skeleton className="h-3 w-10" variant="shimmer" />
              </div>
              
              {/* Day columns */}
              {Array.from({ length: 7 }).map((_, dayIndex) => {
                const hasEvent = (hourIndex >= 9 && hourIndex <= 17) && Math.random() > 0.85;
                return (
                  <div key={dayIndex} className="p-1 border-r border-border/30 relative">
                    {hasEvent && (
                      <Skeleton 
                        className={`${compactView ? 'h-9' : 'h-12'} w-full rounded`} 
                        variant="wave"
                        style={{ animationDelay: `${hourIndex * 0.02 + dayIndex * 0.01}s` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "day") {
    return (
      <div className={cn("relative", className)}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
          {showSpinner && (
            <div className="bg-background/90 border border-border rounded-lg p-4 shadow-lg animate-fade-in">
              <InlineLogoSpinner 
                messageContext="CALENDAR_LOAD"
                enableCycling={true}
              />
            </div>
          )}
        </div>

        {/* Day view */}
        <div className="flex animate-pulse">
          {/* Time column */}
          <div className="w-20 border-r border-border/30">
            {Array.from({ length: 24 }).map((_, hourIndex) => (
              <div key={hourIndex} className={`${compactView ? 'h-9' : 'h-11'} p-2 border-b border-border/30`}>
                <Skeleton className="h-3 w-12" variant="shimmer" />
              </div>
            ))}
          </div>

          {/* Events column */}
          <div className="flex-1 relative">
            {Array.from({ length: 24 }).map((_, hourIndex) => {
              const hasEvent = (hourIndex >= 9 && hourIndex <= 17) && Math.random() > 0.8;
              return (
                <div key={hourIndex} className={`${compactView ? 'h-9' : 'h-11'} p-2 border-b border-border/30 relative`}>
                  {hasEvent && (
                    <Skeleton 
                      className={`w-4/5 ${compactView ? 'h-9' : 'h-12'} rounded absolute left-2 top-2`}
                      variant="wave"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (view === "agenda") {
    return (
      <div className={cn("relative space-y-4", className)}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
          {showSpinner && (
            <div className="bg-background/90 border border-border rounded-lg p-4 shadow-lg animate-fade-in">
              <InlineLogoSpinner 
                messageContext="CALENDAR_LOAD"
                enableCycling={true}
              />
            </div>
          )}
        </div>

        {/* Agenda items */}
        {Array.from({ length: 5 }).map((_, dayIndex) => {
          const eventCount = Math.floor(Math.random() * 4) + 1;
          return (
            <div key={dayIndex} className="space-y-3 animate-pulse">
              {/* Date header */}
              <div className="flex items-center gap-3 pb-2 border-b border-border/30">
                <Skeleton className="h-4 w-24" variant="shimmer" />
                <Skeleton className="h-1 flex-1" variant="shimmer" />
              </div>
              
              {/* Events */}
              <div className="space-y-2 pl-6">
                {Array.from({ length: eventCount }).map((_, eventIndex) => (
                  <div key={eventIndex} className="flex items-center gap-4 p-3 rounded border border-border/30">
                    <Skeleton className="h-3 w-12" variant="wave" />
                    <Skeleton className="h-3 w-3 rounded-full" variant="shimmer" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-full" variant="wave" />
                      <Skeleton className="h-3 w-3/4" variant="wave" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

// Lightweight event skeleton for quick transitions
export function QuickEventSkeleton({ 
  count = 3,
  className 
}: { 
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton 
          key={i}
          className={`h-3 ${i === 0 ? 'w-full' : i === 1 ? 'w-4/5' : 'w-3/5'}`}
          variant="wave"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}