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

interface MobileCalendarWrapperProps {
  initialView?: "month" | "week" | "day" | "agenda";
  defaultCalendarId?: string | null;
  weekStartDay?: number;
}

const viewLabels: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

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
    () => parseWorkingDays(settings.workingDays),
    [settings.workingDays],
  );
  const effectiveTimezone = settings.timezone || defaultSettings.timezone;

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

  const visibleEvents = React.useMemo(() => {
    const visibility = calendarVisibility;

    return calendarData.events
      .filter((event) => visibility[event.calendarId] ?? true)
      .map((event) => ({
        ...event,
        description: event.description ?? undefined,
        color: event.color ?? undefined,
        location: event.location ?? undefined,
        categoryId: event.categoryId ?? undefined,
        reminder: event.reminder ?? undefined,
      }));
  }, [calendarData.events, calendarVisibility]);

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

    const start = new Date(currentDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);

    await calendarData.createEvent({
      title: "New event",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      calendarId: effectiveDefaultCalendarId,
      timezone: effectiveTimezone,
    });
  }, [calendarData, currentDate, effectiveDefaultCalendarId, effectiveTimezone]);

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
        <Pressable style={styles.topAction} onPress={openDrawer}>
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
          showDayStrip={view !== "day"}
        />
      ) : null}

      <MobileEventCalendar
        initialView={initialView}
        view={view}
        onViewChange={setView}
        currentDate={currentDate}
        onCurrentDateChange={setCurrentDate}
        events={visibleEvents}
        loading={calendarData.eventsLoading || settingsQuery.isLoading}
        error={calendarData.error || settingsQuery.error || null}
        onDateRangeChange={calendarData.setDateRange}
        onCreateEvent={calendarData.createEvent}
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
        <Pressable style={styles.bottomButtonPrimary} onPress={() => void handleQuickCreate()}>
          <Text style={styles.bottomButtonPrimaryLabel}>Add</Text>
        </Pressable>
        <Pressable style={styles.bottomButton} onPress={() => setView(nextView(view))}>
          <Text style={styles.bottomButtonLabel}>{viewLabels[view]}</Text>
        </Pressable>
        <Pressable style={styles.bottomButton} onPress={openDrawer}>
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
                      {viewLabels[option]}
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
                const color = calendar.color?.startsWith("#") ? calendar.color : "#0ea5e9";
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

function parseWorkingDays(value?: string) {
  if (!value) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "number") : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function nextView(view: CalendarView): CalendarView {
  if (view === "day") return "week";
  if (view === "week") return "month";
  if (view === "month") return "agenda";
  return "day";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#f4f7fb",
  },
  topCopy: {
    gap: 2,
  },
  topEyebrow: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  topTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "700",
  },
  topAction: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topActionText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
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
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#dbe4f0",
  },
  bottomButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
  },
  bottomButtonPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "#0f172a",
  },
  bottomButtonLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  bottomButtonPrimaryLabel: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.22)",
  },
  drawerPanel: {
    width: drawerWidth,
    height: "100%",
    backgroundColor: "#f4f7fb",
    borderLeftWidth: 1,
    borderColor: "#dbe4f0",
    paddingTop: 56,
  },
  drawerHandle: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  drawerEyebrow: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  drawerTitle: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "700",
  },
  drawerClose: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  drawerCloseText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  drawerContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 4,
  },
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentButton: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  segmentText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  workdayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  workdayPill: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  workdayPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  workdayPillText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
  },
  workdayPillTextActive: {
    color: "#ffffff",
  },
  calendarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dbe4f0",
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
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  calendarMeta: {
    color: "#64748b",
    fontSize: 13,
  },
  calendarState: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    padding: 14,
    gap: 4,
  },
  infoCardText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  infoCardSubtext: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountLabel: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
});
