import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { CalendarEvent } from "./types";
import {
  eventOverlapsRange,
  getAllEventsForDay,
  getEventInterval,
  isMultiDayEvent,
  resolveEventColorValue,
  sortEvents,
} from "./utils";
import { cn } from "../../lib/utils";

interface StickyMiniCalendarNativeProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events?: CalendarEvent[];
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  showDayStrip?: boolean;
  showAllDayEvents?: boolean;
}

export function StickyMiniCalendarNative({
  currentDate,
  onDateSelect,
  events = [],
  weekStartDay = 1,
  showDayStrip = true,
  showAllDayEvents = false,
}: StickyMiniCalendarNativeProps) {
  const [displayMonth, setDisplayMonth] = useState(currentDate);

  React.useEffect(() => {
    setDisplayMonth(currentDate);
  }, [currentDate]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStartDay });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [displayMonth, weekStartDay]);

  const currentWeekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, weekStartDay]);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: weekStartDay }),
    [currentDate, weekStartDay],
  );

  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: weekStartDay }),
    [currentDate, weekStartDay],
  );

  const allDayEvents = useMemo(
    () =>
      events
        .filter((event) => event.allDay || isMultiDayEvent(event))
        .filter((event) => eventOverlapsRange(event, weekStart, weekEnd, "day")),
    [events, weekEnd, weekStart],
  );

  const dayAllDayEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = endOfDay(currentDate);
    return events
      .filter((event) => event.allDay || isMultiDayEvent(event))
      .filter((event) => eventOverlapsRange(event, dayStart, dayEnd, "day"));
  }, [currentDate, events]);

  return (
    <View className="border-b border-border/60 bg-background/95">
      <View className="flex-row items-center justify-between px-3 pt-1">
        <Pressable
          onPress={() => setDisplayMonth(subMonths(displayMonth, 1))}
          className="size-8 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-sm font-bold text-muted-foreground">{"<"}</Text>
        </Pressable>
        <Pressable onPress={() => setDisplayMonth(currentDate)}>
          <Text className="text-[11px] font-semibold text-foreground">
            {format(displayMonth, "MMMM yyyy")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setDisplayMonth(addMonths(displayMonth, 1))}
          className="size-8 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-sm font-bold text-muted-foreground">{">"}</Text>
        </Pressable>
      </View>

      <View className="mb-1 mt-1 flex-row flex-wrap px-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <View key={`weekday-${index}`} className="items-center" style={{ width: "14.2857%" }}>
            <Text className="text-[10px] font-bold uppercase text-muted-foreground/60">
              {format(addDays(startOfWeek(currentDate, { weekStartsOn: weekStartDay }), index), "EEE").slice(0, 1)}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap px-2 pb-0.5">
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentMonth = isSameMonth(day, displayMonth);
          const isCurrentDay = isToday(day);
          const dayEvents = getAllEventsForDay(events, day);

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onDateSelect(day)}
              className="items-center justify-center py-0.5"
              style={{ width: "14.2857%" }}
            >
              <View
                className={cn(
                  "size-7 items-center justify-center rounded-full",
                  isSelected && "bg-primary",
                  isCurrentDay && !isSelected && "ring-2 ring-inset ring-primary/45",
                )}
              >
                <Text
                  className={cn(
                    "text-[10px] font-semibold",
                    isSelected
                      ? "text-primary-foreground"
                      : !isCurrentMonth
                        ? "text-muted-foreground/35"
                        : isCurrentDay
                          ? "text-primary"
                          : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </Text>
              </View>
              <View className="mt-px min-h-[2px] flex-row items-center gap-0.5">
                {dayEvents.slice(0, 3).map((event, index) => (
                  <View
                    key={`${day.toISOString()}-${event.id}-${index}`}
                    className="size-0.5 rounded-full"
                    style={{ backgroundColor: resolveEventColorValue(event.color) }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {showAllDayEvents && dayAllDayEvents.length > 0 ? (
        <View className="px-2 py-1">
          <Text className="mb-0.5 text-[9px] font-medium text-muted-foreground">
            All day
          </Text>
          <View className="gap-1">
            {dayAllDayEvents.map((event) => (
              <Pressable
                key={`all-day-${event.id}`}
                className={cn(
                  "rounded-[10px] border px-2.5 py-2",
                  getChipClassName(event.color),
                )}
                style={{
                  ...(isHexColor(event.color)
                    ? {
                        backgroundColor: `${event.color}22`,
                        borderColor: event.color,
                      }
                    : undefined),
                }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[12px] font-semibold text-foreground"
                >
                  {event.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {showDayStrip ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row border-t border-border/60">
            <View className="w-11 shrink-0" />
            {currentWeekDays.map((day) => {
              const isSelected = isSameDay(day, currentDate);
              const isCurrentDay = isToday(day);
              const dayAllDayEvents = sortEvents(
                allDayEvents.filter((event) =>
                  eventOverlapsRange(event, day, day, "day"),
                ),
              );

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => onDateSelect(day)}
                  className={[
                    "min-w-[56px] flex-1 border-r pb-1",
                    "border-border/60",
                    isSelected ? "bg-primary/10" : "",
                  ].join(" ")}
                >
                  <View className="items-center">
                    <Text
                      className={[
                        "text-[8px] font-medium uppercase leading-none",
                        isSelected ? "text-primary/70" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {format(day, "EEE").slice(0, 3)}
                    </Text>
                    <Text
                      className={[
                        "block text-[10px] font-semibold leading-tight",
                        isSelected || isCurrentDay ? "text-primary" : "text-foreground",
                      ].join(" ")}
                    >
                      {format(day, "d")}
                    </Text>
                    <View
                      className={[
                        "mt-1 h-0.5 rounded-full",
                        isCurrentDay ? "w-5 bg-primary" : "w-0 bg-transparent",
                      ].join(" ")}
                    />
                  </View>

                  {dayAllDayEvents.length > 0 ? (
                    <View className="mt-0 space-y-0.5 px-0.5">
                      {dayAllDayEvents.slice(0, 2).map((event) => {
                        const { start: eventStart, end: eventEnd } =
                          getEventInterval(event, "day");
                        const visibleStart = isBefore(eventStart, startOfDay(weekStart))
                          ? startOfDay(weekStart)
                          : eventStart;
                        const visibleEnd = isBefore(endOfDay(weekEnd), eventEnd)
                          ? endOfDay(weekEnd)
                          : eventEnd;
                        const shouldShowTitle = isSameDay(day, visibleStart);
                        const isFirstSegment = isSameDay(day, visibleStart);
                        const isLastSegment = isSameDay(day, visibleEnd);

                        return (
                          <View
                            key={`span-${event.id}-${day.toISOString()}`}
                            className={cn(
                              "h-[14px] justify-center overflow-hidden px-0.5",
                              getChipClassName(event.color),
                            )}
                            style={{
                              ...(isHexColor(event.color)
                                ? {
                                    backgroundColor: `${event.color}22`,
                                    borderColor: event.color,
                                    borderWidth: 1,
                                  }
                                : undefined),
                              borderTopLeftRadius: isFirstSegment ? 6 : 2,
                              borderBottomLeftRadius: isFirstSegment ? 6 : 2,
                              borderTopRightRadius: isLastSegment ? 6 : 2,
                              borderBottomRightRadius: isLastSegment ? 6 : 2,
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              className={[
                                "px-0.5 text-[8px] font-medium text-foreground",
                                shouldShowTitle ? "" : "text-transparent",
                              ].join(" ")}
                            >
                              {event.title}
                            </Text>
                          </View>
                        );
                      })}
                      {dayAllDayEvents.length > 2 ? (
                        <Text className="px-1 text-[7px] text-muted-foreground">
                          +{dayAllDayEvents.length - 2}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function isHexColor(color?: string | null): boolean {
  return !!color && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function getChipClassName(color?: string | null) {
  if (!color) return "border-border bg-muted/40 rounded-[6px]";
  if (isHexColor(color)) return "rounded-[6px]";

  const value = color.toLowerCase();
  if (value === "sky" || value === "blue") return "rounded-[6px] border-event-sky/70 bg-event-sky/25";
  if (value === "violet" || value === "purple") {
    return "rounded-[6px] border-event-violet/70 bg-event-violet/25";
  }
  if (value === "orange") return "rounded-[6px] border-event-orange/70 bg-event-orange/25";
  if (value === "rose") return "rounded-[6px] border-event-rose/70 bg-event-rose/25";
  if (value === "emerald" || value === "green") {
    return "rounded-[6px] border-event-emerald/70 bg-event-emerald/25";
  }

  return "rounded-[6px] border-border bg-muted/40";
}
