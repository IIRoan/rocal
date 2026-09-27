import React, { useState } from "react";
import { Alert } from "react-native";
import {
  getErrorMessage,
  type EventCategory,
  type EventColor,
} from "@workspace/calendar-core";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetGroupBlock,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import {
  useCategories,
  useDeleteCategory,
  useUpdateCategory,
} from "../../hooks/use-categories";
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryUsageDetail,
  validateCategoryName,
} from "../../lib/categories-model";
import { ColorPicker } from "../event/ColorPicker";

export function CategoryEditPage({ id }: { id: string }) {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data;
  const category = categories?.find((entry) => entry.id === id);

  if (categoriesQuery.isLoading) {
    return <SheetCenteredState loading message="Loading category…" />;
  }
  if (categoriesQuery.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(categoriesQuery.error, "Failed to load category")}
      />
    );
  }
  if (!category || !categories) {
    return <SheetCenteredState tone="destructive" message="Category not found." />;
  }
  return <CategoryEditForm category={category} categories={categories} />;
}

function CategoryEditForm({
  category,
  categories,
}: {
  category: EventCategory;
  categories: EventCategory[];
}) {
  const { back } = useSheetPageNavigator();
  const updateCategory = useUpdateCategory(category.id);
  const deleteCategory = useDeleteCategory(category.id);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<EventColor>(category.color);
  const [nameError, setNameError] = useState<string>();

  const handleSave = () => {
    const error = validateCategoryName(name, categories, category.id);
    setNameError(error);
    if (error) return;
    const trimmed = name.trim();
    if (trimmed === category.name && color === category.color) {
      back();
      return;
    }
    updateCategory.mutate(
      {
        ...(trimmed !== category.name ? { name: trimmed } : {}),
        ...(color !== category.color ? { color } : {}),
      },
      { onSuccess: back },
    );
  };

  const confirmDelete = () => {
    const usage = categoryUsageDetail(category);
    Alert.alert(
      `Delete ${category.name}?`,
      usage
        ? `${usage} will keep their details but lose this category.`
        : "This category is not used by any events.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          // The optimistic removal unmounts this category, so leave the page right away.
          onPress: () => {
            deleteCategory.mutate();
            back();
          },
        },
      ],
    );
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
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleSave}
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

      <SheetButton label="Save changes" onPress={handleSave} pending={updateCategory.isPending} />

      <SheetSection footer="Events in this category stay on your calendars.">
        <SheetGroup>
          <SheetItem
            label="Delete category"
            icon="trash-2"
            tone="destructive"
            disabled={deleteCategory.isPending}
            pending={deleteCategory.isPending}
            onPress={confirmDelete}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
