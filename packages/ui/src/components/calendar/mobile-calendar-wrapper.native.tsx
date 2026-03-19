import React from "react";
import { Pressable, Text, View } from "react-native";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { calendarApiService, type UserSettings } from "@workspace/calendar-client";

import { MobileEventCalendar } from "./mobile-event-calendar.native";
import { StickyMiniCalendarNative } from "./sticky-mini-calendar.native";
import { useSharedCalendarData } from "./calendar-data-provider";
import { MobileSidebarDrawer } from "../layout/mobile-sidebar-drawer.native";
import type { CalendarView } from "./types";
import {
  nextMobileCalendarView,
  parseWorkingDays,
  sharedMobileViewLabels,
  type SharedMobileCalendarWrapperProps,
} from "./mobile-calendar-shared";
import { cn } from "../../lib/utils";

type MobileCalendarWrapperProps = SharedMobileCalendarWrapperProps;

const defaultSettings: Pick<UserSettings, "defaultView" | "weekStartDay" | "timezone" | "workingDays"> = {
  defaultView: "day",
  weekStartDay: 1,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  workingDays: "[1,2,3,4,5]",
};

const VIEW_OPTIONS: CalendarView[] = ["month", "week", "day", "agenda"];

export function MobileCalendarWrapper({
  user,
  initialView = "day",
  defaultCalendarId,
  weekStartDay = 1,
  onOpenCalendarManagement,
  onOpenAddEvent,
  onOpenSettings,
  onCreateEvent,
  onDateRangeChange,
  events,
  error,
  loading,
  workingDays,
  timezone,
}: MobileCalendarWrapperProps) {
  const calendarData = useSharedCalendarData();
  const [view, setView] = React.useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [calendarVisibility, setCalendarVisibility] = React.useState<Record<string, boolean>>({});
  const [savingCalendarId, setSavingCalendarId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const settingsQuery = useQuery({
    queryKey: ["mobile-user-settings"],
    queryFn: () => calendarApiService.getUserSettings(),
  });

  const settings = settingsQuery.data ?? defaultSettings;
  const effectiveWeekStartDay = settings.weekStartDay ?? weekStartDay;
  const effectiveWorkingDays = React.useMemo(
    () =>
      workingDays && workingDays.length > 0
        ? workingDays
        : parseWorkingDays(settings.workingDays),
    [settings.workingDays, workingDays],
  );
  const effectiveTimezone = timezone || settings.timezone || defaultSettings.timezone;

  React.useEffect(() => {
    const desiredView = (settings.defaultView || initialView) as CalendarView;
    setView((prev) => (prev === desiredView ? prev : desiredView));
  }, [settings.defaultView, initialView]);

  React.useEffect(() => {
    if (!calendarData.calendars.length) return;

    setCalendarVisibility((prev) => {
      const next = { ...prev };
      for (const calendar of calendarData.calendars) {
        if (next[calendar.id] === undefined) {
          next[calendar.id] = calendar.isVisible;
        }
      }
      return next;
    });
  }, [calendarData.calendars]);

  const sourceEvents = events ?? calendarData.events;

  const visibleEvents = React.useMemo(() => {
    const visibility = calendarVisibility;

    return sourceEvents
      .filter((event) => visibility[event.calendarId] ?? true)
      .map((event) => ({
        ...event,
        description: event.description ?? undefined,
        color: event.color ?? undefined,
        location: event.location ?? undefined,
        categoryId: event.categoryId ?? undefined,
        reminder: event.reminder ?? undefined,
      }));
  }, [sourceEvents, calendarVisibility]);

  const effectiveDefaultCalendarId =
    defaultCalendarId ||
    (settings as UserSettings).defaultCalendarId ||
    calendarData.calendars.find((calendar) => calendar.isDefault)?.id ||
    calendarData.calendars[0]?.id ||
    null;

  const handleQuickCreate = React.useCallback(async () => {
    if (!effectiveDefaultCalendarId) return;
    const createEvent = onCreateEvent ?? calendarData.createEvent;

    const start = new Date(currentDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);

    await createEvent({
      title: "New event",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      calendarId: effectiveDefaultCalendarId,
      timezone: effectiveTimezone,
    });
  }, [calendarData.createEvent, currentDate, effectiveDefaultCalendarId, effectiveTimezone, onCreateEvent]);

  const handleToggleCalendar = React.useCallback(
    async (calendarId: string) => {
      const currentCalendar = calendarData.calendars.find((calendar) => calendar.id === calendarId);
      if (!currentCalendar) return;

      const nextVisibility = !(calendarVisibility[calendarId] ?? currentCalendar.isVisible);

      setCalendarVisibility((prev) => ({
        ...prev,
        [calendarId]: nextVisibility,
      }));

      setSavingCalendarId(calendarId);
      try {
        await calendarData.updateCalendar(calendarId, {
          isVisible: nextVisibility,
        });
      } finally {
        setSavingCalendarId((prev) => (prev === calendarId ? null : prev));
      }
    },
    [calendarData, calendarVisibility],
  );

  const showMiniCalendar = view === "day" || view === "week" || view === "agenda";

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </Text>
          <Text className="text-lg font-bold text-foreground">
            {format(currentDate, view === "day" ? "EEEE, MMM d" : "MMMM yyyy")}
          </Text>
        </View>

        <Pressable
          className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card px-3"
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Text className="text-xs font-semibold uppercase text-foreground">Menu</Text>
        </Pressable>
      </View>

      <View className="mx-4 mb-2 flex-row rounded-xl border border-border bg-muted/35 p-1">
        {VIEW_OPTIONS.map((option) => {
          const active = view === option;
          return (
            <Pressable
              key={option}
              onPress={() => setView(option)}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-lg",
                active ? "bg-primary" : "bg-transparent",
              )}
            >
              <Text
                className={cn(
                  "text-xs font-semibold uppercase",
                  active ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {sharedMobileViewLabels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showMiniCalendar ? (
        <StickyMiniCalendarNative
          currentDate={currentDate}
          onDateSelect={setCurrentDate}
          events={visibleEvents}
          weekStartDay={effectiveWeekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          workingDays={effectiveWorkingDays}
          showDayStrip={view === "week"}
          showAllDayEvents={view === "day"}
        />
      ) : null}

      <MobileEventCalendar
        initialView={initialView}
        view={view}
        onViewChange={setView}
        currentDate={currentDate}
        onCurrentDateChange={setCurrentDate}
        events={visibleEvents}
        loading={loading ?? (calendarData.eventsLoading || settingsQuery.isLoading)}
        error={error ?? (calendarData.error || settingsQuery.error || null)}
        onDateRangeChange={onDateRangeChange ?? calendarData.setDateRange}
        onCreateEvent={onCreateEvent ?? calendarData.createEvent}
        defaultCalendarId={effectiveDefaultCalendarId}
        weekStartDay={effectiveWeekStartDay}
        workingDays={effectiveWorkingDays}
        timezone={effectiveTimezone}
        showHeader={false}
        showViewSwitch={false}
        showCreateButton={false}
        contentInsetBottom={120}
      />

      <View className="absolute bottom-3 left-3 right-3 flex-row items-center gap-2 rounded-2xl border border-border bg-card/95 p-2">
        <Pressable
          className="min-h-11 flex-1 items-center justify-center rounded-xl bg-muted/35"
          onPress={() => setCurrentDate(new Date())}
        >
          <Text className="text-xs font-semibold uppercase text-foreground">Today</Text>
        </Pressable>

        <Pressable
          className="min-h-11 min-w-11 items-center justify-center rounded-xl bg-primary px-4"
          onPress={() => (onOpenAddEvent ? onOpenAddEvent() : void handleQuickCreate())}
        >
          <Text className="text-xl font-bold text-primary-foreground">+</Text>
        </Pressable>

        <Pressable
          className="min-h-11 flex-1 items-center justify-center rounded-xl bg-muted/35"
          onPress={() => setView(nextMobileCalendarView(view))}
        >
          <Text className="text-xs font-semibold uppercase text-foreground">{sharedMobileViewLabels[view]}</Text>
        </Pressable>

        <Pressable
          className="min-h-11 flex-1 items-center justify-center rounded-xl bg-muted/35"
          onPress={() => setDrawerOpen(true)}
        >
          <Text className="text-xs font-semibold uppercase text-foreground">Menu</Text>
        </Pressable>
      </View>

      <MobileSidebarDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        user={user}
        calendars={calendarData.calendars}
        calendarVisibility={calendarVisibility}
        savingCalendarId={savingCalendarId}
        onToggleCalendar={(calendarId) => void handleToggleCalendar(calendarId)}
        events={visibleEvents}
        currentDate={currentDate}
        onCurrentDateChange={setCurrentDate}
        onMiniCalendarMonthChange={onDateRangeChange ?? calendarData.setDateRange}
        onCreateEvent={onOpenAddEvent ? onOpenAddEvent : () => void handleQuickCreate()}
        onOpenSettings={onOpenSettings}
        onOpenCalendarManagement={onOpenCalendarManagement}
      />
    </View>
  );
}
