"use client";

import { useState } from "react";
import { AlertTriangle, Plus, RotateCw, Tag, Trash2 } from "lucide-react";
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRESET_COLOR_OPTIONS,
  categoryUsageDetail,
  getErrorMessage,
  validateCategoryName,
  type EventCategory,
  type EventColor,
} from "@workspace/calendar-core";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { cn } from "@workspace/ui/lib/utils";

import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/use-categories";
import type { PaletteView as PaletteViewId } from "./command-palette/constants";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "./command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "./command-palette/palette-styles";

interface CategoryManagerProps {
  currentView: PaletteViewId;
  onBack: () => void;
  onNavigateTo: (view: PaletteViewId) => void;
}

export function CategoryManager({
  currentView,
  onBack,
  onNavigateTo,
}: CategoryManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (currentView === "categories") {
    return (
      <CategoriesListView
        onBack={onBack}
        onCreate={() => onNavigateTo("category-create")}
        onEdit={(id) => {
          setEditingId(id);
          onNavigateTo("category-edit");
        }}
      />
    );
  }
  if (currentView === "category-create") {
    return <CategoryCreateView onBack={onBack} />;
  }
  if (currentView === "category-edit") {
    return <CategoryEditView id={editingId} onBack={onBack} />;
  }
  return null;
}

function CategoriesListView({
  onBack,
  onCreate,
  onEdit,
}: {
  onBack: () => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
}) {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  return (
    <PaletteView title="Categories" onBack={onBack}>
      <PaletteSection label="Actions">
        <PaletteNavRow
          icon={Plus}
          label="Create New Category"
          onClick={onCreate}
        />
      </PaletteSection>
      <PaletteSection label="Your Categories">
        {categoriesQuery.isLoading ? (
          <PaletteEmptyState>Loading categories…</PaletteEmptyState>
        ) : categoriesQuery.isError ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6">
            <p role="alert" className="text-[13px] text-destructive">
              {getErrorMessage(
                categoriesQuery.error,
                "Failed to load categories",
              )}
            </p>
            <PaletteButton onClick={() => void categoriesQuery.refetch()}>
              <RotateCw className="size-3.5" />
              Try again
            </PaletteButton>
          </div>
        ) : categories.length === 0 ? (
          <PaletteEmptyState>
            No categories yet. Categories group events across calendars.
          </PaletteEmptyState>
        ) : (
          categories.map((category) => (
            <PaletteNavRow
              key={category.id}
              icon={Tag}
              iconColor={getColorSwatchValue(category.color)}
              label={category.name}
              description={categoryUsageDetail(category)}
              onClick={() => onEdit(category.id)}
            />
          ))
        )}
      </PaletteSection>
    </PaletteView>
  );
}

function CategoryColorPicker({
  value,
  onChange,
}: {
  value: EventColor;
  onChange: (color: EventColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Category color" className="flex flex-wrap gap-1">
      {PRESET_COLOR_OPTIONS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          role="radio"
          aria-checked={value === preset.value}
          aria-label={preset.label}
          onClick={() => onChange(preset.value)}
          className={cn(
            "tap-target flex size-8 cursor-pointer items-center justify-center rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50",
            value === preset.value && "ring-2 ring-foreground/70",
          )}
        >
          <span
            aria-hidden
            className="size-5 rounded-full"
            style={{ backgroundColor: getColorSwatchValue(preset.value) }}
          />
        </button>
      ))}
    </div>
  );
}

function CategoryFields({
  name,
  color,
  nameError,
  onNameChange,
  onColorChange,
  onSubmit,
}: {
  name: string;
  color: EventColor;
  nameError?: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: EventColor) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <PaletteField label="Name" htmlFor="category-name">
        <input
          id="category-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              onSubmit();
            }
          }}
          placeholder="Category name"
          aria-label="Category name"
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          className={PALETTE_INPUT_CLASS}
        />
        {nameError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {nameError}
          </p>
        ) : null}
      </PaletteField>
      <PaletteField label="Color">
        <CategoryColorPicker value={color} onChange={onColorChange} />
      </PaletteField>
    </div>
  );
}

