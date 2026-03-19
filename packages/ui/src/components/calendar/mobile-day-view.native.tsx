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
  eachHourOfInterval,
  format,
  getHours,
  getMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";
import type { CalendarEvent } from "./types";
import { eventOverlapsRange, isMultiDayEvent } from "./utils";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";

const MOBILE_START_HOUR = 0;
const MOBILE_END_HOUR = 23;
const MOBILE_CELL_HEIGHT = 60;
const TIME_COLUMN_WIDTH = 52;

interface MobileDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  workingDays?: number[];
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function MobileDayViewNative({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  timezone,
  workingDays = [1, 2, 3, 4, 5],
}: MobileDayViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MOBILE_START_HOUR),
      end: addHours(dayStart, MOBILE_END_HOUR),
    });
  }, [currentDate]);

  const allDayEvents = useMemo(
    () =>
      events.filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return (
          event.allDay ||
          isMultiDayEvent(event) ||
          (isSameDay(eventStart, currentDate) && isSameDay(eventEnd, currentDate) && false)
        );
      }).filter((event) => eventOverlapsRange(event, currentDate, currentDate, "day")),
    [events, currentDate],
  );

  const timeEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = addHours(dayStart, 24);

    return events
      .filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;
        return eventOverlapsRange(event, dayStart, dayEnd, "time");
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [currentDate, events]);

  const positionedEvents = useMemo(() => {
    const result: PositionedEvent[] = [];
    const dayStart = startOfDay(currentDate);
    const columns: { event: CalendarEvent; start: Date; end: Date }[][] = [];
    const eventColumnMap = new Map<CalendarEvent, number>();

    for (const event of timeEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const adjustedStart = isSameDay(currentDate, eventStart) ? eventStart : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd) ? eventEnd : addHours(dayStart, 24);

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

    for (const event of timeEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const adjustedStart = isSameDay(currentDate, eventStart) ? eventStart : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd) ? eventEnd : addHours(dayStart, 24);
      const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
      const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
      const top = startHour * MOBILE_CELL_HEIGHT;
      const height = Math.max((endHour - startHour) * MOBILE_CELL_HEIGHT, 26);
      const overlappingColumns =
        timeEvents.filter((other) => {
          if (other.id === event.id) return false;
          return areIntervalsOverlapping(
            { start: adjustedStart, end: adjustedEnd },
            { start: new Date(other.start), end: new Date(other.end) },
          );
        }).length + 1;
      const columnIndex = eventColumnMap.get(event) ?? 0;
      const gap = overlappingColumns === 1 ? 0.02 : 0.015;
      const width = overlappingColumns === 1 ? 0.96 : Math.max(0.28, (1 - gap * (overlappingColumns + 1)) / overlappingColumns);
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
  }, [currentDate, timeEvents]);

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "day",
    timezone,
  );

  useEffect(() => {
    if (hasScrolledRef.current) return;

    const now = new Date();
    const targetHour = isSameDay(currentDate, now)
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
      {!workingDays.includes(currentDate.getDay()) ? (
        <View style={styles.nonWorkingBanner}>
          <Text style={styles.nonWorkingBannerText}>Non-working day</Text>
        </View>
      ) : null}
      {allDayEvents.length > 0 ? (
        <View style={styles.allDaySection}>
          <Text style={styles.allDayLabel}>All day</Text>
          <View style={styles.allDayEvents}>
            {allDayEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => onEventSelect(event)}
                style={[
                  styles.allDayChip,
                  { backgroundColor: resolveEventBackground(event.color) },
                ]}
              >
                <Text style={styles.allDayChipText} numberOfLines={1}>
                  {event.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.timeline}>
          <View style={styles.timeColumn}>
            {hours.map((hour) => (
              <View key={hour.toISOString()} style={styles.timeCell}>
                <Text style={styles.timeLabel}>
                  {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.gridColumn}>
            {positionedEvents.map((positionedEvent) => (
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
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {format(new Date(positionedEvent.event.start), timeFormat === "24h" ? "HH:mm" : "h:mm a")}
                </Text>
              </Pressable>
            ))}

            {currentTimeVisible ? (
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
                        const startTime = new Date(currentDate);
                        startTime.setHours(hourValue, quarter * 15, 0, 0);
                        onEventCreate(startTime);
                      }}
                    />
                  ))}
                </View>
              );
            })}
          </View>
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
  nonWorkingBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff7ed",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#fed7aa",
  },
  nonWorkingBannerText: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
  },
  allDaySection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#d9e2ec",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  allDayLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  allDayEvents: {
    gap: 6,
  },
  allDayChip: {
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  allDayChipText: {
    color: "#1e3a8a",
    fontSize: 13,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  timeline: {
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
  gridColumn: {
    flex: 1,
    position: "relative",
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderColor: "#d9e2ec",
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
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: "hidden",
  },
  eventTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
  },
  eventMeta: {
    marginTop: 2,
    color: "#334155",
    fontSize: 10,
    fontWeight: "500",
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
    width: 8,
    height: 8,
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
