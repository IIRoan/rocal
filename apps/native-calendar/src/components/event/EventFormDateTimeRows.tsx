import { View } from "react-native";
// repo-rules-allow timezone-safe-calendar-code: format() renders the picker's local wall-clock carriers, never event instants.
import { format } from "date-fns";
import type { TimeFormat } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  EventEditorFieldButton,
  EventEditorPairArrow,
} from "./EventEditorPrimitives";
import type { EventFormStyles } from "./event-form-styles";
import type { DateTimeTarget } from "./use-event-form-state";
import { formatPickerTime } from "./time-wheel-utils";

export function EventFormDateTimeRows({
  startWallClock,
  endWallClock,
  allDay,
  endBeforeStart,
  timeFormat,
  styles,
  onOpen,
}: {
  startWallClock: Date;
  endWallClock: Date;
  allDay: boolean;
  endBeforeStart: boolean;
  timeFormat: TimeFormat;
  styles: EventFormStyles;
  onOpen: (target: DateTimeTarget) => void;
}) {
  const { theme } = useTheme();
  return (
    <>
      <View style={styles.pairRow}>
        <EventEditorFieldButton
          icon="calendar"
          label={format(startWallClock, "EEE, MMM d")}
          accessibilityLabel={`Start date: ${format(startWallClock, "EEEE, MMMM d")}`}
          onPress={() => onOpen("start-date")}
          style={styles.pairItem}
        />
        <EventEditorPairArrow color={theme.colors.mutedForeground} />
        <EventEditorFieldButton
          label={format(endWallClock, "EEE, MMM d")}
          accessibilityLabel={`End date: ${format(endWallClock, "EEEE, MMMM d")}`}
          invalid={endBeforeStart}
          onPress={() => onOpen("end-date")}
          style={styles.pairItem}
        />
      </View>

      {!allDay ? (
        <View style={styles.pairRow}>
          <EventEditorFieldButton
            icon="clock"
            label={formatPickerTime(startWallClock, timeFormat)}
            accessibilityLabel={`Start time: ${formatPickerTime(startWallClock, timeFormat)}`}
            onPress={() => onOpen("start-time")}
            style={styles.pairItem}
          />
          <EventEditorPairArrow color={theme.colors.mutedForeground} />
          <EventEditorFieldButton
            label={formatPickerTime(endWallClock, timeFormat)}
            accessibilityLabel={`End time: ${formatPickerTime(endWallClock, timeFormat)}`}
            invalid={endBeforeStart}
            onPress={() => onOpen("end-time")}
            style={styles.pairItem}
          />
        </View>
      ) : null}
    </>
  );
}
