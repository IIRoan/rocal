import { View } from "react-native";
import type { RecurrenceRule } from "@workspace/calendar-core";
import { Switch } from "@workspace/native-core/components/ui/Switch";
import { EventEditorListRow } from "./EventEditorPrimitives";
import { RecurrencePicker } from "./RecurrencePicker";

export function EventFormRepeatRows({
  allDay,
  repeatLabel,
  recurrenceRule,
  showCustomRepeat,
  onToggleAllDay,
  onOpenRepeat,
  onRuleChange,
}: {
  allDay: boolean;
  repeatLabel: string;
  recurrenceRule: RecurrenceRule | null;
  showCustomRepeat: boolean;
  onToggleAllDay: () => void;
  onOpenRepeat: () => void;
  onRuleChange: (rule: RecurrenceRule) => void;
}) {
  return (
    <>
      <View>
        <EventEditorListRow
          icon="sun"
          label="All day"
          onPress={onToggleAllDay}
          accessibilityRole="switch"
          accessibilityState={{ checked: allDay }}
        >
          <Switch value={allDay} />
        </EventEditorListRow>
        <EventEditorListRow
          icon="repeat"
          label={repeatLabel}
          muted={!recurrenceRule}
          accessibilityLabel={`Repeat: ${repeatLabel}`}
          onPress={onOpenRepeat}
        />
      </View>

      {showCustomRepeat && recurrenceRule && (
        <RecurrencePicker rule={recurrenceRule} onChange={onRuleChange} />
      )}
    </>
  );
}
