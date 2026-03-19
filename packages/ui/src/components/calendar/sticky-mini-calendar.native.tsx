import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import type { CalendarEvent } from "./types";
import { getAllEventsForDay, resolveEventColorValue } from "./utils";

interface StickyMiniCalendarNativeProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events?: CalendarEvent[];
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  showDayStrip?: boolean;
}

export function StickyMiniCalendarNative({
  currentDate,
  onDateSelect,
  events = [],
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  showDayStrip = true,
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => setDisplayMonth(subMonths(displayMonth, 1))}>
          <Text style={styles.headerButtonText}>{"<"}</Text>
        </Pressable>
        <Pressable onPress={() => setDisplayMonth(currentDate)}>
          <Text style={styles.headerTitle}>{format(displayMonth, "MMMM yyyy")}</Text>
        </Pressable>
        <Pressable style={styles.headerButton} onPress={() => setDisplayMonth(addMonths(displayMonth, 1))}>
          <Text style={styles.headerButtonText}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentMonth = isSameMonth(day, displayMonth);
          const dayEvents = getAllEventsForDay(events, day);

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onDateSelect(day)}
              style={[
                styles.dayCell,
                isSelected ? styles.dayCellSelected : null,
                !isCurrentMonth ? styles.dayCellMuted : null,
              ]}
            >
              <Text
                style={[
                  styles.dayCellText,
                  isToday(day) ? styles.dayCellTodayText : null,
                  isSelected ? styles.dayCellSelectedText : null,
                ]}
              >
                {format(day, "d")}
              </Text>
              <View style={styles.dotRow}>
                {dayEvents.slice(0, 3).map((event) => (
                  <View
                    key={`${day.toISOString()}-${event.id}`}
                    style={[
                      styles.eventDot,
                      { backgroundColor: resolveEventColorValue(event.color) },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {showDayStrip ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
        >
          {currentWeekDays.map((day) => {
            const isSelected = isSameDay(day, currentDate);
            const isWorkDay = workingDays.includes(day.getDay());
            return (
              <Pressable
                key={day.toISOString()}
                onPress={() => onDateSelect(day)}
                style={[
                  styles.dayStripItem,
                  isSelected ? styles.dayStripItemSelected : null,
                  isWorkDay ? styles.dayStripItemWorkday : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayStripWeekday,
                    isSelected ? styles.dayStripSelectedText : null,
                  ]}
                >
                  {format(day, "EEE")}
                </Text>
                <Text
                  style={[
                    styles.dayStripDate,
                    isSelected ? styles.dayStripSelectedText : null,
                  ]}
                >
                  {format(day, "d")}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderColor: "#dbe4f0",
    paddingTop: 6,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
  },
  headerButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  headerTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    rowGap: 4,
  },
  dayCell: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    borderRadius: 12,
    paddingVertical: 4,
  },
  dayCellSelected: {
    backgroundColor: "#0f172a",
  },
  dayCellMuted: {
    opacity: 0.35,
  },
  dayCellText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "700",
  },
  dayCellTodayText: {
    color: "#2563eb",
  },
  dayCellSelectedText: {
    color: "#ffffff",
  },
  dotRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
    minHeight: 4,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  dayStrip: {
    paddingHorizontal: 8,
    gap: 8,
    paddingTop: 8,
  },
  dayStripItem: {
    width: 56,
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
  },
  dayStripItemSelected: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  dayStripItemWorkday: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dayStripWeekday: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dayStripDate: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  dayStripSelectedText: {
    color: "#ffffff",
  },
});
