import { View } from "react-native";
import type { TimeFormat } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useUserWeekStartDay } from "@workspace/native-core/hooks/use-user-week-start-day";
import {
  SheetActions,
  SheetPrimaryButton,
} from "@workspace/native-core/components/sheet";
import { PickerSheet } from "./EventPickerSheets";
import { CalendarGrid } from "./CalendarGrid";
import { TimeWheelPicker } from "./TimeWheelPicker";
import type { EventFormStyles } from "./event-form-styles";
import type { DateTimeTarget } from "./use-event-form-state";

const DATE_TIME_TITLES: Record<DateTimeTarget, string> = {
  "start-date": "Start date",
  "start-time": "Start time",
  "end-date": "End date",
  "end-time": "End time",
};

export function EventFormDateTimeSheet({
  visible,
  target,
  startWallClock,
  endWallClock,
  timeFormat,
  bottomInset,
  styles,
  onClose,
  onStartDate,
  onEndDate,
  onStartTime,
  onEndTime,
}: {
  visible: boolean;
  target: DateTimeTarget;
  startWallClock: Date;
  endWallClock: Date;
  timeFormat: TimeFormat;
  bottomInset: number;
  styles: EventFormStyles;
  onClose: () => void;
  onStartDate: (date: Date) => void;
  onEndDate: (date: Date) => void;
  onStartTime: (time: Date) => void;
  onEndTime: (time: Date) => void;
}) {
  const { theme } = useTheme();
  const weekStartDay = useUserWeekStartDay();
  const isStart = target === "start-date" || target === "start-time";
  const isDate = target === "start-date" || target === "end-date";
  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={DATE_TIME_TITLES[target]}
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.7}
    >
      <View style={styles.dateTimeSheetBody}>
        {isDate ? (
          <CalendarGrid
            key={target}
            selectedDate={isStart ? startWallClock : endWallClock}
            onSelect={isStart ? onStartDate : onEndDate}
            minDate={isStart ? undefined : startWallClock}
            weekStartDay={weekStartDay ?? 1}
            theme={theme}
          />
        ) : (
          <>
            <TimeWheelPicker
              key={target}
              value={isStart ? startWallClock : endWallClock}
              onChange={isStart ? onStartTime : onEndTime}
              timeFormat={timeFormat}
              accessibilityLabel={DATE_TIME_TITLES[target]}
            />
            <View style={styles.dateTimeSheetActions}>
              <SheetActions chrome={false}>
                <SheetPrimaryButton label="Done" onPress={onClose} />
              </SheetActions>
            </View>
          </>
        )}
      </View>
    </PickerSheet>
  );
}
