"use client";

import React from "react";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Loader2, Search } from "lucide-react";
import {
  EncryptionStatusBadge,
  type CalendarEvent,
} from "@workspace/ui/components/calendar";

interface EventSearchResultsProps {
  events: CalendarEvent[];
  isLoading: boolean;
  onSelect: (event: CalendarEvent) => void;
  selectedIndex: number;
  baseIndex: number;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
};

function getColorClass(color?: string | null) {
  if (!color) return "bg-primary";
  if (COLOR_MAP[color]) return COLOR_MAP[color];
  return "bg-primary";
}

export function EventSearchResults({
  events,
  isLoading,
  onSelect,
  selectedIndex,
  baseIndex,
}: EventSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="px-2">
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
          <Search className="size-3 text-primary/60" />
          <span className="text-xs font-medium text-primary/70 uppercase tracking-wide">
            Events
          </span>
          <Loader2 className="size-3 animate-spin text-muted-foreground ml-1" />
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="px-2">
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
        <Search className="size-3 text-primary/60" />
        <span className="text-xs font-medium text-primary/70 uppercase tracking-wide">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>
      {events.map((event, index) => {
        const globalIndex = baseIndex + index;
        const isSelected = globalIndex === selectedIndex;
        const eventColor = event.color;
        const dateStr = format(event.start, "MMM d, yyyy");
        const timeStr = event.allDay
          ? "All day"
          : `${format(event.start, "HH:mm")} - ${format(event.end, "HH:mm")}`;

        return (
          <button
            key={event.id}
            data-index={globalIndex}
            type="button"
            onClick={() => onSelect(event)}
            className={`flex items-center gap-3 p-2 w-full rounded-md text-left focus:outline-none transition-colors group ${
              isSelected ? "bg-accent/50" : "hover:bg-accent/50"
            }`}
          >
            <div
              className={`size-2 rounded-full shrink-0 ${getColorClass(eventColor)}`}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm truncate block">{event.title}</span>
              <span className="text-xs text-muted-foreground">
                {dateStr} &middot; {timeStr}
              </span>
            </div>
            <EncryptionStatusBadge item={event} asIcon className="opacity-80" />
            {event.location && (
              <MapPin className="size-3 text-muted-foreground/50 shrink-0" />
            )}
            <CalendarIcon className="size-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      })}
    </div>
  );
}
