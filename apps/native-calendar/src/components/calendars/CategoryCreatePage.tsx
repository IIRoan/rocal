import React, { useState } from "react";
import type { EventColor } from "@workspace/calendar-core";
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
import { CATEGORY_NAME_MAX_LENGTH, validateCategoryName } from "../../lib/categories-model";
import { ColorPicker } from "../event/ColorPicker";

export function CategoryCreatePage() {
  const { back } = useSheetPageNavigator();
  const categoriesQuery = useCategories();
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [nameError, setNameError] = useState<string>();

  const handleCreate = () => {
    const error = validateCategoryName(name, categoriesQuery.data ?? []);
    setNameError(error);
    if (error) return;
    createCategory.mutate({ name: name.trim(), color }, { onSuccess: back });
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
            placeholder="Category name"
            autoFocus
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            accessibilityLabel="Category name"
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
