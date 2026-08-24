"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatCalendarDayKey,
  formatEventSpanLabel,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";

import { cn } from "../../lib/utils";
import { layoutAllDayRowEvents } from "./all-day-layout";
import { EncryptionStatusBadge } from "./encryption-status";
import { EventItem } from "./event-item";
import { isMultiDayEvent } from "./utils";
import type { CalendarEvent } from "./types";
import type { WeekEventHandlers } from "./week-view-types";

export function AllDayEventRow({
  columnTemplate,
  days,
  events,
  handlers,
  timezone,
}: {
  columnTemplate: string;
  days: Date[];
  events: CalendarEvent[];
  handlers: WeekEventHandlers;
  timezone: string;
}) {
  const { placements, laneCount } = useMemo(
    () => layoutAllDayRowEvents(events, days, timezone),
    [days, events, timezone],
  );
  const rows = Math.max(laneCount, 1);

  return (
    <div
      className="relative z-30 grid w-full shrink-0 items-stretch border-b border-border/40"
      style={{
        gridTemplateColumns: columnTemplate,
        gridTemplateRows: `repeat(${rows}, minmax(1.375rem, auto))`,
      }}
    >
      <div
        className="flex h-full flex-col bg-background"
        style={{ gridColumn: 1, gridRow: `1 / span ${rows}` }}
      >
        <div className="flex min-h-[24px] flex-1 flex-col items-center justify-center">
          <span className="text-[9px] leading-none text-muted-foreground/40">
            all-day
          </span>
        </div>
      </div>

      {days.map((day, index) => (
        <div
          key={formatCalendarDayKey(day)}
          className="pointer-events-none bg-background shadow-sm"
          style={{
            gridColumn: index + 2,
            gridRow: `1 / span ${rows}`,
          }}
        />
      ))}

      {placements.map((placement) => {
        const { event } = placement;
        const showDateRange = isMultiDayEvent(event, timezone);
        const spanLabel = showDateRange
          ? formatEventSpanLabel(event, timezone)
          : null;

        return (
          <div
            key={event.id}
            className="relative z-10 px-px py-px"
            style={{
              gridColumn: `${placement.startIndex + 2} / span ${placement.span}`,
              gridRow: placement.lane + 1,
            }}
          >
            <EventItem
              onClick={(mouseEvent) => handlers.onEventClick(event, mouseEvent)}
              event={event}
              view="month"
              isFirstDay={!placement.continuesBefore}
              isLastDay={!placement.continuesAfter}
              connectAcrossCells={false}
              className="mt-0 h-[22px] min-h-[20px] sm:min-h-[20px] items-center text-[10px]"
              timezone={timezone}
              onEdit={handlers.onEventEdit}
              onDelete={handlers.onEventDelete}
              onView={handlers.onEventView}
            >
              <div className="flex w-full min-w-0 items-center gap-0.5">
                {placement.continuesBefore ? (
                  <ChevronLeft
                    aria-hidden
                    className="size-2.5 shrink-0 opacity-70"
                    strokeWidth={2.25}
                  />
                ) : null}
                <EncryptionStatusBadge item={event} asIcon />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-semibold leading-tight tracking-tight",
                    isCancelledCalendarEvent(event) && "line-through opacity-70",
                  )}
                >
                  {event.title}
                </span>
                {spanLabel ? (
                  <span
                    className={cn(
                      "text-[10px] font-normal tabular-nums leading-none opacity-80",
                      placement.span > 1 ? "shrink-0" : "min-w-0 truncate",
                    )}
                  >
                    {spanLabel}
                  </span>
                ) : null}
                {placement.continuesAfter ? (
                  <ChevronRight
                    aria-hidden
                    className="size-2.5 shrink-0 opacity-70"
                    strokeWidth={2.25}
                  />
                ) : null}
              </div>
            </EventItem>
          </div>
        );
      })}
    </div>
  );
}
