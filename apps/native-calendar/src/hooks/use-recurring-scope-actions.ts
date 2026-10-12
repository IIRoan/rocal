import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type {
  CalendarEvent,
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { RecurringScope } from "../components/event/RecurringScopeModal";

function confirmDelete(onConfirm: () => void) {
  Alert.alert("Delete event?", "This action cannot be undone.", [
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
  onStartEdit: (scope?: RecurrenceEditScope, occurrenceDate?: string) => void;
  onDelete: (input: {
    scope?: RecurrenceDeleteScope;
    occurrenceDate?: string;
  }) => void;
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
      confirmDelete(() => onDelete({}));
      return;
    }
    setScopeAction("delete");
    setScopeVisible(true);
  }, [isRecurring, onDelete]);

  const handleScopeSelect = useCallback(
    (scope: RecurringScope) => {
      if (!scopeVisible) return;
      setScopeVisible(false);
      const occurrenceDate = event?.start
        ? new Date(event.start).toISOString()
        : undefined;
      if (scopeAction === "edit") onStartEdit(scope, occurrenceDate);
      else confirmDelete(() => onDelete({ scope, occurrenceDate }));
    },
    [scopeVisible, scopeAction, event, onStartEdit, onDelete],
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
