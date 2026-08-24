"use client";

import { format } from "date-fns";
import {
  formatInUserTimezone,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";

import { cn } from "../../lib/utils";
import { Drawer, DrawerContent, DrawerShell, DrawerTitle } from "../ui/drawer";
import { resolveInlineColorValue } from "./utils";
import type { CalendarEvent } from "./types";

export function ThreeDayOverlapDrawer({
  events,
  open,
  onOpenChange,
  onEventSelect,
  timezone,
}: {
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventSelect: (event: CalendarEvent) => void;
  timezone: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        responsive
        responsiveHeight="70dvh"
        className="overflow-hidden"
      >
        <DrawerTitle className="sr-only">Select Event</DrawerTitle>
        <DrawerShell
          header={
            <div className="border-b border-border/40 px-5 py-3">
              <span className="text-base font-semibold">Select Event</span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {events[0] &&
                  formatInUserTimezone(
                    new Date(events[0].start),
                    timezone,
                    "EEEE, MMMM d",
                  )}
              </p>
            </div>
          }
        >
          <div className="overflow-y-auto p-2 pb-6">
            {events.map((event) => {
              const eventStart = new Date(event.start);
              const eventEnd = new Date(event.end);
              return (
                <button
                  key={event.id}
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/30"
                  onClick={() => {
                    onEventSelect(event);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex size-6 shrink-0 items-center justify-center">
                    <div
                      className="size-3 rounded-full"
                      style={{
                        backgroundColor: resolveInlineColorValue(
                          event.color || "blue",
                        ),
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-sm font-medium",
                        isCancelledCalendarEvent(event) &&
                          "line-through opacity-70",
                      )}
                    >
                      {event.title || "Untitled Event"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.allDay
                        ? "All day"
                        : `${format(eventStart, "h:mm a")} - ${format(eventEnd, "h:mm a")}`}
                      {event.location && ` · ${event.location}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DrawerShell>
      </DrawerContent>
    </Drawer>
  );
}
