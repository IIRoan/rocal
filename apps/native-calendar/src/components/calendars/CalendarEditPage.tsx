import React, { useMemo, useState } from "react";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Calendar, EventColor } from "@workspace/calendar-core";
import { getErrorMessage, partitionCalendarsByKind } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  useCalendarShareLink,
  useCalendarShareLinkActions,
  useCalendars,
  useDeleteCalendar,
  useUpdateCalendar,
  type DeleteCalendarAction,
} from "../../hooks/use-calendar-management";
import {
  CALENDAR_NAME_MAX_LENGTH,
  validateCalendarName,
} from "../../lib/calendars-sheet-model";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { ColorPicker } from "../event/ColorPicker";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetGroupBlock,
  SheetMessage,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";

export function CalendarEditPage({ id }: { id: string }) {
  const calendarsQuery = useCalendars();
  const calendars = calendarsQuery.data;
  const calendar = calendars?.find((entry) => entry.id === id);

  if (calendarsQuery.isLoading) {
    return <SheetCenteredState loading message="Loading calendar…" />;
  }
  if (calendarsQuery.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(calendarsQuery.error, "Failed to load calendar")}
      />
    );
  }
  if (!calendar || !calendars) {
    return <SheetCenteredState tone="destructive" message="Calendar not found." />;
  }
  return <CalendarEditForm calendar={calendar} calendars={calendars} />;
}

