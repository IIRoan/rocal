"use client";

import { useMemo } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { differenceInMinutes, format, getMinutes, isPast } from "date-fns";

import {
  getBorderRadiusClasses,
  getEventColorClasses,
  getEventColorStyles,
  isHexColor,
  getColorSwatchValue,
} from "./utils";
import { EncryptionStatusBadge } from "./encryption-status";
import { CalendarEvent, type CalendarView } from "./types";
import { cn } from "../../lib/utils";
import { formatEventDescription } from "./event-description-formatter";
import { formatInTimeZone } from "date-fns-tz";

// Using date-fns format with custom formatting:
// 12h format: 'h' - hours (1-12), 'a' - am/pm
// 24h format: 'H' - hours (0-23)
// ':mm' - minutes with leading zero (only if the token 'mm' is present)
const formatTimeWithOptionalMinutes = (
  date: Date,
  timeFormat: "12h" | "24h" = "12h",
) => {
  if (timeFormat === "24h") {
    return format(date, getMinutes(date) === 0 ? "H" : "H:mm");
  } else {
    return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
  }
};

// Timezone-aware formatter (falls back to local if no timezone)
const formatTimeWithOptionalMinutesTZ = (
  date: Date,
  timeFormat: "12h" | "24h" = "12h",
  timezone?: string,
) => {
  if (!timezone) return formatTimeWithOptionalMinutes(date, timeFormat);
  const token =
    timeFormat === "24h"
      ? getMinutes(date) === 0
        ? "H"
        : "H:mm"
      : getMinutes(date) === 0
        ? "ha"
        : "h:mma";
  const str = formatInTimeZone(date, timezone, token);
  return timeFormat === "12h" ? str.toLowerCase() : str;
};

interface EventWrapperProps {
  event: CalendarEvent;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
  currentTime?: Date;
  compact?: boolean;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
}

// Shared wrapper component for event styling
function EventWrapper({
  event,
  isFirstDay = true,
  isLastDay = true,
  isDragging,
  onClick,
  className,
  children,
  currentTime,
  compact = false,
  dndListeners,
  dndAttributes,
  onMouseDown,
  onTouchStart,
}: EventWrapperProps) {
  // Always use the currentTime (if provided) to determine if the event is in the past
  const displayEnd = currentTime
    ? new Date(
        new Date(currentTime).getTime() +
          (new Date(event.end).getTime() - new Date(event.start).getTime()),
      )
    : new Date(event.end);

  const isEventInPast = isPast(displayEnd);
  const isPreview = !!(event as any).isPreview;

  // Preview events get a distinct ghost/outline style
  if (isPreview) {
    // For hex colors, derive a semi-transparent background from the hex
    // For named colors, use the color class with reduced opacity for visibility in both themes
    const colorIsHex = isHexColor(event.color || "");

    return (
      <div
        className={cn(
          "flex h-full w-full overflow-hidden text-left font-medium transition-all duration-200 ease-out outline-none select-none",
          "min-h-[20px] sm:min-h-[24px]",
          "px-[2px] sm:px-2",
          "border-2 border-dashed rounded-md",
          "animate-in fade-in-0 duration-300",
          // Use the event color classes for named colors so the border inherits the right color
          !colorIsHex && getEventColorClasses(event.color),
          className,
        )}
        style={
          colorIsHex
            ? {
                borderColor: event.color!,
                backgroundColor: `${event.color}33`,
                color: event.color,
                opacity: 0.85,
              }
            : { opacity: 0.85 }
        }
        data-preview-event="true"
        data-event-id={event.id}
      >
        {children}
      </div>
    );
  }

  return (
    <button
      className={cn(
        "group/ev relative focus-visible:border-ring focus-visible:ring-ring/50 flex h-full w-full overflow-hidden text-left font-medium backdrop-blur-md transition-all duration-200 ease-out outline-none select-none focus-visible:ring-[3px] data-dragging:cursor-grabbing data-dragging:shadow-lg data-past-event:line-through hover:-translate-y-px hover:brightness-[1.07] hover:shadow-md hover:z-10 active:translate-y-0 active:brightness-95 active:shadow-sm border border-white/20 shadow-sm",
        "touch-manipulation",
        // Only apply min-height and padding when not compact (small events)
        compact ? "min-h-0 px-[1px]" : "min-h-[20px] sm:min-h-[24px] px-[2px] sm:px-2",
        getEventColorClasses(event.color),
        getBorderRadiusClasses(isFirstDay, isLastDay),
        className,
      )}
      style={getEventColorStyles(event.color)}
      data-dragging={isDragging || undefined}
      data-past-event={isEventInPast || undefined}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      data-event-id={event.id}
      {...dndListeners}
      {...dndAttributes}
    >
      {children}
    </button>
  );
}

interface EventItemProps {
  event: CalendarEvent;
  view: CalendarView;
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  showTime?: boolean;
  height?: number;
  currentTime?: Date; // For updating time during drag
  isFirstDay?: boolean;
  isLastDay?: boolean;
  children?: React.ReactNode;
  className?: string;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  // Context menu actions
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
  onView?: (event: CalendarEvent) => void;
}

