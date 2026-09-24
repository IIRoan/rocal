"use client";

import {
  createContext,
  use,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { addMinutes, differenceInMinutes } from "date-fns";
import { createLogger } from "@workspace/logger";
import {
  getEventCalendarDayRange,
  getZonedDateParts,
  isSamePickerDay,
  moveAllDayEventToDay,
  resolveTimezone,
  wallClockToUtc,
  type TimeFormat,
} from "@workspace/calendar-core";

import { EventItem } from "./event-item";
import { CalendarEvent, type CalendarView } from "./types";

const log = createLogger("calendar-dnd");

type CalendarDndContextType = {
  activeEvent: CalendarEvent | null;
  activeId: UniqueIdentifier | null;
  activeView: CalendarView | null;
  currentTime: Date | null;
  eventHeight: number | null;
  isMultiDay: boolean;
  multiDayWidth: number | null;
  dragHandlePosition: {
    x?: number;
    y?: number;
    data?: {
      isFirstDay?: boolean;
      isLastDay?: boolean;
    };
  } | null;
};

const CalendarDndContext = createContext<CalendarDndContextType>({
  activeEvent: null,
  activeId: null,
  activeView: null,
  currentTime: null,
  eventHeight: null,
  isMultiDay: false,
  multiDayWidth: null,
  dragHandlePosition: null,
});

export const useCalendarDnd = () => use(CalendarDndContext);

interface CalendarDndProviderProps {
  children: ReactNode;
  onEventUpdate: (event: CalendarEvent) => void;
  timezone?: string;
  timeFormat: TimeFormat;
}

export function CalendarDndProvider({
  children,
  onEventUpdate,
  timezone,
  timeFormat,
}: CalendarDndProviderProps) {
  const resolvedTimezone = resolveTimezone(timezone);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeView, setActiveView] = useState<CalendarView | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [eventHeight, setEventHeight] = useState<number | null>(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [multiDayWidth, setMultiDayWidth] = useState<number | null>(null);
  const [dragHandlePosition, setDragHandlePosition] = useState<{
    x?: number;
    y?: number;
    data?: {
      isFirstDay?: boolean;
      isLastDay?: boolean;
    };
  } | null>(null);

  const eventDimensions = useRef<{ height: number }>({ height: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const dndContextId = useId();

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    if (!active.data.current) {
      log.error("Missing data in drag start event", event);
      return;
    }

    const {
      event: calendarEvent,
      view,
      height,
      isMultiDay: eventIsMultiDay,
      multiDayWidth: eventMultiDayWidth,
      dragHandlePosition: eventDragHandlePosition,
    } = active.data.current as {
      event: CalendarEvent;
      view: CalendarView;
      height?: number;
      isMultiDay?: boolean;
      multiDayWidth?: number;
      dragHandlePosition?: {
        x?: number;
        y?: number;
        data?: {
          isFirstDay?: boolean;
          isLastDay?: boolean;
        };
      };
    };

    setActiveEvent(calendarEvent);
    setActiveId(active.id);
    setActiveView(view);
    setCurrentTime(new Date(calendarEvent.start));
    setIsMultiDay(eventIsMultiDay || false);
    setMultiDayWidth(eventMultiDayWidth || null);
    setDragHandlePosition(eventDragHandlePosition || null);

    if (height) {
      eventDimensions.current.height = height;
      setEventHeight(height);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (over && activeEvent && over.data.current) {
      const { date, time } = over.data.current as { date: Date; time?: number };

      if (time !== undefined && activeView !== "month") {
        const hours = Math.floor(time);
        const fractionalHour = time - hours;

        // Use exact minutes instead of rounding to 15-minute intervals
        const minutes = Math.round(fractionalHour * 60);

        const newTime = wallClockToUtc(date, hours, minutes, resolvedTimezone);
        const newParts = getZonedDateParts(newTime, resolvedTimezone);
        const currentParts = currentTime
          ? getZonedDateParts(currentTime, resolvedTimezone)
          : null;

        if (
          !currentParts ||
          newParts.hours !== currentParts.hours ||
          newParts.minutes !== currentParts.minutes ||
          newParts.day !== currentParts.day ||
          newParts.month !== currentParts.month ||
          newParts.year !== currentParts.year
        ) {
          setCurrentTime(newTime);
        }
      } else if (activeView === "month") {
        const currentParts = currentTime
          ? getZonedDateParts(currentTime, resolvedTimezone)
          : null;
        const newTime = wallClockToUtc(
          date,
          currentParts?.hours ?? 0,
          currentParts?.minutes ?? 0,
          resolvedTimezone,
        );
        const newParts = getZonedDateParts(newTime, resolvedTimezone);

        if (
          !currentParts ||
          newParts.day !== currentParts.day ||
          newParts.month !== currentParts.month ||
          newParts.year !== currentParts.year
        ) {
          setCurrentTime(newTime);
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !activeEvent || !currentTime) {
      setActiveEvent(null);
      setActiveId(null);
      setActiveView(null);
      setCurrentTime(null);
      setEventHeight(null);
      setIsMultiDay(false);
      setMultiDayWidth(null);
      setDragHandlePosition(null);
      return;
    }

    try {
      if (!active.data.current || !over.data.current) {
        throw new Error("Missing data in drag event");
      }

      const activeData = active.data.current as {
        event?: CalendarEvent;
        view?: string;
      };
      const overData = over.data.current as { date?: Date; time?: number };

      if (!activeData.event || !overData.date) {
        throw new Error("Missing required event data");
      }

      const calendarEvent = activeData.event;
      const date = overData.date;
      const time = overData.time;

      if (calendarEvent.allDay && time === undefined) {
        const { firstDay } = getEventCalendarDayRange(
          calendarEvent,
          resolvedTimezone,
        );
        if (!isSamePickerDay(firstDay, date)) {
          onEventUpdate({
            ...calendarEvent,
            ...moveAllDayEventToDay(calendarEvent, date, resolvedTimezone),
            timezone: resolvedTimezone,
          });
        }
        return;
      }

      let newStart: Date;

      if (time !== undefined) {
        const hours = Math.floor(time);
        const fractionalHour = time - hours;

        // Use exact minutes instead of rounding to 15-minute intervals
        const minutes = Math.round(fractionalHour * 60);

        newStart = wallClockToUtc(date, hours, minutes, resolvedTimezone);
      } else {
        // Month view drops carry no time, so keep the original time of day.
        const currentParts = getZonedDateParts(currentTime, resolvedTimezone);
        newStart = wallClockToUtc(
          date,
          currentParts.hours,
          currentParts.minutes,
          resolvedTimezone,
        );
      }

      const originalStart = new Date(calendarEvent.start);
      const originalEnd = new Date(calendarEvent.end);
      const durationMinutes = differenceInMinutes(originalEnd, originalStart);
      const newEnd = addMinutes(newStart, durationMinutes);

      const originalParts = getZonedDateParts(originalStart, resolvedTimezone);
      const newParts = getZonedDateParts(newStart, resolvedTimezone);
      const hasStartTimeChanged =
        originalParts.year !== newParts.year ||
        originalParts.month !== newParts.month ||
        originalParts.day !== newParts.day ||
        originalParts.hours !== newParts.hours ||
        originalParts.minutes !== newParts.minutes;

      if (hasStartTimeChanged) {
        onEventUpdate({
          ...calendarEvent,
          start: newStart,
          end: newEnd,
          timezone: resolvedTimezone,
        });
      }
    } catch (error) {
      log.error("Error in drag end handler:", error);
    } finally {
      setActiveEvent(null);
      setActiveId(null);
      setActiveView(null);
      setCurrentTime(null);
      setEventHeight(null);
      setIsMultiDay(false);
      setMultiDayWidth(null);
      setDragHandlePosition(null);
    }
  };

  const dndValue = useMemo(
    () => ({
      activeEvent,
      activeId,
      activeView,
      currentTime,
      eventHeight,
      isMultiDay,
      multiDayWidth,
      dragHandlePosition,
    }),
    [
      activeEvent,
      activeId,
      activeView,
      currentTime,
      eventHeight,
      isMultiDay,
      multiDayWidth,
      dragHandlePosition,
    ],
  );

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <CalendarDndContext.Provider value={dndValue}>
        {children}

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeEvent && activeView && (
            <div
              style={{
                height: eventHeight ? `${eventHeight}px` : "auto",
                width:
                  isMultiDay && multiDayWidth ? `${multiDayWidth}%` : "100%",
              }}
            >
              <EventItem
                event={activeEvent}
                view={activeView}
                dragging={true}
                showTime={activeView !== "month"}
                currentTime={currentTime || undefined}
                isFirstDay={dragHandlePosition?.data?.isFirstDay !== false}
                isLastDay={dragHandlePosition?.data?.isLastDay !== false}
                timezone={timezone}
                timeFormat={timeFormat}
              />
            </div>
          )}
        </DragOverlay>
      </CalendarDndContext.Provider>
    </DndContext>
  );
}
