import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatReminderShort } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { EventEditorListRow } from "./EventEditorPrimitives";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormReminderRows({
  reminders,
  canAdd,
  styles,
  onOpen,
  onRemove,
}: {
  reminders: number[];
  canAdd: boolean;
  styles: EventFormStyles;
  onOpen: (index: number | null) => void;
  onRemove: (minutes: number) => void;
}) {
  const { theme } = useTheme();
  return (
    <>
      {reminders.map((minutes, index) => {
        const label = `${formatReminderShort(minutes)} before`;
        return (
          <EventEditorListRow
            key={minutes}
            icon={index === 0 ? "bell" : undefined}
            label={label}
            accessibilityLabel={`Reminder: ${label}`}
            onPress={() => onOpen(index)}
          >
            <Pressable
              onPress={() => onRemove(minutes)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.reminderRemove,
                pressed && styles.reminderRemovePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Remove reminder ${label}`}
            >
              <Feather
                name="x"
                size={16}
                color={theme.colors.mutedForeground}
              />
            </Pressable>
          </EventEditorListRow>
        );
      })}
      {canAdd ? (
        <EventEditorListRow
          icon={reminders.length === 0 ? "bell" : "plus"}
          label={
            reminders.length === 0 ? "Add reminder" : "Add another reminder"
          }
          muted
          onPress={() => onOpen(null)}
        />
      ) : null}
    </>
  );
}
