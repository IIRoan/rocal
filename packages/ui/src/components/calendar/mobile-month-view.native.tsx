import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { cn } from "../../lib/utils";
import type { CalendarEvent } from "./types";
import { getAllEventsForDay } from "./utils";

interface MobileMonthViewNativeProps {
  currentDate: Date;
  selectedDate?: Date;
  events: CalendarEvent[];
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onSelectDate: (date: Date) => void;
}

const EVENT_DOT_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-event-sky",
  sky: "bg-event-sky",
  violet: "bg-event-violet",
  purple: "bg-event-violet",
  orange: "bg-event-orange",
  rose: "bg-event-rose",
  emerald: "bg-event-emerald",
  green: "bg-event-emerald",
};

export function MobileMonthViewNative({
  currentDate,
  selectedDate,
  events,
  weekStartDay = 1,
  onSelectDate,
}: MobileMonthViewNativeProps) {
  const activeDate = selectedDate ?? currentDate;

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: weekStartDay });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: weekStartDay });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate, weekStartDay]);

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, index) =>
        format(
          addDays(startOfWeek(new Date(), { weekStartsOn: weekStartDay }), index),
          "EEE",
        ),
      ),
    [weekStartDay],
  );

  return (
    <View className="flex-1 px-4 pb-4 pt-2">
      <View className="mb-1 flex-row">
        {weekdays.map((weekday) => (
          <View
            key={weekday}
            className="items-center justify-center py-2"
            style={{ width: "14.2857%" }}
          >
            <Text className="text-xs text-muted-foreground/70">{weekday}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {days.map((day) => {
          const isSelected = isSameDay(day, activeDate);
          const isCurrentDay = isToday(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const dayEvents = getAllEventsForDay(events, day);

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onSelectDate(day)}
              className={cn(
                "mb-1 min-h-11 items-center rounded-xl px-1 py-1.5 active:scale-95",
                !isCurrentMonth && "opacity-55",
              )}
              style={{ width: "14.2857%" }}
            >
              <View
                className={cn(
                  "size-8 items-center justify-center rounded-md",
                  isSelected && "bg-primary",
                  isCurrentDay && "ring-2 ring-inset",
                  isCurrentDay && (isSelected ? "ring-primary-foreground/70" : "ring-primary"),
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-semibold",
                    isSelected
                      ? "text-primary-foreground"
                      : isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/70",
                  )}
                >
                  {format(day, "d")}
                </Text>
              </View>

              <View className="mt-1 min-h-1.5 flex-row items-center justify-center gap-1">
                {dayEvents.slice(0, 3).map((event, index) => {
                  const dotColorClass = getEventDotColorClass(event.color);
                  const dotStyle =
                    !dotColorClass && isHexColor(event.color)
                      ? { backgroundColor: event.color }
                      : undefined;

                  return (
                    <View
                      key={`${day.toISOString()}-${event.id}-${index}`}
                      className={cn(
                        "size-1.5 rounded-full",
                        isSelected
                          ? "bg-primary-foreground/80"
                          : (dotColorClass ?? "bg-event-default"),
                      )}
                      style={isSelected ? undefined : dotStyle}
                    />
                  );
                })}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function getEventDotColorClass(color?: string | null) {
  if (!color) return "bg-event-default";
  if (isHexColor(color)) return undefined;
  return EVENT_DOT_COLOR_CLASSES[color.toLowerCase()] ?? "bg-event-default";
}

function isHexColor(color?: string | null) {
  if (!color) return false;
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}
