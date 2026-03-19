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

export interface MobileEventCalendarProps {
  initialView?: CalendarView;
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
}

const views: CalendarView[] = ["month", "week", "day", "agenda"];

export function MobileEventCalendar({
  initialView = "day",
  events = [],
  loading = false,
  error = null,
  onDateRangeChange,
  onCreateEvent,
  defaultCalendarId = null,
  weekStartDay = 1,
}: MobileEventCalendarProps) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [creating, setCreating] = useState(false);

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
    return Array.from({ length: count }, (_, i) => addDays(start, i));
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
    if (view === "month") setCurrentDate(direction < 0 ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(direction < 0 ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, direction * (view === "agenda" ? AgendaDaysToShow : 1)));
  };

  const handleQuickCreate = async () => {
    if (!onCreateEvent || !defaultCalendarId || creating) return;
    const start = new Date(selectedDate);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate(-1)} style={styles.navButton}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{headerTitle}</Text>
        <Pressable onPress={() => navigate(1)} style={styles.navButton}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

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

      {view === "month" && (
        <ScrollView contentContainerStyle={styles.monthGrid}>
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
                  if (!isSameMonth(day, currentDate)) setCurrentDate(day);
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
      )}

      {(view === "day" || view === "week" || view === "agenda") && (
        <ScrollView contentContainerStyle={styles.eventsList}>
          {(view === "day" ? rangeEvents : selectedDayEvents).map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {format(new Date(event.start), "EEE d MMM, HH:mm")} - {format(new Date(event.end), "HH:mm")}
              </Text>
              {!!event.location && <Text style={styles.eventMeta}>{event.location}</Text>}
            </View>
          ))}
          {!loading && (view === "day" ? rangeEvents : selectedDayEvents).length === 0 && (
            <Text style={styles.emptyText}>No events for this range.</Text>
          )}
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Loading events…</Text>
        </View>
      )}

      {!!error?.message && <Text style={styles.errorText}>{error.message}</Text>}

      <Pressable style={styles.createButton} onPress={handleQuickCreate}>
        <Text style={styles.createButtonText}>{creating ? "…" : "+"}</Text>
      </Pressable>
    </View>
  );
}

function endOfDaySafe(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  navButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 24, color: "#1f2937" },
  title: { fontSize: 16, fontWeight: "600", color: "#111827" },
  viewSwitch: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    padding: 4,
  },
  viewSwitchItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  viewSwitchItemActive: { backgroundColor: "#ffffff" },
  viewSwitchText: { textTransform: "capitalize", color: "#6b7280", fontSize: 13, fontWeight: "500" },
  viewSwitchTextActive: { color: "#111827" },
  dayStrip: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  dayPill: {
    width: 68,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  dayPillActive: { backgroundColor: "#0ea5e9" },
  dayPillWeekday: { fontSize: 11, color: "#4b5563" },
  dayPillDate: { fontSize: 16, fontWeight: "700", color: "#111827" },
  dayPillCount: { fontSize: 10, color: "#6b7280" },
  dayPillTextActive: { color: "#fff" },
  monthGrid: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthCell: {
    width: "13.2%",
    minHeight: 66,
    borderRadius: 10,
    padding: 6,
    backgroundColor: "#f9fafb",
    justifyContent: "space-between",
  },
  monthCellMuted: { opacity: 0.5 },
  monthDate: { fontSize: 12, fontWeight: "600", color: "#111827" },
  monthCount: { fontSize: 10, color: "#2563eb" },
  eventsList: { paddingHorizontal: 12, paddingBottom: 88, gap: 10 },
  eventCard: {
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 10,
  },
  eventTitle: { fontSize: 14, fontWeight: "600", color: "#1e3a8a" },
  eventMeta: { marginTop: 2, fontSize: 12, color: "#374151" },
  emptyText: { marginTop: 20, textAlign: "center", color: "#6b7280" },
  loadingOverlay: {
    position: "absolute",
    top: 76,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadingText: { fontSize: 12, color: "#4b5563" },
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
    backgroundColor: "#0ea5e9",
  },
  createButtonText: { color: "#fff", fontSize: 28, marginTop: -2 },
});
