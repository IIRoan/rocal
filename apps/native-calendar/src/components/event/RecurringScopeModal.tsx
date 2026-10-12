import { Modal, Pressable, Text, View } from "react-native";
import type {
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { EventSheetStyles } from "./event-sheet-styles";

export type RecurringScope = RecurrenceEditScope & RecurrenceDeleteScope;

const SCOPE_OPTIONS: { label: string; scope: RecurringScope }[] = [
  { label: "This occurrence", scope: "this_only" },
  { label: "This and future", scope: "this_and_future" },
  { label: "All occurrences", scope: "all" },
];

export function RecurringScopeModal({
  action,
  visible,
  styles,
  onSelect,
  onClose,
}: {
  action: "edit" | "delete";
  visible: boolean;
  styles: EventSheetStyles;
  onSelect: (scope: RecurringScope) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View
          style={styles.modalContent}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.modalTitle}>
            {action === "edit"
              ? "Edit recurring event"
              : "Delete recurring event"}
          </Text>
          {SCOPE_OPTIONS.map((option) => (
            <Pressable
              key={option.scope}
              style={styles.scopeOption}
              onPress={() => onSelect(option.scope)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              <Text style={styles.scopeOptionText}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.cancelOption}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelOptionText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
