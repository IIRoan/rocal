import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { addDays, format, isToday, startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { AgendaDaysToShow } from "./constants";
import type { CalendarEvent } from "./types";
import { getAgendaEventsForDay } from "./utils";
import { cn } from "../../lib/utils";

const EVENT_INDICATOR_CLASSES: Record<string, string> = {
  blue: "bg-event-sky",
  sky: "bg-event-sky",
  violet: "bg-event-violet",
  purple: "bg-event-violet",
  orange: "bg-event-orange",
  rose: "bg-event-rose",
  emerald: "bg-event-emerald",
  green: "bg-event-emerald",
};

interface MobileAgendaViewNativeProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
}

export function MobileAgendaViewNative({
  currentDate,
  events,
  onEventSelect,
  timeFormat = "24h",
  timezone,
}: MobileAgendaViewNativeProps) {
  const sections = useMemo(() => {
    const rangeStart = startOfDay(currentDate);

    return Array.from({ length: AgendaDaysToShow }, (_, index) => addDays(rangeStart, index))
      .map((day) => ({ day, dayEvents: getAgendaEventsForDay(events, day) }))
      .filter((section) => section.dayEvents.length > 0);
  }, [currentDate, events]);

  if (sections.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-16">
        <Text className="text-lg font-medium text-foreground">No events found</Text>
        <Text className="mt-1 text-center text-sm text-muted-foreground">
          There are no events scheduled for this time period.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 border-t border-border/70 bg-background">
      <View className="gap-10 px-4 py-4 pb-24">
        {sections.map((section, index) => (
          <View key={section.day.toISOString()} className={cn("border-border/70 border-t pt-4", index === 0 && "mt-0")}>
            <Text
              className={cn(
                "mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground",
                isToday(section.day) && "text-primary",
              )}
            >
              {format(section.day, "d MMM, EEEE")}
            </Text>

            <View className="gap-2">
              {section.dayEvents.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => onEventSelect(event)}
                  className="min-h-11 flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                  accessibilityRole="button"
                >
                  <View className={cn("mt-1 size-2.5 rounded-full", getEventIndicatorClass(event.color))} />

                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      {formatEventTimeRange(event, timeFormat, timezone)}
                    </Text>
                    {event.location ? (
                      <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
                        {event.location}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function getEventIndicatorClass(color?: string | null) {
  if (!color) return "bg-event-default";
  return EVENT_INDICATOR_CLASSES[color.toLowerCase()] ?? "bg-event-default";
}

function formatEventTimeRange(
  event: CalendarEvent,
  timeFormat: "12h" | "24h",
  timezone?: string,
) {
  if (event.allDay) return "All day";

  const start = new Date(event.start);
  const end = new Date(event.end);
  const token = timeFormat === "24h" ? "HH:mm" : "h:mm a";

  const startLabel = timezone ? formatInTimeZone(start, timezone, token) : format(start, token);
  const endLabel = timezone ? formatInTimeZone(end, timezone, token) : format(end, token);

  return `${startLabel} - ${endLabel}`;
}
