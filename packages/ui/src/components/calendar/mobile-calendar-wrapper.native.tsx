import React from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { calendarApiService, type UserSettings } from "@workspace/calendar-client";
import { MobileEventCalendar } from "./mobile-event-calendar.native";
import { StickyMiniCalendarNative } from "./sticky-mini-calendar.native";
import { useSharedCalendarData } from "./calendar-data-provider";
import { MobileSidebarDrawer } from "../layout/mobile-sidebar-drawer.native";
import type { CalendarView } from "./types";
import {
  mobileCalendarTokens,
  nextMobileCalendarView,
  parseWorkingDays,
  sharedMobileViewLabels,
  type SharedMobileCalendarWrapperProps,
} from "./mobile-calendar-shared";

type MobileCalendarWrapperProps = SharedMobileCalendarWrapperProps;

const defaultSettings: Pick<UserSettings, "defaultView" | "weekStartDay" | "timezone" | "workingDays"> = {
  defaultView: "day",
  weekStartDay: 1,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  workingDays: "[1,2,3,4,5]",
};

const drawerWidth = Math.min(Dimensions.get("window").width * 0.88, 380);

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

  const openDrawer = React.useCallback(() => {
    setDrawerOpen(true);
  }, []);

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

  const handleDrawerCreateEvent = React.useCallback(() => {
    if (onOpenAddEvent) {
      onOpenAddEvent();
      return;
    }

    void handleQuickCreate();
  }, [handleQuickCreate, onOpenAddEvent]);

  const showMiniCalendar = view === "day" || view === "week" || view === "agenda";

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topCopy}>
          <Text style={styles.topEyebrow}>Workspace</Text>
          <Text style={styles.topTitle}>{format(currentDate, view === "day" ? "EEEE, MMM d" : "MMMM yyyy")}</Text>
        </View>
        <Pressable style={styles.topAction} onPress={openDrawer}>
          <Text style={styles.topActionText}>Menu</Text>
        </Pressable>
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
        showViewSwitch={false}
        showCreateButton={false}
        contentInsetBottom={112}
      />

      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomButton} onPress={() => setCurrentDate(new Date())}>
          <Text style={styles.bottomButtonLabel}>Today</Text>
        </Pressable>
        <Pressable
          style={styles.bottomButtonPrimary}
          onPress={() => (onOpenAddEvent ? onOpenAddEvent() : void handleQuickCreate())}
        >
          <Text style={styles.bottomButtonPrimaryLabel}>Add</Text>
        </Pressable>
        <Pressable style={styles.bottomButton} onPress={() => setView(nextMobileCalendarView(view))}>
          <Text style={styles.bottomButtonLabel}>{sharedMobileViewLabels[view]}</Text>
        </Pressable>
        <Pressable style={styles.bottomButton} onPress={openDrawer}>
          <Text style={styles.bottomButtonLabel}>Menu</Text>
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
        onCreateEvent={handleDrawerCreateEvent}
        onOpenSettings={onOpenSettings}
        onOpenCalendarManagement={onOpenCalendarManagement}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileCalendarTokens.colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: mobileCalendarTokens.spacing.lg,
    paddingTop: mobileCalendarTokens.spacing.sm,
    paddingBottom: mobileCalendarTokens.spacing.xs,
    backgroundColor: mobileCalendarTokens.colors.background,
  },
  topCopy: {
    gap: 2,
  },
  topEyebrow: {
    color: mobileCalendarTokens.colors.accent,
    fontSize: mobileCalendarTokens.typography.eyebrow.size,
    fontWeight: mobileCalendarTokens.typography.eyebrow.weight,
    textTransform: "uppercase",
    letterSpacing: mobileCalendarTokens.typography.eyebrow.letterSpacing,
  },
  topTitle: {
    color: mobileCalendarTokens.colors.text,
    fontSize: mobileCalendarTokens.typography.title.size,
    fontWeight: mobileCalendarTokens.typography.title.weight,
  },
  topAction: {
    borderRadius: mobileCalendarTokens.radius.pill,
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topActionText: {
    color: mobileCalendarTokens.colors.text,
    fontSize: mobileCalendarTokens.typography.body.size,
    fontWeight: mobileCalendarTokens.typography.body.weight,
  },
  bottomBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: mobileCalendarTokens.radius.nav,
    backgroundColor: mobileCalendarTokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
  },
  bottomButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: mobileCalendarTokens.sizes.bottomBarMinHeight,
    borderRadius: mobileCalendarTokens.radius.lg,
    backgroundColor: mobileCalendarTokens.colors.surfaceAccent,
  },
  bottomButtonPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: mobileCalendarTokens.sizes.bottomBarMinHeight,
    borderRadius: mobileCalendarTokens.radius.lg,
    backgroundColor: mobileCalendarTokens.colors.primary,
  },
  bottomButtonLabel: {
    color: mobileCalendarTokens.colors.text,
    fontSize: mobileCalendarTokens.typography.body.size,
    fontWeight: mobileCalendarTokens.typography.body.weight,
  },
  bottomButtonPrimaryLabel: {
    color: mobileCalendarTokens.colors.textOnPrimary,
    fontSize: mobileCalendarTokens.typography.body.size,
    fontWeight: mobileCalendarTokens.typography.body.weight,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileCalendarTokens.colors.overlay,
  },
  drawerPanel: {
    width: drawerWidth,
    height: "100%",
    backgroundColor: mobileCalendarTokens.colors.background,
    borderLeftWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingTop: 56,
  },
  drawerHandle: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: mobileCalendarTokens.colors.border,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  drawerEyebrow: {
    color: mobileCalendarTokens.colors.accent,
    fontSize: mobileCalendarTokens.typography.eyebrow.size,
    fontWeight: mobileCalendarTokens.typography.eyebrow.weight,
    textTransform: "uppercase",
    letterSpacing: mobileCalendarTokens.typography.eyebrow.letterSpacing,
  },
  drawerTitle: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  drawerClose: {
    borderRadius: mobileCalendarTokens.radius.pill,
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  drawerCloseText: {
    color: mobileCalendarTokens.colors.text,
    fontSize: mobileCalendarTokens.typography.body.size,
    fontWeight: mobileCalendarTokens.typography.body.weight,
  },
  drawerContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: mobileCalendarTokens.colors.textMuted,
    fontSize: mobileCalendarTokens.typography.sectionTitle.size,
    fontWeight: mobileCalendarTokens.typography.sectionTitle.weight,
    textTransform: "uppercase",
    letterSpacing: mobileCalendarTokens.typography.sectionTitle.letterSpacing,
    marginTop: 4,
  },
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentButton: {
    borderRadius: mobileCalendarTokens.radius.md,
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: mobileCalendarTokens.colors.primary,
    borderColor: mobileCalendarTokens.colors.primary,
  },
  segmentText: {
    color: mobileCalendarTokens.colors.text,
    fontSize: mobileCalendarTokens.typography.body.size,
    fontWeight: mobileCalendarTokens.typography.body.weight,
  },
  segmentTextActive: {
    color: mobileCalendarTokens.colors.textOnPrimary,
  },
  workdayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  workdayPill: {
    borderRadius: mobileCalendarTokens.radius.pill,
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  workdayPillActive: {
    backgroundColor: mobileCalendarTokens.colors.primary,
    borderColor: mobileCalendarTokens.colors.primary,
  },
  workdayPillText: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  workdayPillTextActive: {
    color: mobileCalendarTokens.colors.textOnPrimary,
  },
  calendarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderRadius: mobileCalendarTokens.radius.xxl,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    padding: 16,
  },
  calendarCardMuted: {
    opacity: 0.65,
  },
  calendarSwatch: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
  calendarCopy: {
    flex: 1,
    gap: 2,
  },
  calendarTitle: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  calendarMeta: {
    color: mobileCalendarTokens.colors.textMuted,
    fontSize: 13,
  },
  calendarState: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderRadius: mobileCalendarTokens.radius.xl,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    padding: 14,
    gap: 4,
  },
  infoCardText: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  infoCardSubtext: {
    color: mobileCalendarTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: mobileCalendarTokens.colors.surface,
    borderRadius: mobileCalendarTokens.radius.xl,
    borderWidth: 1,
    borderColor: mobileCalendarTokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountLabel: {
    color: mobileCalendarTokens.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
