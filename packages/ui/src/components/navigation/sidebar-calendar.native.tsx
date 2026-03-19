import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Pressable, Text, View } from "react-native";

import { cn } from "../../lib/utils";
import type { CalendarEvent } from "../calendar/types";
import { getAllEventsForDay, resolveEventColorValue } from "../calendar/utils";

interface SidebarCalendarProps {
  events?: CalendarEvent[];
  onDisplayMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  className?: string;
  isMobile?: boolean;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function SidebarCalendar({
  events = [],
  onDisplayMonthChange,
  className,
  isMobile = false,
  currentDate,
  onCurrentDateChange,
  weekStartDay = 1,
}: SidebarCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate ?? new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(currentDate ?? new Date());

  useEffect(() => {
    if (!currentDate || Number.isNaN(currentDate.getTime())) return;
    setSelectedDate(currentDate);
    setCalendarMonth(currentDate);
  }, [currentDate]);

  useEffect(() => {
    const monthStart = startOfWeek(startOfMonth(calendarMonth), {
      weekStartsOn: weekStartDay,
    });
    const monthEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: weekStartDay });
    onDisplayMonthChange?.({ start: monthStart, end: monthEnd });
  }, [calendarMonth, onDisplayMonthChange, weekStartDay]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStartDay });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMonth, weekStartDay]);

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const handleDateSelect = (day: Date) => {
    setSelectedDate(day);
    onCurrentDateChange?.(day);
  };

  return (
    <View className={cn("w-full", className)}>
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Pressable
          onPress={() => setCalendarMonth(subMonths(calendarMonth, 1))}
          className="min-h-11 min-w-11 items-center justify-center rounded-full p-2"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text className="text-xl font-semibold text-muted-foreground">‹</Text>
        </Pressable>
        <Pressable
          onPress={() => setCalendarMonth(selectedDate)}
          className="min-h-11 justify-center px-2"
          accessibilityRole="button"
          accessibilityLabel="Jump to current month"
        >
          <Text className="text-[15px] font-bold tracking-tight text-foreground">
            {format(calendarMonth, "MMMM yyyy")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))}
          className="min-h-11 min-w-11 items-center justify-center rounded-full p-2"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text className="text-xl font-semibold text-muted-foreground">›</Text>
        </Pressable>
      </View>

      <View className="mb-2 flex-row flex-wrap px-1">
        {weekdayLabels.map((label, index) => (
          <View
            key={`${label}-${index}`}
            className="aspect-square items-center justify-center"
            style={{ width: "14.2857%" }}
          >
            <Text className="text-[11px] font-black uppercase text-muted-foreground/50">{label}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap px-1">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, calendarMonth);
          const isCurrentDay = isToday(day);
          const dayEvents = getAllEventsForDay(events, day);

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => handleDateSelect(day)}
              className={cn(
                "relative items-center justify-center transition-transform",
                isMobile
                  ? "aspect-square flex-col gap-1 rounded-[12px] text-[14px] active:scale-90"
                  : "mx-auto h-8 w-8 rounded-lg text-[13px] font-medium",
                !isCurrentMonth && "text-muted-foreground/30",
                isCurrentMonth && !isSelected && !isCurrentDay && "text-foreground",
                isCurrentDay && !isSelected && "font-bold text-foreground",
              )}
              style={{ width: "14.2857%" }}
            >
              {isSelected ? (
                <View
                  className={cn(
                    "absolute inset-0.5 rounded-md bg-primary shadow-sm",
                    isMobile && "inset-0 rounded-[12px]",
                  )}
                />
              ) : null}

              <Text className={cn("relative z-10", isSelected ? "text-primary-foreground" : "text-inherit")}>
                {format(day, "d")}
              </Text>

              {dayEvents.length > 0 ? (
                <View
                  className={cn(
                    "z-10 flex-row items-center justify-center",
                    isMobile ? "mt-[-2px] gap-0.5" : "absolute bottom-[6px] w-full gap-[2px]",
                  )}
                >
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <View
                      key={`${event.id || "event"}-${i}`}
                      className={cn("h-1 w-1 rounded-full", isSelected && "bg-primary-foreground")}
                      style={
                        isSelected
                          ? undefined
                          : {
                              backgroundColor: resolveEventColorValue(event.color),
                            }
                      }
                    />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
