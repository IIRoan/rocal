import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachHourOfInterval,
  format,
  getHours,
  getMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";
import type { CalendarEvent } from "./types";
import { eventOverlapsRange, isMultiDayEvent } from "./utils";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";

const MOBILE_START_HOUR = 0;
const MOBILE_END_HOUR = 23;
const MOBILE_CELL_HEIGHT = 60;

const EVENT_BG_CLASSES: Record<string, string> = {
  blue: "bg-event-sky/35 border-event-sky/70 dark:bg-event-sky/45 dark:border-event-sky/80",
  sky: "bg-event-sky/35 border-event-sky/70 dark:bg-event-sky/45 dark:border-event-sky/80",
  violet:
    "bg-event-violet/35 border-event-violet/70 dark:bg-event-violet/45 dark:border-event-violet/80",
  purple:
    "bg-event-violet/35 border-event-violet/70 dark:bg-event-violet/45 dark:border-event-violet/80",
  orange:
    "bg-event-orange/35 border-event-orange/70 dark:bg-event-orange/45 dark:border-event-orange/80",
  rose: "bg-event-rose/35 border-event-rose/70 dark:bg-event-rose/45 dark:border-event-rose/80",
  emerald:
    "bg-event-emerald/35 border-event-emerald/70 dark:bg-event-emerald/45 dark:border-event-emerald/80",
  green:
    "bg-event-emerald/35 border-event-emerald/70 dark:bg-event-emerald/45 dark:border-event-emerald/80",
};

const EVENT_TEXT_CLASSES: Record<string, string> = {
  blue: "text-event-sky-foreground",
  sky: "text-event-sky-foreground",
  violet: "text-event-violet-foreground",
  purple: "text-event-violet-foreground",
  orange: "text-event-orange-foreground",
  rose: "text-event-rose-foreground",
  emerald: "text-event-emerald-foreground",
  green: "text-event-emerald-foreground",
};

