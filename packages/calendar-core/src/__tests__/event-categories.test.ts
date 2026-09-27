import { describe, expect, it } from "@jest/globals";
import type { EventCategory } from "../types";
import {
  patchCategory,
  replaceCategory,
  resolveSubmittedCategoryId,
  sortCategories,
  validateCategoryName,
} from "../event-categories";

function category(overrides: Partial<EventCategory>): EventCategory {
  return {
    id: "cat-1",
    name: "Work",
    color: "blue",
    isActive: true,
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("event categories", () => {
  it("sorts active categories by decrypted name", () => {
    const sorted = sortCategories([
      category({ id: "b", name: "work" }),
      category({ id: "a", name: "Admin" }),
      category({ id: "x", name: "Archived", isActive: false }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("rejects empty and duplicate names but allows renaming itself", () => {
    const existing = [category({ id: "cat-1", name: "Work" })];
    expect(validateCategoryName("  ", existing)).toBe(
      "Category name is required",
    );
    expect(validateCategoryName(" work ", existing)).toBe(
      "A category with this name already exists",
    );
    expect(validateCategoryName("Work", existing, "cat-1")).toBeUndefined();
  });

  it("patches name and color and keeps usage counts on replace", () => {
    const current = [category({ usageCount: 4 })];
    expect(
      patchCategory(current, "cat-1", { name: " Home ", color: "red" })?.[0],
    ).toMatchObject({ name: "Home", color: "red", usageCount: 4 });
    expect(
      replaceCategory(current, "cat-1", category({ name: "Saved" }))?.[0],
    ).toMatchObject({ name: "Saved", usageCount: 4 });
  });

  it("resolves the submitted category id like native", () => {
    expect(resolveSubmittedCategoryId("cat-1", "cat-1")).toBe("cat-1");
    expect(resolveSubmittedCategoryId("cat-2", null)).toBe("cat-2");
    expect(resolveSubmittedCategoryId("", "cat-1")).toBe("");
    expect(resolveSubmittedCategoryId("", null)).toBeUndefined();
    expect(resolveSubmittedCategoryId("", undefined)).toBeUndefined();
  });
});
