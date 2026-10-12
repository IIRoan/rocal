import { useState } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
// repo-rules-allow timezone-safe-calendar-code: format() renders the picker's local month-grid navigation state, never event instants.
import { format } from "date-fns";
import type { ThemeTokens } from "@workspace/design-tokens";

const CALENDAR_DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface GridCell {
  key: string;
  day: number | null;
}

function buildMonthWeeks(startOffset: number, daysInMonth: number) {
  const cells: GridCell[] = [];
  for (let blank = 0; blank < startOffset; blank++) {
    cells.push({ key: `lead-${blank}`, day: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: `day-${day}`, day });
  }
  for (let blank = 0; cells.length % 7 !== 0; blank++) {
    cells.push({ key: `trail-${blank}`, day: null });
  }
  const weeks: { key: string; cells: GridCell[] }[] = [];
  for (let start = 0; start < cells.length; start += 7) {
    const week = cells.slice(start, start + 7);
    weeks.push({
      key: `week-${start / 7}`,
      cells: week,
    });
  }
  return weeks;
}

export function CalendarGrid({
  selectedDate,
  onSelect,
  minDate,
  theme,
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  theme: ThemeTokens;
}) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const weeks = buildMonthWeeks(startOffset, daysInMonth);

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  const monthLabel = format(viewMonth, "MMMM yyyy");

  const isSelected = (day: number) =>
    day === selectedDate.getDate() &&
    month === selectedDate.getMonth() &&
    year === selectedDate.getFullYear();

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    const d = new Date(year, month, day);
    const min = new Date(
      minDate.getFullYear(),
      minDate.getMonth(),
      minDate.getDate(),
    );
    return d < min;
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
        }}
      >
        <Pressable
          onPress={prevMonth}
          hitSlop={12}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Feather
            name="chevron-left"
            size={18}
            color={theme.colors.foreground}
          />
        </Pressable>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            fontWeight: theme.typography.fontWeight
              .semibold as TextStyle["fontWeight"],
            color: theme.colors.foreground,
          }}
        >
          {monthLabel}
        </Text>
        <Pressable
          onPress={nextMonth}
          hitSlop={12}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Feather
            name="chevron-right"
            size={18}
            color={theme.colors.foreground}
          />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {CALENDAR_DAY_HEADERS.map((d) => (
          <View
            key={d}
            style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
          >
            <Text
              style={{
                fontSize: theme.typography.fontSize.xs.size,
                color: theme.colors.mutedForeground,
                fontWeight: theme.typography.fontWeight
                  .medium as TextStyle["fontWeight"],
              }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week.key} style={{ flexDirection: "row" }}>
          {week.cells.map(({ key, day }) => {
            if (day === null) return <View key={key} style={{ flex: 1 }} />;
            const selected = isSelected(day);
            const disabled = isDisabled(day);
            const todayDay = isToday(day);
            return (
              <Pressable
                key={day}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  borderRadius: theme.borderRadius.full,
                  backgroundColor: selected
                    ? theme.colors.primaryBase
                    : "transparent",
                  opacity: disabled ? 0.3 : 1,
                }}
                onPress={() => {
                  if (!disabled) onSelect(new Date(year, month, day));
                }}
                disabled={disabled}
              >
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.sm.size,
                    fontWeight:
                      selected || todayDay
                        ? (theme.typography.fontWeight
                            .semibold as TextStyle["fontWeight"])
                        : (theme.typography.fontWeight
                            .normal as TextStyle["fontWeight"]),
                    color: selected
                      ? theme.colors.primaryForeground
                      : todayDay
                        ? theme.colors.primaryBase
                        : theme.colors.foreground,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
