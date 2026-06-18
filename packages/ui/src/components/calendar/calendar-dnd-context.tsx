"use client";

import {
  createContext,
  useContext,
  useId,
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
  getZonedDateParts,
  resolveTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";

import { EventItem } from "./event-item";
import { CalendarEvent, type CalendarView } from "./types";

const log = createLogger("calendar-dnd");

// Define the context type
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

// Create the context
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

// Hook to use the context
export const useCalendarDnd = () => useContext(CalendarDndContext);

// Props for the provider
interface CalendarDndProviderProps {
  children: ReactNode;
  onEventUpdate: (event: CalendarEvent) => void;
  timezone?: string;
}

export function CalendarDndProvider({
  children,
  onEventUpdate,
  timezone,
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

  // Store original event dimensions
  const eventDimensions = useRef<{ height: number }>({ height: 0 });

  // Configure sensors for better drag detection
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Require the mouse to move by 5px before activating
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      // Press delay of 250ms, with tolerance of 5px of movement
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(PointerSensor, {
      // Require the pointer to move by 5px before activating
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  // Generate a stable ID for the DndContext
  const dndContextId = useId();

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    // Add safety check for data.current
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

    // Store event height if provided
    if (height) {
      eventDimensions.current.height = height;
      setEventHeight(height);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (over && activeEvent && over.data.current) {
      const { date, time } = over.data.current as { date: Date; time?: number };

      // Update time for week/day views
      if (time !== undefined && activeView !== "month") {
        // Calculate hours and minutes with exact precision
        const hours = Math.floor(time);
        const fractionalHour = time - hours;

        // Use exact minutes instead of rounding to 15-minute intervals
        const minutes = Math.round(fractionalHour * 60);

        const newTime = wallClockToUtc(date, hours, minutes, resolvedTimezone);
        const newParts = getZonedDateParts(newTime, resolvedTimezone);
        const currentParts = currentTime
          ? getZonedDateParts(currentTime, resolvedTimezone)
          : null;

        // Only update if time has changed
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
        // For month view, just update the date but preserve time
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

        // Only update if date has changed
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

    // Add robust error checking
    if (!over || !activeEvent || !currentTime) {
      // Reset state and exit early
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
      // Safely access data with checks
      if (!active.data.current || !over.data.current) {
        throw new Error("Missing data in drag event");
      }

      const activeData = active.data.current as {
        event?: CalendarEvent;
        view?: string;
      };
      const overData = over.data.current as { date?: Date; time?: number };

      // Verify we have all required data
      if (!activeData.event || !overData.date) {
        throw new Error("Missing required event data");
      }

      const calendarEvent = activeData.event;
      const date = overData.date;
      const time = overData.time;

      // Calculate new start time
      let newStart: Date;

      // If time is provided (for week/day views), set the hours and minutes
      if (time !== undefined) {
        const hours = Math.floor(time);
        const fractionalHour = time - hours;

        // Use exact minutes instead of rounding to 15-minute intervals
        const minutes = Math.round(fractionalHour * 60);

        newStart = wallClockToUtc(date, hours, minutes, resolvedTimezone);
      } else {
        // For month view, preserve the original time from currentTime
        const currentParts = getZonedDateParts(currentTime, resolvedTimezone);
        newStart = wallClockToUtc(
          date,
          currentParts.hours,
          currentParts.minutes,
          resolvedTimezone,
        );
      }

      // Calculate new end time based on the original duration
      const originalStart = new Date(calendarEvent.start);
      const originalEnd = new Date(calendarEvent.end);
      const durationMinutes = differenceInMinutes(originalEnd, originalStart);
      const newEnd = addMinutes(newStart, durationMinutes);

      // Only update if the start time has actually changed
      const originalParts = getZonedDateParts(originalStart, resolvedTimezone);
      const newParts = getZonedDateParts(newStart, resolvedTimezone);
      const hasStartTimeChanged =
        originalParts.year !== newParts.year ||
        originalParts.month !== newParts.month ||
        originalParts.day !== newParts.day ||
        originalParts.hours !== newParts.hours ||
        originalParts.minutes !== newParts.minutes;

      if (hasStartTimeChanged) {
        // Update the event only if the time has changed
        onEventUpdate({
          ...calendarEvent,
          start: newStart,
          end: newEnd,
        });
      }
    } catch (error) {
      log.error("Error in drag end handler:", error);
    } finally {
      // Always reset state
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

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <CalendarDndContext.Provider
        value={{
          activeEvent,
          activeId,
          activeView,
          currentTime,
          eventHeight,
          isMultiDay,
          multiDayWidth,
          dragHandlePosition,
        }}
      >
        {children}

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeEvent && activeView && (
            <div
              style={{
                height: eventHeight ? `${eventHeight}px` : "auto",
                width:
                  isMultiDay && multiDayWidth ? `${multiDayWidth}%` : "100%",
                // Remove the transform that was causing the shift
              }}
            >
              <EventItem
                event={activeEvent}
                view={activeView}
                isDragging={true}
                showTime={activeView !== "month"}
                currentTime={currentTime || undefined}
                isFirstDay={dragHandlePosition?.data?.isFirstDay !== false}
                isLastDay={dragHandlePosition?.data?.isLastDay !== false}
                timezone={timezone}
              />
            </div>
          )}
        </DragOverlay>
      </CalendarDndContext.Provider>
    </DndContext>
  );
}
