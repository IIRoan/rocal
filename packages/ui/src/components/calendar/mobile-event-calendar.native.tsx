import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
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
import { MobileWeekViewNative } from "./mobile-week-view.native";

export interface MobileEventCalendarProps {
  initialView?: CalendarView;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  events?: CalendarEvent[];
  loading?: boolean;
  error?: { message?: string } | null;
  onDateRangeChange?: (dateRange: { start: Date; end: Date }) => void;
  onCreateEvent?: (event: {
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    calendarId: string;
  }) => Promise<unknown>;
  defaultCalendarId?: string | null;
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  showHeader?: boolean;
  showViewSwitch?: boolean;
  showCreateButton?: boolean;
  contentInsetBottom?: number;
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
  defaultCalendarId = null,
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  showHeader = true,
  showViewSwitch = true,
  showCreateButton = true,
  contentInsetBottom = 88,
}: MobileEventCalendarProps) {
  const [uncontrolledView, setUncontrolledView] = useState<CalendarView>(initialView);
  const [uncontrolledCurrentDate, setUncontrolledCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
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

  const selectedDayEvents = useMemo(
    () =>
      rangeEvents.filter((event) =>
        eventOverlapsRange(event, startOfDay(selectedDate), endOfDaySafe(selectedDate)),
      ),
    [rangeEvents, selectedDate],
  );

  const daysForStrip = useMemo(() => {
    const start =
      view === "week"
        ? startOfWeek(currentDate, {
            weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          })
        : startOfDay(currentDate);
    const count = view === "week" ? 7 : view === "agenda" ? AgendaDaysToShow : 1;
    return Array.from({ length: count }, (_, index) => addDays(start, index));
  }, [currentDate, view, weekStartDay]);

  const headerTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "week") {
      const start = daysForStrip[0] || currentDate;
      const end = daysForStrip[daysForStrip.length - 1] || currentDate;
      return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
    }
    if (view === "agenda") {
      return `${format(daysForStrip[0] || currentDate, "MMM d")} onward`;
    }
    return format(currentDate, "EEEE, MMM d");
  }, [currentDate, view, daysForStrip]);

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
    if (!onCreateEvent || !defaultCalendarId || creating) return;

    const start = new Date(currentDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);

    setCreating(true);
    try {
      await onCreateEvent({
        title: "New event",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        calendarId: defaultCalendarId,
      });
    } finally {
      setCreating(false);
    }
  };

  const visibleEvents = view === "day" ? rangeEvents : selectedDayEvents;

  return (
    <View style={styles.container}>
      {showHeader ? (
        <View style={styles.header}>
          <Pressable onPress={() => navigate(-1)} style={styles.navButton}>
            <Text style={styles.navText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>{headerTitle}</Text>
          <Pressable onPress={() => navigate(1)} style={styles.navButton}>
            <Text style={styles.navText}>{">"}</Text>
          </Pressable>
        </View>
      ) : null}

      {showViewSwitch ? (
        <View style={styles.viewSwitch}>
          {views.map((item) => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              style={[styles.viewSwitchItem, view === item && styles.viewSwitchItemActive]}
            >
              <Text style={[styles.viewSwitchText, view === item && styles.viewSwitchTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {(view === "week" || view === "agenda") && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
          {daysForStrip.map((day) => {
            const selected = isSameDay(day, selectedDate);
            const count = rangeEvents.filter((event) => isSameDay(new Date(event.start), day)).length;
            return (
              <Pressable
                key={day.toISOString()}
                onPress={() => setSelectedDate(day)}
                style={[styles.dayPill, selected && styles.dayPillActive]}
              >
                <Text style={[styles.dayPillWeekday, selected && styles.dayPillTextActive]}>
                  {format(day, "EEE")}
                </Text>
                <Text style={[styles.dayPillDate, selected && styles.dayPillTextActive]}>
                  {format(day, "d")}
                </Text>
                <Text style={[styles.dayPillCount, selected && styles.dayPillTextActive]}>{count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.content}>
        {view === "month" ? (
          <ScrollView contentContainerStyle={[styles.monthGrid, { paddingBottom: contentInsetBottom }]}>
            {Array.from({ length: 42 }, (_, index) => {
              const start = startOfWeek(startOfMonth(currentDate), {
                weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
              });
              const day = addDays(start, index);
              const inMonth = day.getMonth() === currentDate.getMonth();
              const count = rangeEvents.filter((event) =>
                eventOverlapsRange(event, startOfDay(day), endOfDaySafe(day)),
              ).length;

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => {
                    setSelectedDate(day);
                    if (!isSameMonth(day, currentDate)) {
                      setCurrentDate(day);
                    }
                    setView("day");
                  }}
                  style={[styles.monthCell, !inMonth && styles.monthCellMuted]}
                >
                  <Text style={styles.monthDate}>{format(day, "d")}</Text>
                  {!!count && <Text style={styles.monthCount}>{count} events</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {view === "day" ? (
          <MobileDayViewNative
            currentDate={currentDate}
            events={rangeEvents}
            onEventSelect={() => {}}
            onEventCreate={(startTime) => {
              setSelectedDate(startTime);
              if (!onCreateEvent || !defaultCalendarId) return;
              void onCreateEvent({
                title: "New event",
                start: startTime.toISOString(),
                end: new Date(startTime.getTime() + 60 * 60 * 1000).toISOString(),
                allDay: false,
                calendarId: defaultCalendarId,
              });
            }}
            timezone={timezone}
            workingDays={workingDays}
          />
        ) : null}

        {view === "week" ? (
          <MobileWeekViewNative
            currentDate={currentDate}
            events={rangeEvents}
            onEventSelect={() => {}}
            onEventCreate={(startTime) => {
              setSelectedDate(startTime);
              if (!onCreateEvent || !defaultCalendarId) return;
              void onCreateEvent({
                title: "New event",
                start: startTime.toISOString(),
                end: new Date(startTime.getTime() + 60 * 60 * 1000).toISOString(),
                allDay: false,
                calendarId: defaultCalendarId,
              });
            }}
            weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
            timezone={timezone}
            workingDays={workingDays}
          />
        ) : null}

        {view === "agenda" ? (
          <ScrollView contentContainerStyle={[styles.eventsList, { paddingBottom: contentInsetBottom }]}>
            {visibleEvents.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>
                  {format(new Date(event.start), "EEE d MMM, HH:mm")} - {format(new Date(event.end), "HH:mm")}
                </Text>
                {!!event.location && <Text style={styles.eventMeta}>{event.location}</Text>}
              </View>
            ))}
            {!loading && visibleEvents.length === 0 ? (
              <Text style={styles.emptyText}>No events for this range.</Text>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : null}

      {!!error?.message && <Text style={styles.errorText}>{error.message}</Text>}

      {showCreateButton ? (
        <Pressable style={styles.createButton} onPress={() => void handleQuickCreate()}>
          <Text style={styles.createButtonText}>{creating ? "..." : "+"}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f4f7fb",
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
  },
  navText: { fontSize: 20, color: "#0f172a", fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  viewSwitch: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: "#e8eef5",
    padding: 4,
  },
  viewSwitchItem: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  viewSwitchItemActive: { backgroundColor: "#ffffff" },
  viewSwitchText: { textTransform: "capitalize", color: "#64748b", fontSize: 13, fontWeight: "600" },
  viewSwitchTextActive: { color: "#0f172a" },
  dayStrip: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  dayPill: {
    width: 68,
    borderRadius: 16,
    backgroundColor: "#e8eef5",
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  dayPillActive: { backgroundColor: "#0f172a" },
  dayPillWeekday: { fontSize: 11, color: "#64748b", fontWeight: "700" },
  dayPillDate: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  dayPillCount: { fontSize: 10, color: "#64748b" },
  dayPillTextActive: { color: "#ffffff" },
  content: { flex: 1 },
  monthGrid: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthCell: {
    width: "13.2%",
    minHeight: 72,
    borderRadius: 16,
    padding: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    justifyContent: "space-between",
  },
  monthCellMuted: { opacity: 0.5 },
  monthDate: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  monthCount: { fontSize: 10, color: "#2563eb", fontWeight: "600" },
  eventsList: { paddingHorizontal: 12, gap: 10 },
  eventCard: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    padding: 12,
  },
  eventTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  eventMeta: { marginTop: 2, fontSize: 12, color: "#475569" },
  emptyText: { marginTop: 20, textAlign: "center", color: "#64748b" },
  loadingOverlay: {
    position: "absolute",
    top: 76,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadingText: { fontSize: 12, color: "#475569" },
  errorText: { color: "#dc2626", fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  createButton: {
    position: "absolute",
    right: 16,
    bottom: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  createButtonText: { color: "#fff", fontSize: 28, marginTop: -2 },
});
