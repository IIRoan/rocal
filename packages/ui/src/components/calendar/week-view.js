"use client";
import React, { useMemo, useEffect, useRef } from "react";
import { addHours, areIntervalsOverlapping, eachDayOfInterval, eachHourOfInterval, endOfWeek, format, getHours, getMinutes, isBefore, isSameDay, isToday, startOfDay, startOfWeek, isWithinInterval, endOfDay, } from "date-fns";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import { EventDots, groupEventsByExactTime } from "./event-dots";
import { isMultiDayEvent, sortEvents } from "./utils";
import { WeekCellsHeight } from "./constants";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { StartHour, EndHour } from "./constants";
import { cn } from "../../lib/utils";
export function WeekView({ currentDate, events, onEventSelect, onEventCreate, compactView = false, timeFormat = "12h", weekStartDay = 0, workingDays = [1, 2, 3, 4, 5], timezone, }) {
    const scrollContainerRef = useRef(null);
    const days = useMemo(() => {
        const weekStart = startOfWeek(currentDate, {
            weekStartsOn: weekStartDay,
        });
        const weekEnd = endOfWeek(currentDate, {
            weekStartsOn: weekStartDay,
        });
        return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [currentDate, weekStartDay]);
    const weekStart = useMemo(() => startOfWeek(currentDate, {
        weekStartsOn: weekStartDay,
    }), [currentDate, weekStartDay]);
    const weekEnd = useMemo(() => endOfWeek(currentDate, {
        weekStartsOn: weekStartDay,
    }), [currentDate, weekStartDay]);
    const hours = useMemo(() => {
        const dayStart = startOfDay(currentDate);
        return eachHourOfInterval({
            start: addHours(dayStart, StartHour),
            end: addHours(dayStart, EndHour),
        });
    }, [currentDate]);
    // Get all-day events and multi-day events for the week
    const allDayEvents = useMemo(() => {
        return events
            .filter((event) => {
            // Include explicitly marked all-day events or multi-day events
            return event.allDay || isMultiDayEvent(event);
        })
            .filter((event) => {
            const eventStart = startOfDay(new Date(event.start));
            const eventEnd = startOfDay(new Date(event.end));
            const weekStartDay = startOfDay(weekStart);
            const weekEndDay = endOfDay(weekEnd);
            // Check if event overlaps with the current week using proper interval checking
            return (
            // Event starts within the week
            isWithinInterval(eventStart, { start: weekStartDay, end: weekEndDay }) ||
                // Event ends within the week
                isWithinInterval(eventEnd, { start: weekStartDay, end: weekEndDay }) ||
                // Event spans the entire week (starts before and ends after)
                (isBefore(eventStart, weekStartDay) && isBefore(weekEndDay, eventEnd)) ||
                // Week is within the event
                isWithinInterval(weekStartDay, { start: eventStart, end: eventEnd }));
        });
    }, [events, weekStart, weekEnd]);
    // Process events for each day to calculate positions
    const processedDayEvents = useMemo(() => {
        const result = days.map((day) => {
            // Get events for this day that are not all-day events or multi-day events
            const dayEvents = events.filter((event) => {
                // Skip all-day events and multi-day events
                if (event.allDay || isMultiDayEvent(event))
                    return false;
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                // Check if event is on this day
                // Use proper date comparison for spanning events
                const dayStart = startOfDay(day);
                const dayEnd = addHours(dayStart, 24);
                return (isSameDay(day, eventStart) ||
                    isSameDay(day, eventEnd) ||
                    (eventStart < dayEnd && eventEnd > dayStart));
            });
            // Group events by exact time first, then sort by start time and duration
            const eventGroups = groupEventsByExactTime(dayEvents);
            // Sort groups by start time
            eventGroups.sort((a, b) => {
                const aStart = new Date(a[0]?.start || 0);
                const bStart = new Date(b[0]?.start || 0);
                return aStart.getTime() - bStart.getTime();
            });
            // Calculate positions for each event using improved layout algorithm
            const positionedEvents = [];
            const dayStart = startOfDay(day);
            // Track columns for overlapping event groups
            const columns = [];
            const groupColumnMapping = new Map();
            // First pass: assign event groups to columns
            eventGroups.forEach((eventGroup) => {
                const firstEvent = eventGroup[0];
                if (!firstEvent)
                    return; // Skip empty groups
                const eventStart = new Date(firstEvent.start);
                const eventEnd = new Date(firstEvent.end);
                // Adjust start and end times if they're outside this day
                const adjustedStart = isSameDay(day, eventStart)
                    ? eventStart
                    : dayStart;
                const adjustedEnd = isSameDay(day, eventEnd)
                    ? eventEnd
                    : addHours(dayStart, 24);
                // Find a column for this event group
                let columnIndex = 0;
                let placed = false;
                while (!placed) {
                    const col = columns[columnIndex] || [];
                    if (col.length === 0) {
                        columns[columnIndex] = col;
                        placed = true;
                    }
                    else {
                        const overlaps = col.some((c) => areIntervalsOverlapping({ start: adjustedStart, end: adjustedEnd }, { start: c.start, end: c.end }));
                        if (!overlaps) {
                            placed = true;
                        }
                        else {
                            columnIndex++;
                        }
                    }
                }
                // Ensure column is initialized before pushing
                const currentColumn = columns[columnIndex] || [];
                columns[columnIndex] = currentColumn;
                currentColumn.push({
                    events: eventGroup,
                    start: adjustedStart,
                    end: adjustedEnd
                });
                groupColumnMapping.set(eventGroup, columnIndex);
            });
            // Second pass: calculate positions for event groups
            eventGroups.forEach((eventGroup) => {
                const event = eventGroup[0]; // Use first event for positioning calculations
                if (!event)
                    return; // Skip empty groups
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                // Adjust start and end times if they're outside this day
                const adjustedStart = isSameDay(day, eventStart)
                    ? eventStart
                    : dayStart;
                const adjustedEnd = isSameDay(day, eventEnd)
                    ? eventEnd
                    : addHours(dayStart, 24);
                // Calculate top position and height
                const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
                const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
                const top = (startHour - StartHour) * WeekCellsHeight;
                const height = (endHour - startHour) * WeekCellsHeight;
                const columnIndex = groupColumnMapping.get(eventGroup) ?? 0;
                const totalColumns = columns.length;
                // Calculate overlapping event groups for this specific time slot
                const overlappingGroups = eventGroups.filter((otherGroup) => {
                    if (otherGroup === eventGroup)
                        return false;
                    const otherEvent = otherGroup[0];
                    if (!otherEvent)
                        return false;
                    const otherStart = new Date(otherEvent.start);
                    const otherEnd = new Date(otherEvent.end);
                    return areIntervalsOverlapping({ start: adjustedStart, end: adjustedEnd }, { start: otherStart, end: otherEnd });
                });
                const overlappingColumns = overlappingGroups.length + 1;
                // Use improved width and positioning calculation with mobile optimization
                let width;
                let left;
                // Mobile-first approach for all overlap scenarios
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640; // sm breakpoint
                if (overlappingColumns === 1) {
                    // No overlapping events, take full width
                    width = 1;
                    left = 0;
                }
                else if (overlappingColumns === 2) {
                    if (isMobile) {
                        // On mobile, give each event more width by reducing gaps
                        width = columnIndex === 0 ? 0.95 : 0.8; // First event gets 95%, second gets 80%
                        left = columnIndex === 0 ? 0 : 0.15; // First at 0%, second at 15%
                    }
                    else {
                        width = (1 / overlappingColumns) * 0.92;
                        left = columnIndex * (1 / overlappingColumns) + (columnIndex * 0.02);
                    }
                }
                else if (overlappingColumns === 3) {
                    if (isMobile) {
                        // For 3 events on mobile, prioritize the first two
                        const widths = [0.9, 0.75, 0.6];
                        const positions = [0, 0.1, 0.25];
                        width = widths[columnIndex] || 0.6;
                        left = positions[columnIndex] || 0.4;
                    }
                    else {
                        width = (1 / overlappingColumns) * 0.88;
                        left = columnIndex * (1 / overlappingColumns) + (columnIndex * 0.03);
                    }
                }
                else {
                    // For more than 3 overlapping events, use mobile-optimized strategy
                    if (isMobile) {
                        // On mobile with many overlapping events, use a different strategy
                        if (overlappingColumns > 4) {
                            // For very crowded scenarios on mobile, use minimal stacking
                            // Make events wider but stack them more tightly
                            width = Math.max(0.85, 1 - overlappingColumns * 0.02); // Start at 85% width, minimal reduction
                            left = columnIndex * 0.08; // Small offset for visibility
                            // Cap the total offset so events don't go off-screen
                            if (left + width > 1) {
                                left = Math.max(0, 1 - width);
                            }
                        }
                        else {
                            // For 4 or fewer overlapping events, use generous widths
                            const baseWidth = 0.75; // Start with 75% width
                            const widthDecrement = 0.05; // Very small reduction per column
                            width = Math.max(0.6, baseWidth - (columnIndex * widthDecrement)); // Minimum 60% width
                            // Minimal stagger offset for better readability
                            const offsetIncrement = 0.08;
                            left = Math.min(columnIndex * offsetIncrement, 0.3); // Cap offset at 30%
                        }
                    }
                    else {
                        // Desktop behavior (original logic)
                        const baseWidth = 0.75;
                        const widthDecrement = Math.min(0.1, 0.5 / overlappingColumns);
                        width = baseWidth - (columnIndex * widthDecrement);
                        const offsetIncrement = Math.min(0.15, 0.8 / overlappingColumns);
                        left = columnIndex * offsetIncrement;
                    }
                }
                positionedEvents.push({
                    events: eventGroup,
                    top,
                    height,
                    left,
                    width,
                    zIndex: 10 + columnIndex, // Higher columns get higher z-index
                    dayIndex: 0, // Will be set correctly when rendering
                    isGrouped: eventGroup.length > 1,
                });
            });
            return positionedEvents;
        });
        return result;
    }, [days, events]);
    const handleEventClick = (event, e) => {
        e.stopPropagation();
        onEventSelect(event);
    };
    const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(currentDate, "week", timezone);
    // Scroll to middle of day (9 AM) when component mounts or view changes
    useEffect(() => {
        const scrollToMiddleOfDay = () => {
            if (scrollContainerRef.current) {
                // Calculate position for 9 AM (hour 9)
                const targetHour = 9;
                const scrollPosition = (targetHour - StartHour) * WeekCellsHeight;
                // Try to find the actual scrollable parent
                let scrollableParent = scrollContainerRef.current;
                // Look for a parent with scrollable overflow
                while (scrollableParent && scrollableParent !== document.body) {
                    const computedStyle = window.getComputedStyle(scrollableParent);
                    const hasVerticalScroll = computedStyle.overflowY === 'auto' ||
                        computedStyle.overflowY === 'scroll' ||
                        computedStyle.overflow === 'auto' ||
                        computedStyle.overflow === 'scroll';
                    if (hasVerticalScroll && scrollableParent.scrollHeight > scrollableParent.clientHeight) {
                        break;
                    }
                    scrollableParent = scrollableParent.parentElement;
                }
                if (scrollableParent && scrollableParent !== document.body) {
                    scrollableParent.scrollTo({
                        top: scrollPosition,
                        behavior: 'smooth'
                    });
                }
                else {
                    // Use window scroll as fallback
                    window.scrollTo({
                        top: scrollPosition,
                        behavior: 'smooth'
                    });
                }
            }
        };
        // Use a longer delay to ensure the component is fully rendered
        const timeoutId = setTimeout(scrollToMiddleOfDay, 300);
        return () => clearTimeout(timeoutId);
    }, [currentDate]); // Re-run when the date changes (e.g., navigating weeks)
    return (<div ref={scrollContainerRef} data-slot="week-view" className="flex h-full flex-col">
      <div className="bg-background/95 border-border/70 sticky top-0 z-40 grid grid-cols-8 border-b backdrop-blur-md uppercase" style={{ top: '75px' }}>
        <div className="text-muted-foreground/70 py-2 text-center text-xs">
          <span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
        </div>
        {days.map((day, dayIndex) => {
            const dayAllDayEvents = sortEvents(allDayEvents.filter((event) => {
                const eventStart = startOfDay(new Date(event.start));
                const eventEnd = startOfDay(new Date(event.end));
                const dayStart = startOfDay(day);
                const dayEndTime = endOfDay(day);
                // For multi-day/all-day events, check if this day overlaps with the event
                return (isSameDay(dayStart, eventStart) ||
                    isSameDay(dayStart, eventEnd) ||
                    isWithinInterval(dayStart, { start: eventStart, end: eventEnd }) ||
                    isWithinInterval(eventStart, { start: dayStart, end: dayEndTime }));
            }));
            return (<div key={day.toString()} className={`data-today:text-[var(--calendar-accent)] data-today:bg-[var(--calendar-accent-bg)] data-today:rounded data-today:font-semibold text-muted-foreground/70 text-center text-xs transition-colors flex flex-col ${workingDays.includes(day.getDay())
                    ? "bg-[var(--calendar-workday)]"
                    : !workingDays.includes(day.getDay()) &&
                        [0, 6].includes(day.getDay())
                        ? "bg-[var(--calendar-weekend)]"
                        : ""}`} data-today={isToday(day) || undefined}>
              {/* Day header */}
              <div className="py-2">
                {/* Enhanced mobile-first day display */}
                <span className="sm:hidden font-medium" aria-hidden="true">
                  {format(day, "E")[0]} {format(day, "d")}
                </span>
                <span className="max-sm:hidden">{format(day, "EEE dd")}</span>
              </div>
              
              {/* All-day events integrated into day header */}
              {dayAllDayEvents.length > 0 && (<div className="pb-1 px-1 space-y-1">
                  {dayAllDayEvents.map((event) => {
                        const eventStart = new Date(event.start);
                        const eventEnd = new Date(event.end);
                        // Determine the visible segment boundaries within the current week
                        const visibleStart = isBefore(eventStart, startOfDay(weekStart)) ? startOfDay(weekStart) : eventStart;
                        const visibleEnd = isBefore(startOfDay(weekEnd), eventEnd) ? startOfDay(weekEnd) : eventEnd;
                        const isFirstSegmentDay = isSameDay(day, visibleStart);
                        const isLastSegmentDay = isSameDay(day, visibleEnd);
                        // Show title on the first visible day of the segment within this week
                        const shouldShowTitle = isFirstSegmentDay;
                        return (<EventItem key={`spanning-${event.id}`} onClick={(e) => handleEventClick(event, e)} event={event} view="month" isFirstDay={isFirstSegmentDay} isLastDay={isLastSegmentDay} className="text-xs" timezone={timezone}>
                        {/* Show title only on the first visible day in the current week */}
                        <div className={cn("truncate text-xs", !shouldShowTitle && "invisible")} aria-hidden={!shouldShowTitle}>
                          {event.title}
                        </div>
                      </EventItem>);
                    })}
                </div>)}
            </div>);
        })}
      </div>



      <div className="grid flex-1 grid-cols-8 overflow-hidden">
        <div className="border-border/70 border-r grid auto-cols-fr">
          {hours.map((hour, index) => (<div key={hour.toString()} className="border-border/70 relative min-h-[var(--week-cells-height)] border-b last:border-b-0">
              {index > 0 && (<span className="bg-background text-muted-foreground/70 absolute -top-3 left-0 flex h-6 w-16 max-w-full items-center justify-end pe-2 text-[10px] sm:pe-4 sm:text-xs">
                  {format(hour, timeFormat === "24h" ? "HH:mm" : "h a")}
                </span>)}
            </div>))}
        </div>

        {days.map((day, dayIndex) => (<div key={day.toString()} className={`border-border/70 relative border-r last:border-r-0 grid auto-cols-fr ${workingDays.includes(day.getDay())
                ? "bg-[var(--calendar-workday)]"
                : !workingDays.includes(day.getDay()) &&
                    [0, 6].includes(day.getDay())
                    ? "bg-[var(--calendar-weekend)]"
                    : ""}`} data-today={isToday(day) || undefined}>
            {/* Positioned events */}
            {(processedDayEvents[dayIndex] ?? []).map((positionedEvent, index) => (<div key={positionedEvent.events[0]?.id || index} className="absolute z-10 px-[1px] sm:px-1" style={{
                    top: `${positionedEvent.top}px`,
                    height: `${positionedEvent.height}px`,
                    left: `${positionedEvent.left * 100}%`,
                    width: `${positionedEvent.width * 100}%`,
                    zIndex: positionedEvent.zIndex,
                }} onClick={(e) => e.stopPropagation()}>
                <div className="h-full w-full">
                  {positionedEvent.isGrouped ? (
                // Use EventDots for grouped events with same time
                <EventDots events={positionedEvent.events} view="week" onClick={(event) => {
                        const fakeEvent = { stopPropagation: () => { } };
                        handleEventClick(event, fakeEvent);
                    }} showTime timeFormat={timeFormat} timezone={timezone} style={{ height: '100%', width: '100%' }}/>) : (
                // Use regular DraggableEvent for single events
                positionedEvent.events[0] && (() => {
                    const singleEvent = positionedEvent.events[0];
                    return (<DraggableEvent event={singleEvent} view="week" onClick={(e) => handleEventClick(singleEvent, e)} showTime height={positionedEvent.height} timeFormat={timeFormat} timezone={timezone}/>);
                })())}
                </div>
              </div>))}

            {/* Current time indicator - only show for today's column */}
            {currentTimeVisible && isToday(day) && (<div className="pointer-events-none absolute right-0 left-0 z-20" style={{ top: `${currentTimePosition}%` }}>
                <div className="relative flex items-center">
                  <div className="bg-[var(--calendar-accent)] absolute -left-1 h-2 w-2 rounded-full"></div>
                  <div className="bg-[var(--calendar-accent)] h-[2px] w-full"></div>
                </div>
              </div>)}
            {hours.map((hour) => {
                const hourValue = getHours(hour);
                return (<div key={hour.toString()} className="border-border/70 relative min-h-[var(--week-cells-height)] border-b last:border-b-0">
                  {/* Quarter-hour intervals */}
                  {[0, 1, 2, 3].map((quarter) => {
                        const quarterHourTime = hourValue + quarter * 0.25;
                        return (<DroppableCell key={`${hour.toString()}-${quarter}`} id={`week-cell-${day.toISOString()}-${quarterHourTime}`} date={day} time={quarterHourTime} className={cn("absolute h-[calc(var(--week-cells-height)/4)] w-full", quarter === 0 && "top-0", quarter === 1 &&
                                "top-[calc(var(--week-cells-height)/4)]", quarter === 2 &&
                                "top-[calc(var(--week-cells-height)/4*2)]", quarter === 3 &&
                                "top-[calc(var(--week-cells-height)/4*3)]")} onClick={() => {
                                const startTime = new Date(day);
                                startTime.setHours(hourValue);
                                startTime.setMinutes(quarter * 15);
                                onEventCreate(startTime);
                            }}/>);
                    })}
                </div>);
            })}
          </div>))}
      </div>
    </div>);
}
