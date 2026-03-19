import React, { useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  addHours,
  areIntervalsOverlapping,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "./types";
import { eventOverlapsRange, isMultiDayEvent } from "./utils";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";

const MOBILE_START_HOUR = 0;
const MOBILE_END_HOUR = 23;
const MOBILE_CELL_HEIGHT = 52;
const TIME_COLUMN_WIDTH = 52;
const DAY_COLUMN_WIDTH = 92;

interface MobileWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function MobileWeekViewNative({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
}: MobileWeekViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, weekStartDay]);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MOBILE_START_HOUR),
      end: addHours(dayStart, MOBILE_END_HOUR),
    });
  }, [currentDate]);

  const dayEvents = useMemo(
    () =>
      days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = addHours(dayStart, 24);
        return events
          .filter((event) => {
            if (event.allDay || isMultiDayEvent(event)) return false;
            return eventOverlapsRange(event, dayStart, dayEnd, "time");
          })
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      }),
    [days, events],
  );

  const positionedEvents = useMemo(
    () =>
      days.map((day, dayIndex) => {
        const result: PositionedEvent[] = [];
        const dayStart = startOfDay(day);
        const columns: { event: CalendarEvent; start: Date; end: Date }[][] = [];
        const eventColumnMap = new Map<CalendarEvent, number>();

        for (const event of dayEvents[dayIndex] ?? []) {
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
          const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);

          let columnIndex = 0;
          let placed = false;
          while (!placed) {
            const column = columns[columnIndex] || [];
            if (
              column.every((item) =>
                !areIntervalsOverlapping(
                  { start: adjustedStart, end: adjustedEnd },
                  { start: item.start, end: item.end },
                ),
              )
            ) {
              columns[columnIndex] = column;
              column.push({ event, start: adjustedStart, end: adjustedEnd });
              eventColumnMap.set(event, columnIndex);
              placed = true;
            } else {
              columnIndex += 1;
            }
          }
        }

        for (const event of dayEvents[dayIndex] ?? []) {
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
          const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);
          const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
          const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
          const top = startHour * MOBILE_CELL_HEIGHT;
          const height = Math.max((endHour - startHour) * MOBILE_CELL_HEIGHT, 24);
          const overlaps =
            (dayEvents[dayIndex] ?? []).filter((other) => {
              if (other.id === event.id) return false;
              return areIntervalsOverlapping(
                { start: adjustedStart, end: adjustedEnd },
                { start: new Date(other.start), end: new Date(other.end) },
              );
            }).length + 1;
          const columnIndex = eventColumnMap.get(event) ?? 0;
          const gap = 0.02;
          const width = overlaps === 1 ? 0.96 : Math.max(0.28, (1 - gap * (overlaps + 1)) / overlaps);
          const left = gap + columnIndex * (width + gap);

          result.push({
            event,
            top,
            height,
            left,
            width,
            zIndex: 10 + columnIndex,
          });
        }

        return result;
      }),
    [dayEvents, days],
  );

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
    timezone,
  );

  useEffect(() => {
    if (hasScrolledRef.current) return;

    const now = new Date();
    const targetHour = isToday(currentDate)
      ? now.getHours() + now.getMinutes() / 60
      : 9;

    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetHour * MOBILE_CELL_HEIGHT - 160),
        animated: true,
      });
      hasScrolledRef.current = true;
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [currentDate]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.headerRow}>
            <View style={styles.timeHeaderSpacer} />
            {days.map((day) => (
              <View
                key={day.toISOString()}
                style={[
                  styles.dayHeader,
                  isToday(day) ? styles.dayHeaderToday : null,
                  workingDays.includes(day.getDay()) ? styles.dayHeaderWorkday : null,
                ]}
              >
                <Text style={[styles.dayHeaderWeekday, isToday(day) ? styles.dayHeaderWeekdayToday : null]}>
                  {format(day, "EEE")}
                </Text>
                <Text style={[styles.dayHeaderDate, isToday(day) ? styles.dayHeaderDateToday : null]}>
                  {format(day, "d")}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView ref={scrollRef} style={styles.verticalScroll} contentContainerStyle={styles.verticalContent}>
            <View style={styles.timelineRow}>
              <View style={styles.timeColumn}>
                {hours.map((hour) => (
                  <View key={hour.toISOString()} style={styles.timeCell}>
                    <Text style={styles.timeLabel}>
                      {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
                    </Text>
                  </View>
                ))}
              </View>

              {days.map((day, dayIndex) => (
                <View
                  key={day.toISOString()}
                  style={[styles.dayColumn, isToday(day) ? styles.dayColumnToday : null]}
                >
                  {(positionedEvents[dayIndex] ?? []).map((positionedEvent) => (
                    <Pressable
                      key={positionedEvent.event.id}
                      onPress={() => onEventSelect(positionedEvent.event)}
                      style={[
                        styles.eventCard,
                        {
                          top: positionedEvent.top,
                          height: positionedEvent.height,
                          left: `${positionedEvent.left * 100}%`,
                          width: `${positionedEvent.width * 100}%`,
                          zIndex: positionedEvent.zIndex,
                          backgroundColor: resolveEventBackground(positionedEvent.event.color),
                          borderColor: resolveEventBorder(positionedEvent.event.color),
                        },
                      ]}
                    >
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {positionedEvent.event.title}
                      </Text>
                    </Pressable>
                  ))}

                  {currentTimeVisible && isToday(day) ? (
                    <View
                      pointerEvents="none"
                      style={[styles.currentTimeLine, { top: `${currentTimePosition}%` }]}
                    >
                      <View style={styles.currentTimeDot} />
                      <View style={styles.currentTimeBar} />
                    </View>
                  ) : null}

                  {hours.map((hour) => {
                    const hourValue = getHours(hour);
                    return (
                      <View key={hour.toISOString()} style={styles.gridHourCell}>
                        {[0, 1, 2, 3].map((quarter) => (
                          <Pressable
                            key={`${hour.toISOString()}-${quarter}`}
                            style={[
                              styles.tapTarget,
                              { top: quarter * (MOBILE_CELL_HEIGHT / 4), height: MOBILE_CELL_HEIGHT / 4 },
                            ]}
                            onPress={() => {
                              const startTime = new Date(day);
                              startTime.setHours(hourValue, quarter * 15, 0, 0);
                              onEventCreate(startTime);
                            }}
                          />
                        ))}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function resolveEventBackground(color?: string | null) {
  if (color?.startsWith("#")) return `${color}22`;
  return "#dbeafe";
}

function resolveEventBorder(color?: string | null) {
  if (color?.startsWith("#")) return color;
  return "#60a5fa";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderColor: "#d9e2ec",
  },
  timeHeaderSpacer: {
    width: TIME_COLUMN_WIDTH,
  },
  dayHeader: {
    width: DAY_COLUMN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderColor: "#d9e2ec",
  },
  dayHeaderWorkday: {
    backgroundColor: "#f8fafc",
  },
  dayHeaderToday: {
    backgroundColor: "#eff6ff",
  },
  dayHeaderWeekday: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dayHeaderWeekdayToday: {
    color: "#2563eb",
  },
  dayHeaderDate: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  dayHeaderDateToday: {
    color: "#2563eb",
  },
  verticalScroll: {
    flex: 1,
  },
  verticalContent: {
    paddingBottom: 16,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timeColumn: {
    width: TIME_COLUMN_WIDTH,
    backgroundColor: "#f8fafc",
  },
  timeCell: {
    height: MOBILE_CELL_HEIGHT,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingRight: 8,
  },
  timeLabel: {
    marginTop: -8,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 2,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
  },
  dayColumn: {
    width: DAY_COLUMN_WIDTH,
    position: "relative",
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderColor: "#d9e2ec",
  },
  dayColumnToday: {
    backgroundColor: "#f8fbff",
  },
  gridHourCell: {
    height: MOBILE_CELL_HEIGHT,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    position: "relative",
  },
  tapTarget: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  eventCard: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: "hidden",
  },
  eventTitle: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "700",
  },
  currentTimeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 30,
  },
  currentTimeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    marginLeft: -4,
  },
  currentTimeBar: {
    flex: 1,
    height: 2,
    backgroundColor: "#ef4444",
  },
});
