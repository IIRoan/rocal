import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { resolveTimezone, wallClockFromCalendarDayKey } from "@workspace/calendar-core";

import { DefaultStartHour } from "./constants";
import type { EventCalendarContextTarget } from "./event-calendar-context-menu";
import type { CalendarEvent } from "./types";
import { addMinutesToDate } from "./utils";

export function useEventCalendarContextMenu({
  defaultCalendarId,
  defaultEventDuration,
  events,
  onSetPreview,
  timezone,
}: {
  defaultCalendarId?: string | null;
  defaultEventDuration: number;
  events: CalendarEvent[];
  onSetPreview?: (event: CalendarEvent | null) => void;
  timezone?: string;
}) {
  const [target, setTarget] = useState<EventCalendarContextTarget>({
    type: "general",
  });
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const contextMenuRafRef = useRef<number | null>(null);
  const lastClickPositionRef = useRef<{ x: number; y: number } | null>(null);
  const resolvedTimezone = resolveTimezone(timezone);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      lastClickPositionRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  useEffect(() => {
    const rafRef = contextMenuRafRef;
    return () => {
      const frame = rafRef.current;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  const reopenAt = (
    nextTarget: EventCalendarContextTarget,
    x: number,
    y: number,
  ) => {
    setTarget(nextTarget);
    setPosition({ x, y });
    setOpen(false);

    if (contextMenuRafRef.current !== null) {
      cancelAnimationFrame(contextMenuRafRef.current);
    }

    contextMenuRafRef.current = requestAnimationFrame(() => {
      setOpen(true);
      contextMenuRafRef.current = null;
    });
  };

  const handleContextMenuCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    lastClickPositionRef.current = { x: event.clientX, y: event.clientY };

    const eventElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-event-id]",
    );

    if (eventElement?.dataset.eventId) {
      const calendarEvent = events.find(
        (item) => item.id === eventElement.dataset.eventId,
      );
      if (calendarEvent) {
        onSetPreview?.(null);
        reopenAt({ type: "event", event: calendarEvent }, event.clientX, event.clientY);
        return;
      }
    }

    const cellElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-calendar-cell='true']",
    );
    if (cellElement?.dataset.cellDate) {
      const timeValue = Number(cellElement.dataset.cellTime);
      const hours = Number.isNaN(timeValue)
        ? DefaultStartHour
        : Math.floor(timeValue);
      const minutes = Number.isNaN(timeValue)
        ? 0
        : Math.round((timeValue - hours) * 60);
      const startTime = wallClockFromCalendarDayKey(
        cellElement.dataset.cellDate,
        hours,
        minutes,
        resolvedTimezone,
      );

      if (!startTime) {
        return;
      }

      onSetPreview?.({
        id: "__context_preview__" as CalendarEvent["id"],
        title: "",
        start: new Date(startTime),
        end: addMinutesToDate(startTime, defaultEventDuration),
        allDay: false,
        calendarId: defaultCalendarId || "",
        userId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        timezone: resolvedTimezone,
        isPreview: true,
      });

      reopenAt({ type: "timeline", startTime }, event.clientX, event.clientY);
      return;
    }

    onSetPreview?.(null);
    reopenAt({ type: "general" }, event.clientX, event.clientY);
  };

  return {
    handleContextMenuCapture,
    lastClickPositionRef,
    menuOpen: open,
    menuPosition: position,
    menuTarget: target,
    setMenuOpen: setOpen,
  };
}