interface MobileDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  workingDays?: number[];
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function MobileDayViewNative({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  timezone,
  workingDays = [1, 2, 3, 4, 5],
}: MobileDayViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MOBILE_START_HOUR),
      end: addHours(dayStart, MOBILE_END_HOUR),
    });
  }, [currentDate]);

  const allDayEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = addHours(dayStart, 24);

    return events.filter(
      (event) =>
        (event.allDay || isMultiDayEvent(event)) &&
        eventOverlapsRange(event, dayStart, dayEnd, "day"),
    );
  }, [events, currentDate]);

  const timeEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = addHours(dayStart, 24);

    return events
      .filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;
        return eventOverlapsRange(event, dayStart, dayEnd, "time");
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [currentDate, events]);

  const positionedEvents = useMemo(() => {
    const result: PositionedEvent[] = [];
    const dayStart = startOfDay(currentDate);
    const sortedEvents = [...timeEvents].sort((a, b) => {
      const aStart = new Date(a.start);
      const bStart = new Date(b.start);
      const aEnd = new Date(a.end);
      const bEnd = new Date(b.end);

      if (aStart < bStart) return -1;
      if (aStart > bStart) return 1;

      return differenceInMinutes(bEnd, bStart) - differenceInMinutes(aEnd, aStart);
    });

    const columns: { event: CalendarEvent; start: Date; end: Date }[][] = [];
    const eventColumnMap = new Map<CalendarEvent, number>();

    for (const event of sortedEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const adjustedStart = isSameDay(currentDate, eventStart) ? eventStart : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd) ? eventEnd : addHours(dayStart, 24);

      let columnIndex = 0;
      let placed = false;

      while (!placed) {
        const column = columns[columnIndex] || [];
        if (
          column.every((item) =>
            !areIntervalsOverlapping(
              { start: adjustedStart, end: adjustedEnd },
              { start: item.start, end: item.end },
            ),
          )
        ) {
          columns[columnIndex] = column;
          column.push({ event, start: adjustedStart, end: adjustedEnd });
          eventColumnMap.set(event, columnIndex);
          placed = true;
        } else {
          columnIndex += 1;
        }
      }
    }

    for (const event of sortedEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const adjustedStart = isSameDay(currentDate, eventStart) ? eventStart : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd) ? eventEnd : addHours(dayStart, 24);
      const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
      const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
      const top = startHour * MOBILE_CELL_HEIGHT;
      const height = Math.max((endHour - startHour) * MOBILE_CELL_HEIGHT, 44);
      const overlaps =
        sortedEvents.filter((other) => {
          if (other.id === event.id) return false;
          return areIntervalsOverlapping(
            { start: adjustedStart, end: adjustedEnd },
            { start: new Date(other.start), end: new Date(other.end) },
          );
        }).length + 1;

      const columnIndex = eventColumnMap.get(event) ?? 0;
      const columnsForLayout = Math.max(overlaps, columnIndex + 1);
      const gap = columnsForLayout === 1 ? 0.02 : 0.015;
      const width =
        columnsForLayout === 1
          ? 0.96
          : Math.max(0.2, (1 - gap * (columnsForLayout + 1)) / columnsForLayout);
      const left = gap + columnIndex * (width + gap);

      result.push({
        event,
        top,
        height,
        left,
        width,
        zIndex: 10 + columnIndex,
      });
    }

    return result;
  }, [currentDate, timeEvents]);

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "day",
    timezone,
  );

  useEffect(() => {
    if (hasScrolledRef.current) return;

    const now = new Date();
    const targetHour = isSameDay(currentDate, now)
      ? now.getHours() + now.getMinutes() / 60
      : 9;

    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetHour * MOBILE_CELL_HEIGHT - 160),
        animated: true,
      });
      hasScrolledRef.current = true;
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [currentDate]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  return (
    <View className="flex-1 bg-background dark:bg-background">
      {!workingDays.includes(currentDate.getDay()) ? (
        <View className="border-y border-border/70 bg-muted/30 px-3 py-2 dark:bg-muted/20">
          <Text className="text-xs font-bold text-muted-foreground">Non-working day</Text>
        </View>
      ) : null}

      {allDayEvents.length > 0 ? (
        <View className="border-y border-border/70 bg-muted/35 px-3 py-2 dark:bg-muted/20">
          <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            All day
          </Text>
          <View className="mt-1 gap-1.5">
            {allDayEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => onEventSelect(event)}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 py-2",
                  getEventBackgroundClass(event.color),
                )}
                accessibilityRole="button"
              >
                <Text
                  className={cn("text-xs font-semibold", getEventTextClass(event.color))}
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View className="flex-row">
          <View className="w-[52px] border-r border-border/70 bg-background dark:bg-background">
            {hours.map((hour) => (
              <View key={hour.toISOString()} className="h-[60px] items-end justify-start pr-2">
                <Text className="mt-[-6px] bg-background px-0.5 text-[10px] font-medium text-muted-foreground/80 dark:bg-background">
                  {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
                </Text>
              </View>
            ))}
          </View>

          <View className="relative flex-1 bg-card dark:bg-card">
            {positionedEvents.map((positionedEvent) => (
              <Pressable
                key={positionedEvent.event.id}
                onPress={() => onEventSelect(positionedEvent.event)}
                className={cn(
                  "absolute min-h-11 overflow-hidden rounded-lg border px-2 py-1.5",
                  getEventBackgroundClass(positionedEvent.event.color),
                )}
                style={{
                  top: positionedEvent.top,
                  height: positionedEvent.height,
                  left: `${positionedEvent.left * 100}%`,
                  width: `${positionedEvent.width * 100}%`,
                  zIndex: positionedEvent.zIndex,
                }}
                accessibilityRole="button"
              >
                <Text
                  className={cn("text-[11px] font-bold", getEventTextClass(positionedEvent.event.color))}
                  numberOfLines={1}
                >
                  {positionedEvent.event.title}
                </Text>
                <Text
                  className={cn(
                    "mt-0.5 text-[10px] font-medium",
                    getEventTextClass(positionedEvent.event.color),
                  )}
                  numberOfLines={1}
                >
                  {format(new Date(positionedEvent.event.start), timeFormat === "24h" ? "HH:mm" : "h:mm a")}
                </Text>
              </Pressable>
            ))}

            {currentTimeVisible ? (
              <View
                pointerEvents="none"
                className="absolute left-0 right-0 z-30 flex-row items-center"
                style={{ top: `${currentTimePosition}%` }}
              >
                <View className="-ml-1 size-2 rounded-full bg-destructive" />
                <View className="h-0.5 flex-1 bg-destructive" />
              </View>
            ) : null}

            {hours.map((hour) => {
              const hourValue = getHours(hour);
              return (
                <View key={hour.toISOString()} className="relative h-[60px] border-b border-border/60 dark:border-border/50">
                  {[0, 1, 2, 3].map((quarter) => (
                    <Pressable
                      key={`${hour.toISOString()}-${quarter}`}
                      className="absolute left-0 right-0"
                      style={{ top: quarter * (MOBILE_CELL_HEIGHT / 4), height: MOBILE_CELL_HEIGHT / 4 }}
                      hitSlop={16}
                      onPress={() => {
                        const startTime = new Date(currentDate);
                        startTime.setHours(hourValue, quarter * 15, 0, 0);
                        onEventCreate(startTime);
                      }}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function getEventBackgroundClass(color?: string | null) {
  if (!color) return "bg-event-default/35 border-event-default/70 dark:bg-event-default/45 dark:border-event-default/80";
  return (
    EVENT_BG_CLASSES[color.toLowerCase()] ??
    "bg-event-default/35 border-event-default/70 dark:bg-event-default/45 dark:border-event-default/80"
  );
}

function getEventTextClass(color?: string | null) {
  if (!color) return "text-event-default-foreground";
  return EVENT_TEXT_CLASSES[color.toLowerCase()] ?? "text-event-default-foreground";
}
