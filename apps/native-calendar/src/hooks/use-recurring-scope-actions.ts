import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type {
  CalendarEvent,
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { RecurringScope } from "../components/event/RecurringScopeModal";

/** Whole events and series go to the trash; one occurrence or the rest of a series is deleted for good. */
function confirmDelete(scope: RecurrenceDeleteScope | undefined, onConfirm: () => void) {
  const permanent = scope === "this_only" || scope === "this_and_future";
  Alert.alert("Delete event?", permanent ? "This action cannot be undone." : "It moves to Trash for 30 days.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

export function useRecurringScopeActions({
  event,
  onStartEdit,
  onDelete,
}: {
  event: CalendarEvent | undefined;
  onStartEdit: (scope?: RecurrenceEditScope) => void;
  onDelete: (input: { scope?: RecurrenceDeleteScope }) => void;
}) {
  // The action outlives the prompt so the modal keeps its title while fading out.
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");
  const [scopeVisible, setScopeVisible] = useState(false);
  const isRecurring = !!(event?.recurrence || event?.parentEventId);

  const handleEditPress = useCallback(() => {
    if (!isRecurring) {
      onStartEdit();
      return;
    }
    setScopeAction("edit");
    setScopeVisible(true);
  }, [isRecurring, onStartEdit]);

  const handleDeletePress = useCallback(() => {
    if (!isRecurring) {
      confirmDelete(undefined, () => onDelete({}));
      return;
    }
    setScopeAction("delete");
    setScopeVisible(true);
  }, [isRecurring, onDelete]);

  const handleScopeSelect = useCallback(
    (scope: RecurringScope) => {
      if (!scopeVisible) return;
      setScopeVisible(false);
      if (scopeAction === "edit") onStartEdit(scope);
      else confirmDelete(scope, () => onDelete({ scope }));
    },
    [scopeVisible, scopeAction, onStartEdit, onDelete],
  );

  const closeScopePrompt = useCallback(() => setScopeVisible(false), []);

  return {
    scopeAction,
    scopeVisible,
    closeScopePrompt,
    handleEditPress,
    handleDeletePress,
    handleScopeSelect,
  };
}
