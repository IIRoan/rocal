"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  formatCalendarDayKey,
  getZonedDateParts,
  isSameCalendarDayInTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";

import { useCalendarDnd } from "./calendar-dnd-context";
import { StartHour } from "./constants";
import {
  TIME_GRID_QUARTERS,
  normalizeTimeGridRange,
  type TimeGridQuarterRange,
  type TimeGridRangeMode,
} from "./timeline-layout";
import type { CalendarEvent } from "./types";

export type TimeGridSelectionRange = TimeGridQuarterRange & { dayKey: string };

export type TimeGridResizeEdge = "start" | "end";

type Gesture = {
  mode: TimeGridRangeMode;
  day: Date;
  column: HTMLElement;
  anchorQuarter: number;
  currentQuarter: number;
  moved: boolean;
  cancelled: boolean;
  event?: CalendarEvent;
};

type GestureSeed = Pick<Gesture, "mode" | "day" | "anchorQuarter" | "currentQuarter" | "event">;

function quarterAt(column: HTMLElement, clientY: number): number {
  const rect = column.getBoundingClientRect();
  const quarter = Math.floor(((clientY - rect.top) / rect.height) * TIME_GRID_QUARTERS);
  return Math.min(Math.max(quarter, 0), TIME_GRID_QUARTERS - 1);
}

function quarterInstant(day: Date, quarter: number, timezone: string): Date {
  return wallClockToUtc(day, StartHour + Math.floor(quarter / 4), (quarter % 4) * 15, timezone);
}

/** An event edge as a wall-clock quarter of `day`, rounded inward so a resize never leaves less than 15 minutes. */
function edgeQuarter(
  instant: Date,
  day: Date,
  timezone: string,
  round: (value: number) => number,
  outsideDay: number,
): number {
  if (!isSameCalendarDayInTimezone(instant, day, timezone)) return outsideDay;
  const { hours, minutes } = getZonedDateParts(instant, timezone);
  return round(((hours - StartHour) * 60 + minutes) / 15);
}

/** The click that follows a finished drag would otherwise also create an event in the cell under the pointer. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/** Mouse and pen drags on a time grid: sweep empty cells to create, or pull an event's edge to resize; touch keeps scrolling. */
export function useTimeGridPointerRange({
  timezone,
  onCreate,
}: {
  timezone: string;
  onCreate: (start: Date, end: Date, anchor: { x: number; y: number }) => void;
}) {
  const { updateEvent } = useCalendarDnd();
  const gestureRef = useRef<Gesture | null>(null);
  const stopKeysRef = useRef<(() => void) | null>(null);
  const [selection, setSelection] = useState<TimeGridSelectionRange | null>(null);

  useEffect(() => () => stopKeysRef.current?.(), []);

  const finish = () => {
    gestureRef.current = null;
    stopKeysRef.current?.();
    stopKeysRef.current = null;
    setSelection(null);
  };

  const begin = (pointer: ReactPointerEvent<HTMLElement>, seed: GestureSeed) => {
    const column = pointer.currentTarget.closest<HTMLElement>("[data-time-grid-column]");
    if (!column) return;
    column.setPointerCapture(pointer.pointerId);
    gestureRef.current = { ...seed, column, moved: false, cancelled: false };
    const handleKeyDown = (event: KeyboardEvent) => {
      const gesture = gestureRef.current;
      if (event.key !== "Escape" || !gesture) return;
      event.preventDefault();
      gesture.cancelled = true;
      setSelection(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    stopKeysRef.current = () => document.removeEventListener("keydown", handleKeyDown);
  };

  const isDragPointer = (pointer: ReactPointerEvent<HTMLElement>) =>
    pointer.button === 0 && pointer.pointerType !== "touch";

  const startCreate = (pointer: ReactPointerEvent<HTMLElement>, day: Date) => {
    const target = pointer.target;
    if (!isDragPointer(pointer) || !(target instanceof Element)) return;
    if (!target.closest("[data-calendar-cell]")) return;
    const quarter = quarterAt(pointer.currentTarget, pointer.clientY);
    begin(pointer, { mode: "create", day, anchorQuarter: quarter, currentQuarter: quarter });
  };

  const startResize = (
    pointer: ReactPointerEvent<HTMLElement>,
    event: CalendarEvent,
    edge: TimeGridResizeEdge,
    day: Date,
  ) => {
    pointer.stopPropagation();
    if (!isDragPointer(pointer)) return;
    const start = new Date(event.start);
    const end = new Date(event.end);
    begin(
      pointer,
      edge === "start"
        ? {
            mode: "resize-start",
            day,
            event,
            anchorQuarter: edgeQuarter(end, day, timezone, Math.floor, TIME_GRID_QUARTERS),
            currentQuarter: edgeQuarter(start, day, timezone, Math.floor, 0),
          }
        : {
            mode: "resize-end",
            day,
            event,
            anchorQuarter: edgeQuarter(start, day, timezone, Math.ceil, 0),
            currentQuarter:
              edgeQuarter(end, day, timezone, Math.ceil, TIME_GRID_QUARTERS) - 1,
          },
    );
  };

  const handlePointerMove = (pointer: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.cancelled) return;
    const quarter = quarterAt(gesture.column, pointer.clientY);
    if (quarter === gesture.currentQuarter) return;
    gesture.currentQuarter = quarter;
    gesture.moved = true;
    setSelection({
      dayKey: formatCalendarDayKey(gesture.day),
      ...normalizeTimeGridRange(gesture.anchorQuarter, quarter, gesture.mode),
    });
  };

  const commit = (gesture: Gesture, pointer: ReactPointerEvent<HTMLElement>) => {
    const { startQuarter, endQuarter } = normalizeTimeGridRange(
      gesture.anchorQuarter,
      gesture.currentQuarter,
      gesture.mode,
    );
    if (gesture.mode === "create") {
      onCreate(
        quarterInstant(gesture.day, startQuarter, timezone),
        quarterInstant(gesture.day, endQuarter, timezone),
        { x: pointer.clientX, y: pointer.clientY },
      );
      return;
    }
    const event = gesture.event;
    if (!event) return;
    const start =
      gesture.mode === "resize-start"
        ? quarterInstant(gesture.day, startQuarter, timezone)
        : new Date(event.start);
    const end =
      gesture.mode === "resize-end"
        ? quarterInstant(gesture.day, endQuarter, timezone)
        : new Date(event.end);
    const unchanged =
      start.getTime() === new Date(event.start).getTime() &&
      end.getTime() === new Date(event.end).getTime();
    if (!unchanged) updateEvent({ ...event, start, end }, "resized");
  };

  const handlePointerUp = (pointer: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.moved) swallowNextClick();
    if (gesture.moved && !gesture.cancelled) commit(gesture, pointer);
    finish();
  };

  const columnProps = (day: Date) => ({
    "data-time-grid-column": formatCalendarDayKey(day),
    onPointerDown: (pointer: ReactPointerEvent<HTMLElement>) => startCreate(pointer, day),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: finish,
  });

  return { selection, columnProps, startResize };
}