export function EventItem({
  event,
  view,
  isDragging,
  onClick,
  showTime,
  height,
  currentTime,
  isFirstDay = true,
  isLastDay = true,
  children,
  className,
  dndListeners,
  dndAttributes,
  onMouseDown,
  onTouchStart,
  timeFormat = "12h",
  timezone,
}: EventItemProps) {
  const eventColor = event.color;

  // Use the provided currentTime (for dragging) or the event's actual time
  const displayStart = useMemo(() => {
    return currentTime || new Date(event.start);
  }, [currentTime, event.start]);

  const displayEnd = useMemo(() => {
    return currentTime
      ? new Date(
          new Date(currentTime).getTime() +
            (new Date(event.end).getTime() - new Date(event.start).getTime()),
        )
      : new Date(event.end);
  }, [currentTime, event.start, event.end]);

  // Calculate event duration in minutes
  const durationMinutes = useMemo(() => {
    return differenceInMinutes(displayEnd, displayStart);
  }, [displayStart, displayEnd]);

  const getEventTime = () => {
    if (event.allDay) return "All day";

    // For short events (less than 45 minutes), only show start time
    if (durationMinutes < 45) {
      return formatTimeWithOptionalMinutesTZ(
        displayStart,
        timeFormat,
        timezone,
      );
    }

    // For longer events, show both start and end time
    return `${formatTimeWithOptionalMinutesTZ(displayStart, timeFormat, timezone)} - ${formatTimeWithOptionalMinutesTZ(displayEnd, timeFormat, timezone)}`;
  };

  // Render the event content based on view
  const renderEventContent = () => {
    if (view === "month") {
      return (
        <EventWrapper
          event={event}
          isFirstDay={isFirstDay}
          isLastDay={isLastDay}
          isDragging={isDragging}
          onClick={onClick}
          className={cn(
            "mt-[var(--event-gap)] h-[var(--event-height)] items-center text-[10px] sm:text-[13px]",
            className,
          )}
          currentTime={currentTime}
          dndListeners={dndListeners}
          dndAttributes={dndAttributes}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {children || (
            <span className="truncate flex items-center gap-1">
              <EncryptionStatusBadge item={event} />
              <span className="truncate">{event.title}</span>
            </span>
          )}
        </EventWrapper>
      );
    }

    if (view === "week" || view === "day") {
      // Height-based sizing thresholds
      const isCompact = height != null && height < 20;
      const isSmall = height != null && height < 30;
      const isMedium = height != null && height < 45;
      const showTimeLine = !isCompact && !isSmall && durationMinutes >= 45 && showTime && !event.allDay;

      return (
        <EventWrapper
          event={event}
          isFirstDay={isFirstDay}
          isLastDay={isLastDay}
          isDragging={isDragging}
          onClick={onClick}
          compact={isCompact}
          className={cn(
            // No vertical padding when very small
            isCompact ? "" : isSmall ? "py-px" : "py-0.5 sm:py-1",
            isCompact ? "items-center" : isSmall ? "items-center" : showTimeLine ? "flex-col" : "items-center",
            // Font size scales with height
            isCompact
              ? "text-[8px] leading-none"
              : isSmall
                ? "text-[9px] leading-tight"
                : view === "week"
                  ? "text-[10px] leading-[1.1] sm:text-[13px] sm:leading-normal"
                  : "text-[13px]",
            className,
          )}
          currentTime={currentTime}
          dndListeners={dndListeners}
          dndAttributes={dndAttributes}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="flex items-center gap-0.5 w-full min-w-0 overflow-hidden">
            <EncryptionStatusBadge item={event} />
            <span
              className="font-medium flex-1 min-w-0 truncate whitespace-nowrap"
              title={event.title}
            >
              {event.title}
            </span>
          </div>
          {showTimeLine && (
            <span className="opacity-70 truncate whitespace-nowrap text-[10px]">
              {getEventTime()}
            </span>
          )}
        </EventWrapper>
      );
    }

    // Agenda view - kept separate since it's significantly different
    return (
      <button
        className={cn(
          "group/ev relative overflow-hidden focus-visible:border-ring focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded p-2 text-left transition-all duration-200 ease-out outline-none focus-visible:ring-[3px] data-past-event:line-through data-past-event:opacity-90 hover:-translate-y-px hover:brightness-[1.07] hover:shadow-md active:translate-y-0 active:brightness-95 active:shadow-sm shadow-sm",
          getEventColorClasses(eventColor),
          className,
        )}
        style={getEventColorStyles(eventColor)}
        data-past-event={isPast(new Date(event.end)) || undefined}
        data-event-id={event.id}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        {...dndListeners}
        {...dndAttributes}
      >
        <div className="text-sm font-medium flex items-center gap-2">
          <EncryptionStatusBadge item={event} />
          <span className="truncate">{event.title}</span>
        </div>
        {!event.allDay && (
          <div className="text-xs opacity-70">{getEventTime()}</div>
        )}
        {event.location && (
          <div className="text-xs opacity-70">
            <span>{event.location}</span>
          </div>
        )}
        {event.description && (
          <div className="my-1 text-xs opacity-90">
            {formatEventDescription(event.description)}
          </div>
        )}
      </button>
    );
  };

  return renderEventContent();
}
