import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";

import type { CalendarEvent, CalendarView } from "./types";
import { AgendaDaysToShow } from "./constants";
import { eventOverlapsRange } from "./utils";
import { MobileDayViewNative } from "./mobile-day-view.native";
import { MobileAgendaViewNative } from "./mobile-agenda-view.native";
import { MobileMonthViewNative } from "./mobile-month-view.native";
import { MobileWeekViewNative } from "./mobile-week-view.native";
import { cn } from "../../lib/utils";
import { type SharedMobileEventCalendarProps } from "./mobile-calendar-shared";

export interface MobileEventCalendarProps extends SharedMobileEventCalendarProps {
  events?: CalendarEvent[];
  error?: { message?: string } | null;
}

const views: CalendarView[] = ["month", "week", "day", "agenda"];

export function MobileEventCalendar({
  initialView = "day",
  view: controlledView,
  onViewChange,
  currentDate: controlledCurrentDate,
  onCurrentDateChange,
  events = [],
  loading = false,
  error = null,
  onDateRangeChange,
  onCreateEvent,
  onEventEdit,
  defaultCalendarId = null,
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  defaultEventDuration = 60,
  timeFormat = "24h",
  timezone,
  showHeader = true,
  showViewSwitch = true,
  showCreateButton = true,
  contentInsetBottom = 88,
}: MobileEventCalendarProps) {
  const [uncontrolledView, setUncontrolledView] = useState<CalendarView>(initialView);
  const [uncontrolledCurrentDate, setUncontrolledCurrentDate] = useState(new Date());
  const [creating, setCreating] = useState(false);

  const view = controlledView ?? uncontrolledView;
  const currentDate = controlledCurrentDate ?? uncontrolledCurrentDate;

  const setView = React.useCallback(
    (nextView: CalendarView) => {
      if (controlledView === undefined) {
        setUncontrolledView(nextView);
      }
      onViewChange?.(nextView);
    },
    [controlledView, onViewChange],
  );

  const setCurrentDate = React.useCallback(
    (nextDate: Date) => {
      if (controlledCurrentDate === undefined) {
        setUncontrolledCurrentDate(nextDate);
      }
      onCurrentDateChange?.(nextDate);
    },
    [controlledCurrentDate, onCurrentDateChange],
  );

  const dateRange = useMemo(() => {
    if (view === "month") {
      return {
        start: startOfWeek(startOfMonth(currentDate), {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
        end: endOfWeek(endOfMonth(currentDate), {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
      };
    }

    if (view === "week") {
      return {
        start: startOfWeek(currentDate, {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
        end: endOfWeek(currentDate, {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
      };
    }

    if (view === "agenda") {
      return {
        start: startOfDay(currentDate),
        end: endOfDaySafe(addDays(currentDate, AgendaDaysToShow - 1)),
      };
    }

    return {
      start: startOfDay(currentDate),
      end: endOfDaySafe(currentDate),
    };
  }, [currentDate, view, weekStartDay]);

  React.useEffect(() => {
    onDateRangeChange?.(dateRange);
  }, [dateRange, onDateRangeChange]);

  const rangeEvents = useMemo(
    () =>
      events
        .filter((event) => eventOverlapsRange(event, dateRange.start, dateRange.end))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events, dateRange],
  );

  const daysForWeekStrip = useMemo(() => {
    if (view !== "week") return [];
    const start = startOfWeek(currentDate, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });

    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [currentDate, view, weekStartDay]);

  const headerTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");

    if (view === "week") {
      const start = daysForWeekStrip[0] || currentDate;
      const end = daysForWeekStrip[daysForWeekStrip.length - 1] || currentDate;
      return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
    }

    if (view === "agenda") {
      return `${format(currentDate, "MMM d")} onward`;
    }

    return format(currentDate, "EEEE, MMM d");
  }, [currentDate, view, daysForWeekStrip]);

  const navigate = (direction: -1 | 1) => {
    if (view === "month") {
      setCurrentDate(direction < 0 ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
      return;
    }

    if (view === "week") {
      setCurrentDate(direction < 0 ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
      return;
    }

    setCurrentDate(addDays(currentDate, direction * (view === "agenda" ? AgendaDaysToShow : 1)));
  };

  const handleQuickCreate = async () => {
    const start = new Date(currentDate);
    start.setHours(9, 0, 0, 0);
    handleEventCreate(start);
  };

  const handleEventSelect = React.useCallback(
    (event: CalendarEvent) => {
      onEventEdit?.(event, { mode: "modal" });
    },
    [onEventEdit],
  );

  const handleEventCreate = React.useCallback(
    (startTime: Date) => {
      const normalizedStart = new Date(startTime);
      normalizedStart.setSeconds(0, 0);
      setCurrentDate(normalizedStart);

      if (onEventEdit) {
        const newEvent: CalendarEvent = {
          id: undefined as unknown as string,
          title: "",
          start: normalizedStart,
          end: new Date(normalizedStart.getTime() + defaultEventDuration * 60 * 1000),
          allDay: false,
          calendarId: defaultCalendarId ?? "",
          userId: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          timezone: timezone ?? null,
        };
        onEventEdit(newEvent, { mode: "modal" });
        return;
      }

      if (!onCreateEvent || !defaultCalendarId || creating) return;

      const end = new Date(normalizedStart.getTime() + defaultEventDuration * 60 * 1000);

      setCreating(true);
      void onCreateEvent({
        title: "New event",
        start: normalizedStart.toISOString(),
        end: end.toISOString(),
        allDay: false,
        calendarId: defaultCalendarId,
      }).finally(() => {
        setCreating(false);
      });
    },
    [
      creating,
      defaultCalendarId,
      defaultEventDuration,
      onCreateEvent,
      onEventEdit,
      setCurrentDate,
      timezone,
    ],
  );

  return (
    <View className="flex-1 bg-background">
      {showHeader ? (
        <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
          <Pressable
            onPress={() => navigate(-1)}
            className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card"
            accessibilityRole="button"
            accessibilityLabel="Previous"
          >
            <Text className="text-lg font-bold text-foreground">{"<"}</Text>
          </Pressable>

          <Text className="text-base font-bold text-foreground">{headerTitle}</Text>

          <Pressable
            onPress={() => navigate(1)}
            className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card"
            accessibilityRole="button"
            accessibilityLabel="Next"
          >
            <Text className="text-lg font-bold text-foreground">{">"}</Text>
          </Pressable>
        </View>
      ) : null}

      {showViewSwitch ? (
        <View className="mx-4 mb-2 flex-row rounded-xl border border-border bg-muted/35 p-1">
          {views.map((item) => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-lg",
                view === item ? "bg-primary" : "bg-transparent",
              )}
            >
              <Text
                className={cn(
                  "text-xs font-semibold uppercase",
                  view === item ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showViewSwitch && view === "week" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        >
          <View className="flex-row gap-2">
            {daysForWeekStrip.map((day) => {
              const selected = isSameDay(day, currentDate);
              const count = rangeEvents.filter((event) =>
                eventOverlapsRange(event, startOfDay(day), endOfDaySafe(day), "day"),
              ).length;

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => setCurrentDate(day)}
                  className={cn(
                    "min-h-11 w-[68px] items-center justify-center rounded-xl border px-2 py-1",
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-muted/35",
                  )}
                >
                  <Text
                    className={cn(
                      "text-[10px] font-semibold uppercase",
                      selected ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {format(day, "EEE")}
                  </Text>
                  <Text
                    className={cn(
                      "text-base font-bold",
                      selected ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </Text>
                  <Text
                    className={cn(
                      "text-[10px] font-medium",
                      selected ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <View className="flex-1">
        {view === "month" ? (
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: contentInsetBottom }}>
            <MobileMonthViewNative
              currentDate={currentDate}
              selectedDate={currentDate}
              events={rangeEvents}
              weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
              onSelectDate={setCurrentDate}
            />
          </ScrollView>
        ) : null}

        {view === "day" ? (
          <MobileDayViewNative
            currentDate={currentDate}
            events={rangeEvents}
            onEventSelect={handleEventSelect}
            onEventCreate={handleEventCreate}
            timezone={timezone}
            workingDays={workingDays}
            timeFormat={timeFormat}
          />
        ) : null}

        {view === "week" ? (
          <MobileWeekViewNative
            currentDate={currentDate}
            events={rangeEvents}
            onEventSelect={handleEventSelect}
            onEventCreate={handleEventCreate}
            weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
            timezone={timezone}
            workingDays={workingDays}
            timeFormat={timeFormat}
          />
        ) : null}

        {view === "agenda" ? (
          <MobileAgendaViewNative
            currentDate={currentDate}
            events={rangeEvents}
            onEventSelect={handleEventSelect}
            timeFormat={timeFormat}
            timezone={timezone}
          />
        ) : null}
      </View>

      {loading ? (
        <View className="absolute right-3 top-3 flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
          <ActivityIndicator size="small" />
          <Text className="text-xs text-muted-foreground">Loading events...</Text>
        </View>
      ) : null}

      {!!error?.message ? <Text className="px-3 pb-2 text-xs text-destructive">{error.message}</Text> : null}

      {showCreateButton ? (
        <Pressable
          className="absolute bottom-4 right-4 h-14 w-14 items-center justify-center rounded-full bg-primary"
          onPress={() => void handleQuickCreate()}
          accessibilityRole="button"
          accessibilityLabel="Add event"
        >
          <Text className="mt-[-2px] text-3xl font-semibold text-primary-foreground">
            {creating ? "..." : "+"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function endOfDaySafe(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}
