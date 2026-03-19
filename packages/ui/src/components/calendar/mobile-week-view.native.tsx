import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  addHours,
  areIntervalsOverlapping,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "./types";
import { eventOverlapsRange, isMultiDayEvent } from "./utils";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";

const MOBILE_START_HOUR = 0;
const MOBILE_END_HOUR = 23;
const MOBILE_CELL_HEIGHT = 52;

const EVENT_BG_CLASSES: Record<string, string> = {
  blue: "bg-event-sky/35 border-event-sky/70",
  sky: "bg-event-sky/35 border-event-sky/70",
  violet: "bg-event-violet/35 border-event-violet/70",
  purple: "bg-event-violet/35 border-event-violet/70",
  orange: "bg-event-orange/35 border-event-orange/70",
  rose: "bg-event-rose/35 border-event-rose/70",
  emerald: "bg-event-emerald/35 border-event-emerald/70",
  green: "bg-event-emerald/35 border-event-emerald/70",
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

interface MobileWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function MobileWeekViewNative({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
}: MobileWeekViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, weekStartDay]);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MOBILE_START_HOUR),
      end: addHours(dayStart, MOBILE_END_HOUR),
    });
  }, [currentDate]);

  const dayEvents = useMemo(
    () =>
      days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = addHours(dayStart, 24);
        return events
          .filter((event) => {
            if (event.allDay || isMultiDayEvent(event)) return false;
            return eventOverlapsRange(event, dayStart, dayEnd, "time");
          })
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      }),
    [days, events],
  );

  const positionedEvents = useMemo(
    () =>
      days.map((day, dayIndex) => {
        const result: PositionedEvent[] = [];
        const dayStart = startOfDay(day);
        const columns: { event: CalendarEvent; start: Date; end: Date }[][] = [];
        const eventColumnMap = new Map<CalendarEvent, number>();

        for (const event of dayEvents[dayIndex] ?? []) {
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
          const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);

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

        for (const event of dayEvents[dayIndex] ?? []) {
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
          const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);
          const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
          const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
          const top = startHour * MOBILE_CELL_HEIGHT;
          const height = Math.max((endHour - startHour) * MOBILE_CELL_HEIGHT, 44);
          const overlaps =
            (dayEvents[dayIndex] ?? []).filter((other) => {
              if (other.id === event.id) return false;
              return areIntervalsOverlapping(
                { start: adjustedStart, end: adjustedEnd },
                { start: new Date(other.start), end: new Date(other.end) },
              );
            }).length + 1;
          const columnIndex = eventColumnMap.get(event) ?? 0;
          const columnsForLayout = Math.max(overlaps, columnIndex + 1);
          const gap = 0.02;
          const width =
            columnsForLayout === 1
              ? 0.96
              : Math.max(0.18, (1 - gap * (columnsForLayout + 1)) / columnsForLayout);
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
      }),
    [dayEvents, days],
  );

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
    timezone,
  );

  useEffect(() => {
    if (hasScrolledRef.current) return;

    const now = new Date();
    const targetHour = isToday(currentDate)
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
    <View className="flex-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
        <View>
          <View className="flex-row border-b border-border/70 bg-background/95">
            <View className="w-[52px]" />
            {days.map((day) => (
              <View
                key={day.toISOString()}
                className={cn(
                  "w-[92px] items-center justify-center border-l border-border/60 py-2",
                  workingDays.includes(day.getDay()) ? "bg-background" : "bg-muted/20",
                  isToday(day) && "bg-primary/10",
                )}
              >
                <Text
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80",
                    isToday(day) && "text-primary",
                  )}
                >
                  {format(day, "EEE")}
                </Text>
                <Text
                  className={cn(
                    "mt-0.5 text-base font-bold text-foreground",
                    isToday(day) && "text-primary",
                  )}
                >
                  {format(day, "d")}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <View className="flex-row">
              <View className="w-[52px] border-r border-border/70 bg-background">
                {hours.map((hour) => (
                  <View key={hour.toISOString()} className="h-[52px] items-end justify-start pr-2">
                    <Text className="mt-[-6px] bg-background px-0.5 text-[10px] font-medium text-muted-foreground/80">
                      {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
                    </Text>
                  </View>
                ))}
              </View>

              {days.map((day, dayIndex) => (
                <View
                  key={day.toISOString()}
                  className={cn(
                    "relative w-[92px] border-r border-border/70 bg-card",
                    isToday(day) && "bg-primary/5",
                  )}
                >
                  {(positionedEvents[dayIndex] ?? []).map((positionedEvent) => (
                    <Pressable
                      key={positionedEvent.event.id}
                      onPress={() => onEventSelect(positionedEvent.event)}
                      className={cn(
                        "absolute min-h-11 overflow-hidden rounded-lg border px-1.5 py-1",
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
                        className={cn(
                          "text-[10px] font-bold",
                          getEventTextClass(positionedEvent.event.color),
                        )}
                        numberOfLines={1}
                      >
                        {positionedEvent.event.title}
                      </Text>
                      <Text
                        className={cn(
                          "mt-0.5 text-[9px] font-medium",
                          getEventTextClass(positionedEvent.event.color),
                        )}
                        numberOfLines={1}
                      >
                        {format(
                          new Date(positionedEvent.event.start),
                          timeFormat === "24h" ? "HH:mm" : "h:mm a",
                        )}
                      </Text>
                    </Pressable>
                  ))}

                  {currentTimeVisible && isToday(day) ? (
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
                      <View key={hour.toISOString()} className="relative h-[52px] border-b border-border/60">
                        {[0, 1, 2, 3].map((quarter) => (
                          <Pressable
                            key={`${hour.toISOString()}-${quarter}`}
                            className="absolute left-0 right-0"
                            style={{
                              top: quarter * (MOBILE_CELL_HEIGHT / 4),
                              height: MOBILE_CELL_HEIGHT / 4,
                            }}
                            hitSlop={16}
                            onPress={() => {
                              const startTime = new Date(day);
                              startTime.setHours(hourValue, quarter * 15, 0, 0);
                              onEventCreate(startTime);
                            }}
                          />
                        ))}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function getEventBackgroundClass(color?: string | null) {
  if (!color) return "bg-event-default/35 border-event-default/70";
  return EVENT_BG_CLASSES[color.toLowerCase()] ?? "bg-event-default/35 border-event-default/70";
}

function getEventTextClass(color?: string | null) {
  if (!color) return "text-event-default-foreground";
  return EVENT_TEXT_CLASSES[color.toLowerCase()] ?? "text-event-default-foreground";
}
