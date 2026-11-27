import React, { useRef, useState } from "react";
import { CATEGORY_NAME_MAX_LENGTH, validateCategoryName, type EventColor } from "@workspace/calendar-core";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetButton,
  SheetGroup,
  SheetGroupBlock,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useCategories, useCreateCategory } from "../../hooks/use-categories";
import { ColorPicker } from "../event/ColorPicker";

export function CategoryCreatePage() {
  const { back } = useSheetPageNavigator();
  const categoriesQuery = useCategories();
  const createCategory = useCreateCategory();
  const name = useRef("");
  const [color, setColor] = useState<EventColor>("blue");
  const [nameError, setNameError] = useState<string>();

  const handleCreate = () => {
    const error = validateCategoryName(name.current, categoriesQuery.data ?? []);
    setNameError(error);
    if (error) return;
    createCategory.mutate({ name: name.current.trim(), color }, { onSuccess: back });
  };

  return (
    <SheetScroll>
      <SheetSection title="Name">
        <SheetGroup>
          <SheetTextField
            // Uncontrolled: on Android a re-render pushing a stale `value` wiped text the keyboard had just entered.
            onChangeText={(value) => {
              name.current = value;
              setNameError(undefined);
            }}
            placeholder="Category name"
            autoFocus
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            accessibilityLabel="Category name"
            testID="category-name"
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

      <SheetButton
        label="Create category"
        onPress={handleCreate}
        pending={createCategory.isPending}
      />
    </SheetScroll>
  );
}
