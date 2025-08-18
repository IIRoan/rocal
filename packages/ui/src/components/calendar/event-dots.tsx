"use client";

import React, { useState } from "react";
import { CalendarEvent } from "./types";
import { EventItem } from "./event-item";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface EventDotsProps {
  events: CalendarEvent[];
  view: "month" | "week" | "day" | "agenda";
  onClick?: (event: CalendarEvent) => void;
  showTime?: boolean;
  timeFormat?: "12h" | "24h";
  className?: string;
  style?: React.CSSProperties;
}

export function EventDots({
  events,
  view,
  onClick,
  showTime,
  timeFormat = "12h",
  className,
  style,
}: EventDotsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (events.length === 0) return null;

  // If only one event, render it normally
  if (events.length === 1 && events[0]) {
    const singleEvent = events[0];
    return (
      <div className={className} style={style}>
        <EventItem
          event={singleEvent}
          view={view}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(singleEvent);
          }}
          showTime={showTime}
          timeFormat={timeFormat}
        />
      </div>
    );
  }

  // For multiple events with same time, show dots
  const primaryEvent = events[0];
  
  // Safety check - if no primary event, return null
  if (!primaryEvent) {
    return null;
  }
  const remainingCount = events.length - 1;

  return (
    <div className={cn("relative", className)} style={style}>
      {!isExpanded ? (
        // Collapsed state: Show primary event with dot indicators
        <button
          className={cn(
            "w-full h-full relative overflow-hidden rounded border",
            "bg-gradient-to-r from-blue-500/20 to-purple-500/20",
            "hover:from-blue-500/30 hover:to-purple-500/30",
            "border-blue-500/40 hover:border-blue-500/60",
            "transition-all duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
            // Better handling for very short events
            "min-h-[20px]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          title={`${events.length} events at the same time`}
        >
          {/* Primary event content - adjust layout based on height */}
          <div className={cn(
            "flex items-center justify-between font-medium",
            // Dynamic sizing based on container height
            "h-full px-1 text-[10px] leading-tight",
            // For very short events, use minimal padding and smaller text
            style?.height && parseInt(style.height as string) < 30 
              ? "px-0.5 text-[9px]" 
              : "px-1 text-[10px]"
          )}>
            {/* Show title for normal height events, count for very short ones */}
            {style?.height && parseInt(style.height as string) < 20 ? (
              // Very short events: just show count
              <span className="truncate flex-1 text-left min-w-0 font-bold">
                {events.length} events
              </span>
            ) : (
              // Normal events: show title
              <span className="truncate flex-1 text-left min-w-0">
                {primaryEvent.title}
              </span>
            )}
            
            <div className={cn(
              "flex items-center gap-1 ml-1 flex-shrink-0",
              // Hide detailed indicators for very short events
              style?.height && parseInt(style.height as string) < 25 && "hidden sm:flex"
            )}>
              {/* Dot indicators */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: Math.min(remainingCount, 3) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-full bg-current opacity-70",
                      // Smaller dots for very short events
                      style?.height && parseInt(style.height as string) < 30
                        ? "w-1 h-1"
                        : "w-1.5 h-1.5"
                    )}
                  />
                ))}
                {remainingCount > 3 && (
                  <span className="text-[8px] opacity-70 ml-0.5">
                    +{remainingCount - 3}
                  </span>
                )}
              </div>
              <ChevronRight className={cn(
                "opacity-60",
                style?.height && parseInt(style.height as string) < 30
                  ? "w-2 h-2"
                  : "w-3 h-3"
              )} />
            </div>
          </div>
        </button>
      ) : (
        // Expanded state: Show all events in a stacked layout
        <div
          className={cn(
            "absolute top-0 left-0 z-50 bg-white dark:bg-gray-800",
            "border border-gray-200 dark:border-gray-700 rounded shadow-lg",
            "min-w-full overflow-hidden",
            // For very short original events, position the dropdown better
            style?.height && parseInt(style.height as string) < 30 
              ? "min-w-[200px]" // Ensure readable width for short events
              : "min-w-full"
          )}
          style={{
            minHeight: `${Math.max(events.length * 24 + 32, 80)}px`, // Minimum readable height
            // For very short events, position dropdown below or above as needed
            top: style?.height && parseInt(style.height as string) < 30 
              ? `${parseInt(style.height as string) + 4}px`
              : "0px"
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {events.length} events
            </span>
            <button
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Events list */}
          <div className="max-h-40 overflow-y-auto">
            {events.map((event, index) => (
              <div
                key={event.id || index}
                className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <button
                  className={cn(
                    "w-full p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-750",
                    "transition-colors duration-150"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                    onClick?.(event);
                  }}
                >
                  <div className="text-xs font-medium truncate">
                    {event.title}
                  </div>
                  {event.location && (
                    <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate mt-0.5">
                      {event.location}
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Utility function to group events by exact time matching
export function groupEventsByExactTime(events: CalendarEvent[]): CalendarEvent[][] {
  const groups: Map<string, CalendarEvent[]> = new Map();
  
  events.forEach((event) => {
    const startTime = new Date(event.start).getTime();
    const endTime = new Date(event.end).getTime();
    const timeKey = `${startTime}-${endTime}`;
    
    if (!groups.has(timeKey)) {
      groups.set(timeKey, []);
    }
    groups.get(timeKey)!.push(event);
  });
  
  // Return groups, with single events as individual arrays
  return Array.from(groups.values());
}

// Utility function to check if events have identical times
export function haveSameExactTime(event1: CalendarEvent, event2: CalendarEvent): boolean {
  return (
    new Date(event1.start).getTime() === new Date(event2.start).getTime() &&
    new Date(event1.end).getTime() === new Date(event2.end).getTime()
  );
}