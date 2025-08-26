"use client";
import { useMemo } from "react";
import { differenceInMinutes, format, getMinutes, isPast } from "date-fns";
import { getBorderRadiusClasses, getEventColorClasses, getEventColorStyles, } from "./utils";
import { cn } from "../../lib/utils";
import { formatEventDescription } from "./event-description-formatter";
import { formatInTimeZone } from "date-fns-tz";
// Using date-fns format with custom formatting:
// 12h format: 'h' - hours (1-12), 'a' - am/pm
// 24h format: 'H' - hours (0-23)
// ':mm' - minutes with leading zero (only if the token 'mm' is present)
const formatTimeWithOptionalMinutes = (date, timeFormat = "12h") => {
    if (timeFormat === "24h") {
        return format(date, getMinutes(date) === 0 ? "H" : "H:mm");
    }
    else {
        return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
    }
};
// Timezone-aware formatter (falls back to local if no timezone)
const formatTimeWithOptionalMinutesTZ = (date, timeFormat = "12h", timezone) => {
    if (!timezone)
        return formatTimeWithOptionalMinutes(date, timeFormat);
    const token = timeFormat === "24h" ? (getMinutes(date) === 0 ? "H" : "H:mm") : (getMinutes(date) === 0 ? "ha" : "h:mma");
    const str = formatInTimeZone(date, timezone, token);
    return timeFormat === "12h" ? str.toLowerCase() : str;
};
// Shared wrapper component for event styling
function EventWrapper({ event, isFirstDay = true, isLastDay = true, isDragging, onClick, className, children, currentTime, dndListeners, dndAttributes, onMouseDown, onTouchStart, }) {
    // Always use the currentTime (if provided) to determine if the event is in the past
    const displayEnd = currentTime
        ? new Date(new Date(currentTime).getTime() +
            (new Date(event.end).getTime() - new Date(event.start).getTime()))
        : new Date(event.end);
    const isEventInPast = isPast(displayEnd);
    return (<button className={cn("focus-visible:border-ring focus-visible:ring-ring/50 flex h-full w-full overflow-hidden text-left font-medium backdrop-blur-md transition-all duration-200 ease-out outline-none select-none focus-visible:ring-[3px] data-dragging:cursor-grabbing data-dragging:shadow-lg data-past-event:line-through hover:scale-[1.02] hover:shadow-md hover:z-10 active:scale-[0.98] border border-white/20 shadow-sm", 
        // Enhanced mobile touch targets and visual feedback
        "min-h-[20px] sm:min-h-[24px]", // Minimum touch target size
        "touch-manipulation", // Optimized touch behavior
        // Mobile-optimized padding - less horizontal padding to show more text
        "px-[2px] sm:px-2", getEventColorClasses(event.color), getBorderRadiusClasses(isFirstDay, isLastDay), className)} style={getEventColorStyles(event.color)} data-dragging={isDragging || undefined} data-past-event={isEventInPast || undefined} onClick={onClick} onMouseDown={onMouseDown} onTouchStart={onTouchStart} {...dndListeners} {...dndAttributes}>
      {children}
    </button>);
}
export function EventItem({ event, view, isDragging, onClick, showTime, currentTime, isFirstDay = true, isLastDay = true, children, className, dndListeners, dndAttributes, onMouseDown, onTouchStart, timeFormat = "12h", timezone, }) {
    const eventColor = event.color;
    // Use the provided currentTime (for dragging) or the event's actual time
    const displayStart = useMemo(() => {
        return currentTime || new Date(event.start);
    }, [currentTime, event.start]);
    const displayEnd = useMemo(() => {
        return currentTime
            ? new Date(new Date(currentTime).getTime() +
                (new Date(event.end).getTime() - new Date(event.start).getTime()))
            : new Date(event.end);
    }, [currentTime, event.start, event.end]);
    // Calculate event duration in minutes
    const durationMinutes = useMemo(() => {
        return differenceInMinutes(displayEnd, displayStart);
    }, [displayStart, displayEnd]);
    const getEventTime = () => {
        if (event.allDay)
            return "All day";
        // For short events (less than 45 minutes), only show start time
        if (durationMinutes < 45) {
            return formatTimeWithOptionalMinutesTZ(displayStart, timeFormat, timezone);
        }
        // For longer events, show both start and end time
        return `${formatTimeWithOptionalMinutesTZ(displayStart, timeFormat, timezone)} - ${formatTimeWithOptionalMinutesTZ(displayEnd, timeFormat, timezone)}`;
    };
    if (view === "month") {
        return (<EventWrapper event={event} isFirstDay={isFirstDay} isLastDay={isLastDay} isDragging={isDragging} onClick={onClick} className={cn("mt-[var(--event-gap)] h-[var(--event-height)] items-center text-[10px] sm:text-[13px]", className)} currentTime={currentTime} dndListeners={dndListeners} dndAttributes={dndAttributes} onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
        {children || (<span className="truncate flex items-center gap-1">
            <span className="truncate">{event.title}</span>
          </span>)}
      </EventWrapper>);
    }
    if (view === "week" || view === "day") {
        return (<EventWrapper event={event} isFirstDay={isFirstDay} isLastDay={isLastDay} isDragging={isDragging} onClick={onClick} className={cn("py-0.5 sm:py-1", durationMinutes < 45 ? "items-center" : "flex-col", 
            // Enhanced mobile typography and sizing with better text wrapping
            view === "week"
                ? "text-[10px] leading-[1.1] sm:text-[13px] sm:leading-normal"
                : "text-[13px]", className)} currentTime={currentTime} dndListeners={dndListeners} dndAttributes={dndAttributes} onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
        {durationMinutes < 45 ? (
            // Short events - mobile optimized layout
            <div className="flex items-start gap-0.5 w-full min-w-0">
            <span className={cn("font-medium flex-1 min-w-0", 
                // On mobile, allow text wrapping for very narrow events
                view === "week" ? "break-words hyphens-auto sm:truncate" : "truncate")} title={event.title} // Tooltip for full title on hover/long press
            >
              {event.title}
            </span>
          </div>) : (
            // Longer events - mobile optimized layout
            <>
            <div className="flex items-start gap-0.5 w-full min-w-0">
              <span className={cn("font-medium flex-1 min-w-0", 
                // On mobile, allow text wrapping for week view
                view === "week" ? "break-words hyphens-auto leading-tight sm:truncate" : "truncate")} title={event.title} // Tooltip for full title on hover/long press
            >
                {event.title}
              </span>
            </div>
          </>)}
      </EventWrapper>);
    }
    // Agenda view - kept separate since it's significantly different
    return (<button className={cn("focus-visible:border-ring focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded p-2 text-left transition outline-none focus-visible:ring-[3px] data-past-event:line-through data-past-event:opacity-90", getEventColorClasses(eventColor), className)} style={getEventColorStyles(eventColor)} data-past-event={isPast(new Date(event.end)) || undefined} onClick={onClick} onMouseDown={onMouseDown} onTouchStart={onTouchStart} {...dndListeners} {...dndAttributes}>
      <div className="text-sm font-medium flex items-center gap-2">
        <span className="truncate">{event.title}</span>
      </div>
      {!event.allDay && (<div className="text-xs opacity-70">
          {getEventTime()}
        </div>)}
      {event.location && (<div className="text-xs opacity-70">
          <span>{event.location}</span>
        </div>)}
      {event.description && (<div className="my-1 text-xs opacity-90">{formatEventDescription(event.description)}</div>)}
    </button>);
}
