import React from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarApiService, type UserSettings } from "@workspace/calendar-client";
import { MobileEventCalendar } from "./mobile-event-calendar.native";
import { StickyMiniCalendarNative } from "./sticky-mini-calendar.native";
import { useSharedCalendarData } from "./calendar-data-provider";
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
  initialView = "day",
  defaultCalendarId,
  weekStartDay = 1,
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
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [calendarVisibility, setCalendarVisibility] = React.useState<Record<string, boolean>>({});
  const [savingCalendarId, setSavingCalendarId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const slideX = React.useRef(new Animated.Value(drawerWidth)).current;

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

  const settingsMutation = useMutation({
    mutationFn: (updates: Partial<UserSettings>) => calendarApiService.updateUserSettings(updates),
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(["mobile-user-settings"], updatedSettings);
    },
  });

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

  const animateDrawer = React.useCallback(
    (open: boolean) => {
      Animated.spring(slideX, {
        toValue: open ? 0 : drawerWidth,
        useNativeDriver: true,
        bounciness: 0,
      }).start(({ finished }) => {
        if (finished) {
          setDrawerOpen(open);
        }
      });
    },
    [slideX],
  );

  const openDrawer = React.useCallback(() => {
    setDrawerOpen(true);
    slideX.setValue(drawerWidth);
    animateDrawer(true);
  }, [animateDrawer, slideX]);

  const closeDrawer = React.useCallback(() => {
    animateDrawer(false);
  }, [animateDrawer]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx > 0) {
            slideX.setValue(Math.min(drawerWidth, gesture.dx));
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > drawerWidth * 0.25 || gesture.vx > 0.8) {
            closeDrawer();
          } else {
            animateDrawer(true);
          }
        },
      }),
    [animateDrawer, closeDrawer, slideX],
  );

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

  const handleUpdateSettings = React.useCallback(
    async (updates: Partial<UserSettings>) => {
      await settingsMutation.mutateAsync(updates);
    },
    [settingsMutation],
  );

  const showMiniCalendar = view === "day" || view === "week" || view === "agenda";

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topCopy}>
          <Text style={styles.topEyebrow}>Workspace</Text>
          <Text style={styles.topTitle}>{format(currentDate, view === "day" ? "EEEE, MMM d" : "MMMM yyyy")}</Text>
        </View>
        <Pressable style={styles.topAction} onPress={onOpenSettings ?? openDrawer}>
          <Text style={styles.topActionText}>Settings</Text>
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
        <Pressable style={styles.bottomButton} onPress={onOpenSettings ?? openDrawer}>
          <Text style={styles.bottomButtonLabel}>Menu</Text>
        </Pressable>
      </View>

      {drawerOpen ? (
        <View style={styles.drawerOverlay} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closeDrawer} />
          <Animated.View
            style={[styles.drawerPanel, { transform: [{ translateX: slideX }] }]}
            {...panResponder.panHandlers}
          >
            <View style={styles.drawerHandle} />
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerEyebrow}>Workspace</Text>
                <Text style={styles.drawerTitle}>Settings</Text>
              </View>
              <Pressable style={styles.drawerClose} onPress={closeDrawer}>
                <Text style={styles.drawerCloseText}>Done</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.drawerContent}>
              <SectionTitle title="View" />
              <View style={styles.segmented}>
                {(["day", "week", "month", "agenda"] as CalendarView[]).map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.segmentButton, settings.defaultView === option ? styles.segmentButtonActive : null]}
                    onPress={() => void handleUpdateSettings({ defaultView: option })}
                  >
                    <Text style={[styles.segmentText, settings.defaultView === option ? styles.segmentTextActive : null]}>
                      {sharedMobileViewLabels[option]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle title="Week Start" />
              <View style={styles.segmented}>
                {[0, 1].map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.segmentButton, effectiveWeekStartDay === option ? styles.segmentButtonActive : null]}
                    onPress={() => void handleUpdateSettings({ weekStartDay: option })}
                  >
                    <Text style={[styles.segmentText, effectiveWeekStartDay === option ? styles.segmentTextActive : null]}>
                      {option === 0 ? "Sun" : "Mon"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle title="Working Days" />
              <View style={styles.workdayGrid}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => {
                  const active = effectiveWorkingDays.includes(index);
                  const next = active
                    ? effectiveWorkingDays.filter((day) => day !== index)
                    : [...effectiveWorkingDays, index].sort((a, b) => a - b);
                  return (
                    <Pressable
                      key={label}
                      style={[styles.workdayPill, active ? styles.workdayPillActive : null]}
                      onPress={() => void handleUpdateSettings({ workingDays: JSON.stringify(next) })}
                    >
                      <Text style={[styles.workdayPillText, active ? styles.workdayPillTextActive : null]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <SectionTitle title="Calendars" />
              {calendarData.calendars.map((calendar) => {
                const isVisible = calendarVisibility[calendar.id] ?? calendar.isVisible;
                const color =
                  calendar.color?.startsWith("#")
                    ? calendar.color
                    : mobileCalendarTokens.colors.accentStrong;
                return (
                  <Pressable
                    key={calendar.id}
                    style={[styles.calendarCard, !isVisible && styles.calendarCardMuted]}
                    onPress={() => void handleToggleCalendar(calendar.id)}
                  >
                    <View style={[styles.calendarSwatch, { backgroundColor: color }]} />
                    <View style={styles.calendarCopy}>
                      <Text style={styles.calendarTitle}>{calendar.name}</Text>
                      <Text style={styles.calendarMeta}>
                        {isVisible ? "Visible in mobile views" : "Hidden from mobile views"}
                      </Text>
                    </View>
                    <Text style={styles.calendarState}>
                      {savingCalendarId === calendar.id ? "..." : isVisible ? "On" : "Off"}
                    </Text>
                  </Pressable>
                );
              })}

              <SectionTitle title="Timezone" />
              <View style={styles.infoCard}>
                <Text style={styles.infoCardText}>{effectiveTimezone}</Text>
                <Text style={styles.infoCardSubtext}>Timezone editing can be added next, but the native calendar now respects the saved setting.</Text>
              </View>

              <SectionTitle title="Account" />
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Data sync</Text>
                <Switch value={!calendarData.eventsLoading} disabled />
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
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