function CalendarEditForm({ calendar, calendars }: { calendar: Calendar; calendars: Calendar[] }) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { back } = useSheetPageNavigator();
  const updateCalendar = useUpdateCalendar(calendar.id);
  const deleteCalendar = useDeleteCalendar(calendar.id);

  const [name, setName] = useState(calendar.name);
  const [color, setColor] = useState<EventColor>(calendar.color);
  const [isDefault, setIsDefault] = useState(calendar.isDefault);
  const [nameError, setNameError] = useState<string>();
  const [moveTargetId, setMoveTargetId] = useState<string>();

  const moveTargets = useMemo(
    () =>
      partitionCalendarsByKind(calendars).ownedCalendars.filter(
        (entry) => entry.id !== calendar.id,
      ),
    [calendar.id, calendars],
  );
  const selectedMoveTargetId = moveTargetId ?? moveTargets[0]?.id;
  const canDelete = !calendar.isDefault;

  const handleSave = () => {
    const error = validateCalendarName(name);
    setNameError(error);
    if (error) return;
    updateCalendar.mutate({ name: name.trim(), color, isDefault }, { onSuccess: back });
  };

  const confirmDelete = (action: DeleteCalendarAction) => {
    const moveTargetName = moveTargets.find((entry) => entry.id === selectedMoveTargetId)?.name;
    const message =
      action === "delete_events"
        ? "All events in this calendar will be permanently deleted."
        : `Events will be moved to ${moveTargetName ?? "the selected calendar"} before this calendar is deleted.`;

    Alert.alert(`Delete ${calendar.name}?`, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteCalendar.mutate(
            {
              action,
              moveTargetId: action === "move_events" ? selectedMoveTargetId : undefined,
            },
            { onSuccess: back },
          ),
      },
    ]);
  };

  const pendingDeleteAction = deleteCalendar.isPending ? deleteCalendar.variables?.action : undefined;

  return (
    <SheetScroll>
      <SheetSection title="Name">
        <SheetGroup>
          <SheetTextField
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameError(undefined);
            }}
            placeholder="Calendar name"
            maxLength={CALENDAR_NAME_MAX_LENGTH}
            accessibilityLabel="Calendar name"
          />
        </SheetGroup>
        {nameError ? <SheetMessage tone="destructive" text={nameError} /> : null}
      </SheetSection>

      <SheetSection title="Color">
        <SheetGroup>
          <SheetGroupBlock>
            <ColorPicker selectedColor={color} onColorSelect={setColor} />
          </SheetGroupBlock>
        </SheetGroup>
      </SheetSection>

      <SheetSection
        footer={
          calendar.isDefault
            ? "This is your default calendar. Make another calendar default to change it."
            : "New events are added to your default calendar."
        }
      >
        <SheetGroup>
          <SheetSwitchItem
            label="Default calendar"
            icon="star"
            value={isDefault}
            onValueChange={setIsDefault}
            disabled={calendar.isDefault}
          />
        </SheetGroup>
      </SheetSection>

      <SheetButton label="Save changes" onPress={handleSave} pending={updateCalendar.isPending} />

      <CalendarSharingSection calendarId={calendar.id} onCopied={() => toast("Share link copied")} />

      {canDelete && moveTargets.length > 0 ? (
        <SheetSection title="Move events to">
          <SheetGroup>
            {moveTargets.map((entry) => {
              const selected = entry.id === selectedMoveTargetId;
              return (
                <SheetItem
                  key={entry.id}
                  label={entry.name}
                  detail={entry.isDefault ? "Default" : undefined}
                  swatch={resolveCalendarSwatchColor(entry.color, theme)}
                  checked={selected}
                  onPress={() => setMoveTargetId(entry.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>
      ) : null}

      <SheetSection
        title="Delete calendar"
        footer={
          canDelete
            ? "Delete this calendar and its events, or move the events to another calendar first."
            : "Make another calendar default before deleting this one."
        }
      >
        <SheetGroup>
          {moveTargets.length > 0 ? (
            <SheetItem
              key="move"
              label="Move events and delete"
              icon="corner-down-right"
              tone="destructive"
              disabled={!canDelete || deleteCalendar.isPending}
              pending={pendingDeleteAction === "move_events"}
              onPress={() => confirmDelete("move_events")}
            />
          ) : null}
          <SheetItem
            key="delete"
            label="Delete calendar and events"
            icon="trash-2"
            tone="destructive"
            disabled={!canDelete || deleteCalendar.isPending}
            pending={pendingDeleteAction === "delete_events"}
            onPress={() => confirmDelete("delete_events")}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}

function CalendarSharingSection({
  calendarId,
  onCopied,
}: {
  calendarId: string;
  onCopied: () => void;
}) {
  const shareLinkQuery = useCalendarShareLink(calendarId);
  const { enable, disable } = useCalendarShareLinkActions(calendarId);
  const shareLink = shareLinkQuery.data;
  const busy = shareLinkQuery.isLoading || enable.isPending || disable.isPending;

  const handleToggle = (next: boolean) => {
    if (next) enable.mutate(false);
    else disable.mutate();
  };

  const confirmRegenerate = () => {
    Alert.alert(
      "Regenerate share link?",
      "The current link stops working. Anyone subscribed will need the new link.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Regenerate", style: "destructive", onPress: () => enable.mutate(true) },
      ],
    );
  };

  const handleCopy = async () => {
    if (!shareLink?.shareUrl) return;
    await Clipboard.setStringAsync(shareLink.shareUrl);
    onCopied();
  };

  return (
    <SheetSection
      title="Sharing"
      footer="Publishes a private ICS link for this calendar. Encrypted events must be reopened and saved before they appear in the feed."
    >
      <SheetGroup>
        <SheetSwitchItem
          key="toggle"
          label="ICS sharing"
          icon="link-2"
          value={shareLink?.enabled ?? false}
          onValueChange={handleToggle}
          disabled={busy}
        />
        {shareLink?.enabled && shareLink.shareUrl ? (
          <SheetItem
            key="copy"
            label="Copy link"
            detail={shareLink.shareUrl}
            icon="copy"
            onPress={() => void handleCopy()}
          />
        ) : null}
        {shareLink?.enabled ? (
          <SheetItem
            key="regenerate"
            label="Regenerate link"
            icon="refresh-cw"
            pending={enable.isPending && enable.variables === true}
            disabled={busy}
            onPress={confirmRegenerate}
          />
        ) : null}
      </SheetGroup>
    </SheetSection>
  );
}
