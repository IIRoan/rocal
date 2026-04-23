"use client";

import { useMemo } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { differenceInMinutes, format, getMinutes, isPast } from "date-fns";
import { MapPinIcon } from "@phosphor-icons/react";

import {
  getBorderRadiusClasses,
  getEventColorClasses,
  getEventColorStyles,
  isHexColor,
  resolveInlineColorValue,
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
        "group/ev relative flex h-full w-full overflow-hidden text-left transition-all duration-150 ease-out outline-none select-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "data-dragging:cursor-grabbing data-dragging:shadow-lg data-dragging:z-20",
        "data-past-event:opacity-65",
        "hover:brightness-[1.04] hover:shadow-sm hover:z-10",
        "active:brightness-[0.97]",
        "touch-manipulation",
        compact ? "min-h-0 px-1" : "min-h-[20px] sm:min-h-[24px] px-1.5 sm:px-2",
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
              <EncryptionStatusBadge item={event} asIcon />
              <span className="truncate">{event.title}</span>
            </span>
          )}
        </EventWrapper>
      );
    }

    if (view === "week" || view === "day") {
      // Height-based sizing thresholds
      const isCompact = height != null && height < 22;
      const isSmall = height != null && height < 32;
      const showStacked =
        !isCompact &&
        !isSmall &&
        durationMinutes >= 45 &&
        showTime &&
        !event.allDay;

      const startLabel = formatTimeWithOptionalMinutesTZ(
        displayStart,
        timeFormat,
        timezone,
      );
      const endLabel = formatTimeWithOptionalMinutesTZ(
        displayEnd,
        timeFormat,
        timezone,
      );

      return (
        <EventWrapper
          event={event}
          isFirstDay={isFirstDay}
          isLastDay={isLastDay}
          isDragging={isDragging}
          onClick={onClick}
          compact={isCompact}
          className={cn(
            isCompact ? "" : isSmall ? "py-px" : "py-1 sm:py-1.5",
            isCompact || isSmall
              ? "items-center"
              : showStacked
                ? "flex-col justify-start gap-0.5"
                : "items-center",
            isCompact
              ? "text-[8px] leading-none"
              : isSmall
                ? "text-[10px] leading-tight"
                : view === "week"
                  ? "text-[11px] leading-tight sm:text-[12.5px] sm:leading-snug"
                  : "text-[13px] leading-snug",
            className,
          )}
          currentTime={currentTime}
          dndListeners={dndListeners}
          dndAttributes={dndAttributes}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {showStacked ? (
            <>
              <div className="flex items-center gap-1 w-full min-w-0">
                <EncryptionStatusBadge item={event} asIcon />
                <span
                  className="font-semibold flex-1 min-w-0 truncate tracking-tight"
                  title={event.title}
                >
                  {event.title}
                </span>
              </div>
              <div className="flex items-center w-full min-w-0">
                <span className="text-[11px] font-normal tabular-nums opacity-80 truncate">
                  {startLabel}
                  <span className="opacity-60 mx-1">–</span>
                  {endLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-baseline gap-1.5 w-full min-w-0 overflow-hidden">
              <EncryptionStatusBadge item={event} asIcon />
              <span
                className={cn(
                  "flex-1 min-w-0 truncate whitespace-nowrap tracking-tight",
                  isCompact ? "font-medium" : "font-semibold",
                )}
                title={event.title}
              >
                {event.title}
              </span>
              {!isCompact && showTime && !event.allDay && (
                <span className="shrink-0 text-[10px] font-normal tabular-nums opacity-70 whitespace-nowrap">
                  {startLabel}
                </span>
              )}
            </div>
          )}
        </EventWrapper>
      );
    }

    // Agenda view — Apple Calendar-inspired flat list row
    const agendaTimeStart = formatTimeWithOptionalMinutesTZ(
      new Date(event.start),
      timeFormat,
      timezone,
    );
    const agendaTimeEnd = formatTimeWithOptionalMinutesTZ(
      new Date(event.end),
      timeFormat,
      timezone,
    );
    const accentColor = resolveInlineColorValue(eventColor);

    return (
      <button
        className={cn(
          "group/ev relative isolate w-full rounded-lg text-left transition-colors duration-150 ease-out outline-none",
          "hover:bg-muted/60 active:bg-muted/80",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "data-past-event:opacity-55",
          className,
        )}
        style={{ ["--ev-accent" as any]: accentColor }}
        data-past-event={isPast(new Date(event.end)) || undefined}
        data-event-id={event.id}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        {...dndListeners}
        {...dndAttributes}
      >
        <div className="flex items-start gap-3 px-2 py-3">
          {/* Time column */}
          <div className="flex w-[68px] shrink-0 flex-col items-end pt-0.5 tabular-nums">
            {event.allDay ? (
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                All day
              </span>
            ) : (
              <>
                <span className="text-[15px] font-semibold leading-tight text-foreground">
                  {agendaTimeStart}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground/70 mt-0.5">
                  {agendaTimeEnd}
                </span>
              </>
            )}
          </div>

          {/* Color indicator */}
          <span
            aria-hidden
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
            style={{ backgroundColor: "var(--ev-accent)" }}
          />

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <EncryptionStatusBadge item={event} asIcon />
              <span className="truncate text-[15px] font-semibold leading-snug text-foreground tracking-tight group-data-past-event/ev:line-through">
                {event.title}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-1 text-[12px] text-muted-foreground min-w-0">
                <MapPinIcon size={12} weight="fill" className="shrink-0 opacity-70" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
            {event.description && (
              <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground/80 line-clamp-2">
                {formatEventDescription(event.description)}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  return renderEventContent();
}
