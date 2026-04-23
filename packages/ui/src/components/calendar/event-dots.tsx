"use client";

import React, { useState, useEffect } from "react";
import { CalendarEvent, type CalendarView } from "./types";
import { EncryptionStatusBadge } from "./encryption-status";
import { EventItem } from "./event-item";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getEventColorClasses, getEventColorStyles } from "./utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useNumberedShortcuts } from "../../hooks";

interface EventDotsProps {
  events: CalendarEvent[];
  view: CalendarView;
  onClick?: (event: CalendarEvent) => void;
  showTime?: boolean;
  timeFormat?: "12h" | "24h";
  className?: string;
  style?: React.CSSProperties;
  timezone?: string;
}

export function EventDots({
  events,
  view,
  onClick,
  showTime,
  timeFormat = "12h",
  className,
  style,
  timezone,
}: EventDotsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Add keyboard shortcuts for numbered event selection - must be called before any early returns
  useNumberedShortcuts(
    events.map((event) => () => {
      setIsExpanded(false);
      onClick?.(event);
    }),
    isExpanded,
  );

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
          timezone={timezone}
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
      <DropdownMenu open={isExpanded} onOpenChange={setIsExpanded}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group/evdots focus-visible:border-ring focus-visible:ring-ring/50 relative flex h-full w-full overflow-hidden text-left font-medium transition-all duration-200 ease-out outline-none select-none focus-visible:ring-[3px] hover:-translate-y-px hover:brightness-[1.07] hover:shadow-md hover:z-10 active:translate-y-0 active:brightness-95 active:shadow-sm rounded shadow-sm",
              "min-h-[20px] sm:min-h-[24px]",
            )}
            onClick={(e) => {
              e.stopPropagation();
            }}
            title={`${events.length} events at the same time`}
          >
            <div className="flex h-full w-full min-w-0 items-stretch">
              {/* Show first 2 events as separate styled event items */}
              {events.slice(0, 2).map((event, index) => (
                <div
                  key={event.id || index}
                  className={cn(
                    "flex-1 min-w-0 flex items-center px-1.5 border-r border-background/10 last:border-r-0",
                    "text-[10px] sm:text-[13px]",
                    "leading-tight",
                    index === 0 && "rounded-l",
                    index === 1 && "rounded-r",
                    getEventColorClasses(event.color),
                  )}
                  style={getEventColorStyles(event.color)}
                >
                  <span className="flex items-center gap-1 min-w-0 truncate">
                    <EncryptionStatusBadge item={event} asIcon />
                    <span className="truncate">{event.title}</span>
                  </span>
                </div>
              ))}

              {/* Show count if more than 2 events */}
              {events.length > 2 && (
                <div
                  className={cn(
                    "flex items-center justify-center min-w-[30px] rounded-r",
                    "text-[8px] sm:text-[10px] font-bold",
                    "px-1.5",
                    "bg-muted/20 hover:bg-muted/30",
                    "text-foreground",
                    style?.height && parseInt(style.height as string) < 30
                      ? "py-0.5"
                      : "py-1",
                  )}
                >
                  +{events.length - 2}
                </div>
              )}
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-72"
          align="start"
          side="bottom"
          onCloseAutoFocus={(e) => {
            // Prevent the dropdown from stealing focus when closing
            e.preventDefault();
          }}
        >
          {events.map((event, index) => {
            // Only show shortcuts for first 9 events
            const showShortcut = index < 9;
            const shortcutNumber = index + 1;

            return (
              <DropdownMenuItem
                key={event.id || index}
                className="cursor-pointer focus:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.(event);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                    <EncryptionStatusBadge item={event} asIcon />
                    <span className="truncate">{event.title}</span>
                  </div>
                  {event.location && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {event.location}
                    </div>
                  )}
                </div>
                {showShortcut && (
                  <DropdownMenuShortcut>
                    ⌘+{shortcutNumber}
                  </DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Utility function to group events by exact time matching
export function groupEventsByExactTime(
  events: CalendarEvent[],
): CalendarEvent[][] {
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
export function haveSameExactTime(
  event1: CalendarEvent,
  event2: CalendarEvent,
): boolean {
  return (
    new Date(event1.start).getTime() === new Date(event2.start).getTime() &&
    new Date(event1.end).getTime() === new Date(event2.end).getTime()
  );
}