function CategoryCreateView({ onBack }: { onBack: () => void }) {
  const categoriesQuery = useCategories();
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [nameError, setNameError] = useState<string>();

  const handleCreate = () => {
    if (createCategory.isPending) return;
    const error = validateCategoryName(name, categoriesQuery.data ?? []);
    setNameError(error);
    if (error) return;
    createCategory.mutate({ name: name.trim(), color }, { onSuccess: onBack });
  };

  return (
    <PaletteView title="Create Category" onBack={onBack}>
      <CategoryFields
        name={name}
        color={color}
        nameError={nameError}
        onNameChange={(value) => {
          setName(value);
          setNameError(undefined);
        }}
        onColorChange={setColor}
        onSubmit={handleCreate}
      />
      <PaletteFormActions>
        <PaletteButton
          variant="primary"
          loading={createCategory.isPending}
          disabled={!name.trim()}
          onClick={handleCreate}
        >
          Create
        </PaletteButton>
      </PaletteFormActions>
    </PaletteView>
  );
}

function CategoryEditView({
  id,
  onBack,
}: {
  id: string | null;
  onBack: () => void;
}) {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data;
  const category = categories?.find((entry) => entry.id === id);

  if (categoriesQuery.isLoading) {
    return (
      <PaletteView title="Edit Category" onBack={onBack}>
        <PaletteEmptyState>Loading category…</PaletteEmptyState>
      </PaletteView>
    );
  }
  if (!category || !categories) {
    return (
      <PaletteView title="Edit Category" onBack={onBack}>
        <PaletteEmptyState>
          {categoriesQuery.isError
            ? getErrorMessage(categoriesQuery.error, "Failed to load category")
            : "Category not found."}
        </PaletteEmptyState>
      </PaletteView>
    );
  }
  return (
    <CategoryEditForm
      key={category.id}
      category={category}
      categories={categories}
      onBack={onBack}
    />
  );
}

function CategoryEditForm({
  category,
  categories,
  onBack,
}: {
  category: EventCategory;
  categories: EventCategory[];
  onBack: () => void;
}) {
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  // Seeds the form once; the parent keys this form by category id to reset it.
  const [name, setName] = useState(() => category.name);
  const [color, setColor] = useState<EventColor>(() => category.color);
  const [nameError, setNameError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const usage = categoryUsageDetail(category);

  const handleSave = () => {
    if (updateCategory.isPending) return;
    const error = validateCategoryName(name, categories, category.id);
    setNameError(error);
    if (error) return;
    const trimmed = name.trim();
    if (trimmed === category.name && color === category.color) {
      onBack();
      return;
    }
    updateCategory.mutate(
      {
        id: category.id,
        request: {
          ...(trimmed !== category.name ? { name: trimmed } : {}),
          ...(color !== category.color ? { color } : {}),
        },
      },
      { onSuccess: onBack },
    );
  };

  return (
    <PaletteView title="Edit Category" onBack={onBack}>
      <CategoryFields
        name={name}
        color={color}
        nameError={nameError}
        onNameChange={(value) => {
          setName(value);
          setNameError(undefined);
        }}
        onColorChange={setColor}
        onSubmit={handleSave}
      />
      <PaletteFormActions>
        <PaletteButton
          variant="primary"
          loading={updateCategory.isPending}
          disabled={!name.trim()}
          onClick={handleSave}
        >
          Save changes
        </PaletteButton>
      </PaletteFormActions>
      <PaletteSection label="Delete">
        {confirmingDelete ? (
          <div>
            <div className="flex items-start gap-3 p-2 text-[13px] leading-[130%] text-muted-foreground">
              <PaletteIconBox>
                <AlertTriangle className="size-4 text-destructive" />
              </PaletteIconBox>
              <span>
                {usage
                  ? `${usage} will keep their details but lose this category.`
                  : "This category is not used by any events."}
              </span>
            </div>
            <PaletteFormActions>
              <PaletteButton
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </PaletteButton>
              <PaletteButton
                variant="destructive"
                // The optimistic removal unmounts this category, so leave the view right away.
                onClick={() => {
                  deleteCategory.mutate(category.id);
                  onBack();
                }}
              >
                <Trash2 className="size-3.5" />
                Delete {category.name}
              </PaletteButton>
            </PaletteFormActions>
          </div>
        ) : (
          <PaletteNavRow
            icon={Trash2}
            label={<span className="text-destructive">Delete category</span>}
            description="Events in this category stay on your calendars."
            trailing={null}
            onClick={() => setConfirmingDelete(true)}
          />
        )}
      </PaletteSection>
    </PaletteView>
  );
}
