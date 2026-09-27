import type {
  CreateCategoryRequest,
  EventCategory,
  UpdateCategoryRequest,
} from "@workspace/calendar-core";

export const CATEGORY_NAME_MAX_LENGTH = 100;

/** Active categories by decrypted name; the server can only sort by the (empty) plaintext column. */
export function sortCategories(categories: EventCategory[]): EventCategory[] {
  return categories
    .filter((category) => category.isActive)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

/** Duplicate names are checked on-device because encrypted names are unique only to the client. */
export function validateCategoryName(
  name: string,
  categories: EventCategory[],
  editingId?: string,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Category name is required";
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
    return `Category name must be ${CATEGORY_NAME_MAX_LENGTH} characters or less`;
  }
  const lower = trimmed.toLocaleLowerCase();
  const duplicate = categories.some(
    (category) =>
      category.id !== editingId && category.name.trim().toLocaleLowerCase() === lower,
  );
  return duplicate ? "A category with this name already exists" : undefined;
}

export function categoryUsageDetail(category: EventCategory): string | undefined {
  const count = category.usageCount ?? 0;
  if (count === 0) return undefined;
  return count === 1 ? "1 event" : `${count} events`;
}

export function buildOptimisticCategory(
  request: CreateCategoryRequest,
  tempId: string,
  userId: string,
): EventCategory {
  const now = new Date();
  return {
    id: tempId,
    name: request.name.trim(),
    color: request.color,
    isActive: true,
    userId,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function insertCategory(
  categories: EventCategory[] | undefined,
  category: EventCategory,
): EventCategory[] | undefined {
  return categories ? [...categories, category] : categories;
}

/** Keeps the cached usage count, which create/update responses omit. */
export function replaceCategory(
  categories: EventCategory[] | undefined,
  id: string,
  saved: EventCategory,
): EventCategory[] | undefined {
  return categories?.map((category) =>
    category.id === id
      ? { ...saved, usageCount: saved.usageCount ?? category.usageCount }
      : category,
  );
}

export function patchCategory(
  categories: EventCategory[] | undefined,
  id: string,
  patch: UpdateCategoryRequest,
): EventCategory[] | undefined {
  return categories?.map((category) =>
    category.id === id
      ? {
          ...category,
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
        }
      : category,
  );
}

export function removeCategory(
  categories: EventCategory[] | undefined,
  id: string,
): EventCategory[] | undefined {
  return categories?.filter((category) => category.id !== id);
}
