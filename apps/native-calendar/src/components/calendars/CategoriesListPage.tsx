import React from "react";
import { getErrorMessage } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useCategories } from "../../hooks/use-categories";
import { categoryUsageDetail } from "../../lib/categories-model";
import { isOptimisticId } from "../../lib/optimistic-events";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { CATEGORY_CREATE_PAGE, categoryEditPage } from "../../lib/calendars-sheet-pages";

/** Categories label events across calendars; names are end-to-end encrypted like calendar names. */
export function CategoriesListPage() {
  const { theme } = useTheme();
  const { push } = useSheetPageNavigator();
  const categoriesQuery = useCategories();

  if (categoriesQuery.isLoading) {
    return <SheetCenteredState loading message="Loading categories…" />;
  }

  if (categoriesQuery.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(categoriesQuery.error, "Failed to load categories")}
      />
    );
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <SheetScroll>
      <SheetSection
        footer={
          categories.length === 0
            ? "Use categories to label events across calendars, like Travel or Focus."
            : undefined
        }
      >
        <SheetGroup>
          {categories.map((category) => (
            <SheetItem
              key={category.id}
              label={category.name}
              detail={categoryUsageDetail(category)}
              swatch={resolveCalendarSwatchColor(category.color, theme)}
              chevron
              pending={isOptimisticId(category.id)}
              onPress={() => push(categoryEditPage(category.id))}
            />
          ))}
          <SheetItem
            key="new-category"
            label="New category"
            icon="plus"
            tone="accent"
            onPress={() => push(CATEGORY_CREATE_PAGE)}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
