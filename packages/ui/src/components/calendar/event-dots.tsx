"use client";

import React, { useState, useEffect } from "react";
import { CalendarEvent } from "./types";
import { EventItem } from "./event-item";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  // Add keyboard shortcuts when dropdown is open
  useEffect(() => {
    if (!isExpanded) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if Ctrl/Cmd is pressed and it's a number key
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        e.stopPropagation();
        
        const index = parseInt(e.key) - 1;
        const selectedEvent = events[index];
        if (selectedEvent) {
          setIsExpanded(false);
          onClick?.(selectedEvent);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, events, onClick]);

  return (
    <div className={cn("relative", className)} style={style}>
      <DropdownMenu open={isExpanded} onOpenChange={setIsExpanded}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full h-full relative overflow-hidden rounded border",
              "bg-gradient-to-r from-blue-500/20 to-purple-500/20",
              "hover:from-blue-500/30 hover:to-purple-500/30",
              "border-blue-500/40 hover:border-blue-500/60",
              "transition-all duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
              "min-h-[20px]"
            )}
            onClick={(e) => {
              e.stopPropagation();
            }}
            title={`${events.length} events at the same time`}
          >
            <div className={cn(
              "flex items-center justify-between font-medium h-full",
              "px-1 text-[10px] leading-tight",
              style?.height && parseInt(style.height as string) < 30 
                ? "px-0.5 text-[9px]" 
                : "px-1 text-[10px]"
            )}>
              {/* Show title for normal height events, count for very short ones */}
              {style?.height && parseInt(style.height as string) < 20 ? (
                <span className="truncate flex-1 text-left min-w-0 font-bold">
                  {events.length} events
                </span>
              ) : (
                <span className="truncate flex-1 text-left min-w-0">
                  {primaryEvent.title}
                </span>
              )}
              
              <div className={cn(
                "flex items-center gap-1 ml-1 flex-shrink-0",
                style?.height && parseInt(style.height as string) < 25 && "hidden sm:flex"
              )}>
                <span className="text-[8px] opacity-70">
                  +{remainingCount}
                </span>
                <ChevronDown className={cn(
                  "opacity-60",
                  style?.height && parseInt(style.height as string) < 30
                    ? "w-2 h-2"
                    : "w-3 h-3"
                )} />
              </div>
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
                  <div className="font-medium text-sm truncate">
                    {event.title}
                  </div>
                  {event.location && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {event.location}
                    </div>
                  )}
                </div>
                {showShortcut && (
                  <DropdownMenuShortcut className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground">
                    <span className="text-xs">⌘</span>
                    <span className="text-[10px]">+</span>
                    <span>{shortcutNumber}</span>
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