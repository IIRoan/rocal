import { View } from "react-native";
import type { Calendar } from "@workspace/calendar-core";
import { EventEditorListRow } from "./EventEditorPrimitives";
import { EventFormReminderRows } from "./EventFormReminderRows";
import { FieldError } from "./FieldError";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormCalendarRows({
  selectedCalendar,
  swatchColor,
  calendarError,
  showCategory,
  categoryLabel,
  hasCategory,
  reminders,
  canAddReminder,
  styles,
  onOpenCalendar,
  onOpenCategory,
  onOpenReminder,
  onRemoveReminder,
}: {
  selectedCalendar?: Calendar;
  swatchColor: string;
  calendarError?: string;
  showCategory: boolean;
  categoryLabel: string;
  hasCategory: boolean;
  reminders: number[];
  canAddReminder: boolean;
  styles: EventFormStyles;
  onOpenCalendar: () => void;
  onOpenCategory: () => void;
  onOpenReminder: (index: number | null) => void;
  onRemoveReminder: (minutes: number) => void;
}) {
  const calendarLabel = selectedCalendar?.name ?? "Select calendar";
  return (
    <View>
      <EventEditorListRow
        swatchColor={swatchColor}
        label={calendarLabel}
        muted={!selectedCalendar}
        accessibilityLabel={`Calendar: ${calendarLabel}`}
        onPress={onOpenCalendar}
      />
      <FieldError message={calendarError} style={styles.fieldError} />
      {showCategory ? (
        <EventEditorListRow
          icon="tag"
          label={categoryLabel}
          muted={!hasCategory}
          accessibilityLabel={`Category: ${categoryLabel}`}
          onPress={onOpenCategory}
        />
      ) : null}
      <EventFormReminderRows
        reminders={reminders}
        canAdd={canAddReminder}
        styles={styles}
        onOpen={onOpenReminder}
        onRemove={onRemoveReminder}
      />
    </View>
  );
}
