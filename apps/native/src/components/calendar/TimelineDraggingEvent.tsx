import { useMemo } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import {
  DraggingEvent,
  type DraggingEventProps,
  type SelectedEventType,
} from "@howljs/calendar-kit";
import { useTheme } from "../../providers/ThemeProvider";
import { TimelineEventContent } from "./TimelineEventContent";
import {
  resolveTimelineEventDensity,
  timelineEventTitleLines,
} from "./timeline-event-content";

function durationMinutesFromKitEvent(
  event: SelectedEventType | undefined,
): number {
  const start = event?.start && "dateTime" in event.start ? event.start.dateTime : undefined;
  const end = event?.end && "dateTime" in event.end ? event.end.dateTime : undefined;
  if (!start || !end) {
    return 60;
  }

  const minutes =
    (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

export function TimelineDraggingEvent(props: DraggingEventProps) {
  const { theme } = useTheme();
  const liftedStyle = useMemo<ViewStyle>(
    () => ({
      borderWidth: 0,
      borderRadius: theme.borderRadius.sm,
      overflow: "visible",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
        default: {},
      }),
    }),
    [theme.borderRadius.sm],
  );

  return (
    <DraggingEvent
      {...props}
      containerStyle={liftedStyle}
      TopEdgeComponent={<View />}
      BottomEdgeComponent={<View />}
      renderEvent={(event) => {
        const durationMinutes = durationMinutesFromKitEvent(event);
        const density = resolveTimelineEventDensity({
          durationMinutes,
          allDay: false,
        });

        return (
          <View style={styles.chip}>
            <TimelineEventContent
              title={event?.title ?? ""}
              titleColor={
                event?.titleColor ?? theme.colors.primaryForeground
              }
              density={density}
              titleLines={timelineEventTitleLines(density, durationMinutes)}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 4,
  } satisfies ViewStyle,
});
