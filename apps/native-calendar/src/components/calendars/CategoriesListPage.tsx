import React from "react";
import { categoryUsageDetail, getErrorMessage } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useCategories, useCategoryDeletePending, useCategoryUsageCounts } from "../../hooks/use-categories";
import { isOptimisticId } from "../../lib/optimistic-events";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { CATEGORY_CREATE_PAGE, categoryEditPage } from "../../lib/calendars-sheet-pages";

/** Categories label events across calendars; names are end-to-end encrypted like calendar names. */
export function CategoriesListPage() {
  const { theme } = useTheme();
  const { push } = useSheetPageNavigator();
  const categoriesQuery = useCategories();
  const deleting = useCategoryDeletePending();
  const usage = useCategoryUsageCounts().data;

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
          {deleting ? <SheetItem label="Deleting category…" pending disabled /> : null}
          {categories.map((category) => (
            <SheetItem
              key={category.id}
              label={category.name}
              detail={categoryUsageDetail(usage?.[category.id] ?? category.usageCount)}
              swatch={resolveCalendarSwatchColor(category.color, theme)}
              chevron
              pending={isOptimisticId(category.id)}
              onPress={() => push(categoryEditPage(category.id))}
            />
          ))}
          <SheetItem
            key="new-category"
            testID="category-create"
            label="New category"
            icon="plus"
            tone="accent"
            disabled={deleting}
            onPress={() => push(CATEGORY_CREATE_PAGE)}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
