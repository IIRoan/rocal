import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
  getEventDeleteConfirmCopy,
  type CalendarEvent,
  type RecurrenceDeleteScope,
  type RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { RecurringScope } from "../components/event/RecurringScopeModal";

function confirmDelete(
  event: CalendarEvent,
  scope: RecurrenceDeleteScope | undefined,
  onConfirm: () => void,
) {
  Alert.alert("Delete event?", getEventDeleteConfirmCopy(event, scope).description, [
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
    if (!event) return;
    if (!isRecurring) {
      confirmDelete(event, undefined, () => onDelete({}));
      return;
    }
    setScopeAction("delete");
    setScopeVisible(true);
  }, [event, isRecurring, onDelete]);

  const handleScopeSelect = useCallback(
    (scope: RecurringScope) => {
      if (!scopeVisible) return;
      setScopeVisible(false);
      if (scopeAction === "edit") onStartEdit(scope);
      else if (event) confirmDelete(event, scope, () => onDelete({ scope }));
    },
    [event, scopeVisible, scopeAction, onStartEdit, onDelete],
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
