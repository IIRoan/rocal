import React, { useState } from "react";
import type { EventColor } from "@workspace/calendar-core";
import { useCreateCalendar } from "../../hooks/use-calendar-management";
import {
  CALENDAR_NAME_MAX_LENGTH,
  validateCalendarName,
} from "../../lib/calendars-sheet-model";
import { ColorPicker } from "../event/ColorPicker";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetButton,
  SheetGroup,
  SheetGroupBlock,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";

export function CalendarCreatePage() {
  const { back } = useSheetPageNavigator();
  const createCalendar = useCreateCalendar();
  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [isDefault, setIsDefault] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const handleCreate = () => {
    const error = validateCalendarName(name);
    setNameError(error);
    if (error) return;
    createCalendar.mutate({ name: name.trim(), color, isDefault }, { onSuccess: back });
  };

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
            autoFocus
            maxLength={CALENDAR_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
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

      <SheetSection footer="New events are added to your default calendar.">
        <SheetGroup>
          <SheetSwitchItem
            label="Default calendar"
            icon="star"
            value={isDefault}
            onValueChange={setIsDefault}
          />
        </SheetGroup>
      </SheetSection>

      <SheetButton
        label="Create calendar"
        onPress={handleCreate}
        pending={createCalendar.isPending}
      />
    </SheetScroll>
  );
}
