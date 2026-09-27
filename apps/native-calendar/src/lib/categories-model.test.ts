import type { EventCategory } from "@workspace/calendar-core";
import {
  CATEGORY_NAME_MAX_LENGTH,
  buildOptimisticCategory,
  categoryUsageDetail,
  insertCategory,
  patchCategory,
  removeCategory,
  replaceCategory,
  sortCategories,
  validateCategoryName,
} from "./categories-model";

function category(overrides: Partial<EventCategory> = {}): EventCategory {
  return {
    id: "cat-1",
    name: "Work",
    color: "blue",
    isActive: true,
    userId: "user-1",
    usageCount: 3,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("sortCategories", () => {
  it("keeps active categories sorted by decrypted name", () => {
    const sorted = sortCategories([
      category({ id: "b", name: "work" }),
      category({ id: "a", name: "Admin" }),
      category({ id: "x", name: "Archived", isActive: false }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("validateCategoryName", () => {
  const existing = [category({ id: "cat-1", name: "Work" })];

  it("requires a name", () => {
    expect(validateCategoryName("   ", existing)).toBe("Category name is required");
  });

  it("limits the name length", () => {
    expect(validateCategoryName("a".repeat(CATEGORY_NAME_MAX_LENGTH + 1), existing)).toBe(
      `Category name must be ${CATEGORY_NAME_MAX_LENGTH} characters or less`,
    );
  });

  it("rejects duplicates regardless of case and spacing", () => {
    expect(validateCategoryName("  work ", existing)).toBe(
      "A category with this name already exists",
    );
  });

  it("allows keeping the name of the category being edited", () => {
    expect(validateCategoryName("Work", existing, "cat-1")).toBeUndefined();
    expect(validateCategoryName("Personal", existing)).toBeUndefined();
  });
});

describe("categoryUsageDetail", () => {
  it("describes how many events use a category", () => {
    expect(categoryUsageDetail(category({ usageCount: 0 }))).toBeUndefined();
    expect(categoryUsageDetail(category({ usageCount: 1 }))).toBe("1 event");
    expect(categoryUsageDetail(category({ usageCount: 4 }))).toBe("4 events");
  });
});

describe("category cache updates", () => {
  it("inserts an optimistic category with a trimmed name", () => {
    const optimistic = buildOptimisticCategory(
      { name: "  Travel ", color: "green" },
      "optimistic-1",
      "user-1",
    );
    expect(optimistic).toMatchObject({
      id: "optimistic-1",
      name: "Travel",
      color: "green",
      isActive: true,
      usageCount: 0,
    });
    expect(insertCategory([category()], optimistic)?.map((item) => item.id)).toEqual([
      "cat-1",
      "optimistic-1",
    ]);
    expect(insertCategory(undefined, optimistic)).toBeUndefined();
  });

  it("keeps the cached usage count when the saved category omits it", () => {
    const saved = category({ name: "Work stuff", usageCount: undefined });
    expect(replaceCategory([category()], "cat-1", saved)?.[0]).toMatchObject({
      name: "Work stuff",
      usageCount: 3,
    });
  });

  it("patches only the changed fields", () => {
    expect(patchCategory([category()], "cat-1", { color: "red" })?.[0]).toMatchObject({
      name: "Work",
      color: "red",
    });
    expect(patchCategory([category()], "cat-1", { name: " Jobs " })?.[0]?.name).toBe("Jobs");
  });

  it("removes a deleted category", () => {
    expect(removeCategory([category(), category({ id: "cat-2" })], "cat-1")).toEqual([
      category({ id: "cat-2" }),
    ]);
  });
});
