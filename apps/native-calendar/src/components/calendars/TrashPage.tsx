import React from "react";
import { Alert } from "react-native";
import {
  EVENT_TRASH_EMPTY_MESSAGE,
  formatTrashEntryDetail,
  getErrorMessage,
  type TrashedCalendarEvent,
} from "@workspace/calendar-core";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useEventTrash } from "../../hooks/use-event-trash";

/** Deleted events of the last 30 days, with titles opened on this device. */
export function TrashPage() {
  const timezone = useUserTimezone();
  const { trash, restore, deleteForever, empty } = useEventTrash();

  if (trash.isPending) {
    return <SheetCenteredState loading message="Loading deleted events…" />;
  }
  if (trash.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(trash.error, "Failed to load deleted events")}
      />
    );
  }
  if (trash.data.length === 0) {
    return <SheetCenteredState message={EVENT_TRASH_EMPTY_MESSAGE} />;
  }

  const openEntry = (entry: TrashedCalendarEvent) =>
    Alert.alert(entry.title, formatTrashEntryDetail(entry, timezone), [
      {
        text: "Restore",
        onPress: () => restore.mutate({ trashId: entry.id, calendarId: entry.calendarId }),
      },
      { text: "Delete forever", style: "destructive", onPress: () => deleteForever.mutate(entry.id) },
      { text: "Cancel", style: "cancel" },
    ]);

  const confirmEmpty = () =>
    Alert.alert("Empty the trash?", "Every event in the trash is deleted for good. This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Empty trash", style: "destructive", onPress: () => empty.mutate() },
    ]);

  return (
    <SheetScroll>
      <SheetSection footer="Deleted events stay here for 30 days.">
        <SheetGroup>
          {trash.data.map((entry) => (
            <SheetItem
              key={entry.id}
              label={entry.title}
              detail={formatTrashEntryDetail(entry, timezone)}
              onPress={() => openEntry(entry)}
            />
          ))}
        </SheetGroup>
      </SheetSection>
      <SheetSection>
        <SheetGroup>
          <SheetItem
            label="Empty trash"
            icon="trash-2"
            tone="destructive"
            pending={empty.isPending}
            disabled={empty.isPending}
            onPress={confirmEmpty}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
