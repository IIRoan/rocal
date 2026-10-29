import React, { useMemo, useReducer } from "react";
import { Alert } from "react-native";
import type { Calendar, EventColor } from "@workspace/calendar-core";
import { getErrorMessage, partitionCalendarsByKind } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
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
  return <CalendarEditForm key={calendar.id} calendar={calendar} calendars={calendars} />;
}

interface CalendarDraft {
  name: string;
  color: EventColor;
  isDefault: boolean;
  nameError?: string;
  moveTargetId?: string;
}

type CalendarDraftAction =
  | { type: "name"; name: string }
  | { type: "color"; color: EventColor }
  | { type: "default"; isDefault: boolean }
  | { type: "move-target"; id: string }
  | { type: "validated"; nameError?: string };

function initCalendarDraft(calendar: Calendar): CalendarDraft {
  return { name: calendar.name, color: calendar.color, isDefault: calendar.isDefault };
}

function calendarDraftReducer(draft: CalendarDraft, action: CalendarDraftAction): CalendarDraft {
  switch (action.type) {
    case "name":
      return { ...draft, name: action.name, nameError: undefined };
    case "color":
      return { ...draft, color: action.color };
    case "default":
      return { ...draft, isDefault: action.isDefault };
    case "move-target":
      return { ...draft, moveTargetId: action.id };
    case "validated":
      return { ...draft, nameError: action.nameError };
  }
}

function CalendarEditForm({ calendar, calendars }: { calendar: Calendar; calendars: Calendar[] }) {
  const { theme } = useTheme();
  const { back } = useSheetPageNavigator();
  const updateCalendar = useUpdateCalendar(calendar.id);
  const deleteCalendar = useDeleteCalendar(calendar.id);
  const [{ name, color, isDefault, nameError, moveTargetId }, dispatch] = useReducer(
    calendarDraftReducer,
    calendar,
    initCalendarDraft,
  );

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
    dispatch({ type: "validated", nameError: error });
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
            onChangeText={(value) => dispatch({ type: "name", name: value })}
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
            <ColorPicker
              selectedColor={color}
              onColorSelect={(value) => dispatch({ type: "color", color: value })}
            />
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
            onValueChange={(value) => dispatch({ type: "default", isDefault: value })}
            disabled={calendar.isDefault}
          />
        </SheetGroup>
      </SheetSection>

      <SheetButton label="Save changes" onPress={handleSave} pending={updateCalendar.isPending} />

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
                  onPress={() => dispatch({ type: "move-target", id: entry.id })}
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
