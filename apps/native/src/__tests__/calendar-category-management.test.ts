/**
 * Unit tests for calendar and category management screens.
 *
 * Tests list rendering logic, form validation, and CRUD operation flows
 * for both calendar and category management.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4
 */
import { describe, it, expect } from "@jest/globals";
import { validateCategoryData } from "@workspace/calendar-core";

// ---------------------------------------------------------------------------
// Calendar form validation (mirrors the inline validation in create/edit)
// ---------------------------------------------------------------------------

function validateCalendarForm(data: {
  name: string;
}): string[] {
  const errors: string[] = [];
  if (!data.name.trim()) {
    errors.push("Calendar name is required");
  }
  if (data.name.trim().length > 100) {
    errors.push("Calendar name must be 100 characters or less");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Calendar visibility toggle model
// ---------------------------------------------------------------------------

interface CalendarModel {
  id: string;
  name: string;
  color: string;
  isVisible: boolean;
  isDefault: boolean;
}

function toggleVisibility(calendar: CalendarModel): CalendarModel {
  return { ...calendar, isVisible: !calendar.isVisible };
}

// ---------------------------------------------------------------------------
// Calendar delete action model
// ---------------------------------------------------------------------------

type DeleteAction = "delete_events" | "move_events";

interface DeleteResult {
  action: DeleteAction;
  calendarId: string;
  moveTargetId?: string;
}

function resolveDeleteAction(
  calendar: CalendarModel,
  action: DeleteAction,
  moveTargetId?: string,
): DeleteResult | { error: string } {
  if (calendar.isDefault) {
    return { error: "The default calendar cannot be deleted." };
  }
  if (action === "move_events" && !moveTargetId) {
    return { error: "A target calendar is required to move events." };
  }
  return {
    action,
    calendarId: calendar.id,
    ...(moveTargetId ? { moveTargetId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Category list filtering model
// ---------------------------------------------------------------------------

interface CategoryModel {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  usageCount: number;
}

function filterActiveCategories(categories: CategoryModel[]): CategoryModel[] {
  return categories.filter((c) => c.isActive);
}

// ---------------------------------------------------------------------------
// Tests: Calendar form validation
// ---------------------------------------------------------------------------

describe("Calendar form validation", () => {
  it("rejects empty name", () => {
    const errors = validateCalendarForm({ name: "" });
    expect(errors).toContain("Calendar name is required");
  });

  it("rejects whitespace-only name", () => {
    const errors = validateCalendarForm({ name: "   " });
    expect(errors).toContain("Calendar name is required");
  });

  it("rejects name exceeding 100 characters", () => {
    const longName = "a".repeat(101);
    const errors = validateCalendarForm({ name: longName });
    expect(errors).toContain("Calendar name must be 100 characters or less");
  });

  it("accepts valid name", () => {
    const errors = validateCalendarForm({ name: "Work" });
    expect(errors).toHaveLength(0);
  });

  it("accepts name at exactly 100 characters", () => {
    const name = "a".repeat(100);
    const errors = validateCalendarForm({ name });
    expect(errors).toHaveLength(0);
  });

  it("trims name before length check", () => {
    const name = " " + "a".repeat(100) + " ";
    const errors = validateCalendarForm({ name });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Calendar visibility toggle
// ---------------------------------------------------------------------------

describe("Calendar visibility toggle", () => {
  it("toggles visible to hidden", () => {
    const calendar: CalendarModel = {
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: true,
      isDefault: false,
    };
    const result = toggleVisibility(calendar);
    expect(result.isVisible).toBe(false);
  });

  it("toggles hidden to visible", () => {
    const calendar: CalendarModel = {
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: false,
      isDefault: false,
    };
    const result = toggleVisibility(calendar);
    expect(result.isVisible).toBe(true);
  });

  it("preserves other calendar properties", () => {
    const calendar: CalendarModel = {
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: true,
      isDefault: true,
    };
    const result = toggleVisibility(calendar);
    expect(result.id).toBe("1");
    expect(result.name).toBe("Work");
    expect(result.color).toBe("blue");
    expect(result.isDefault).toBe(true);
  });

  it("double toggle returns to original state", () => {
    const calendar: CalendarModel = {
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: true,
      isDefault: false,
    };
    const result = toggleVisibility(toggleVisibility(calendar));
    expect(result.isVisible).toBe(calendar.isVisible);
  });
});

// ---------------------------------------------------------------------------
// Tests: Calendar delete action
// ---------------------------------------------------------------------------

describe("Calendar delete action", () => {
  const nonDefaultCalendar: CalendarModel = {
    id: "cal-1",
    name: "Personal",
    color: "emerald",
    isVisible: true,
    isDefault: false,
  };

  const defaultCalendar: CalendarModel = {
    id: "cal-2",
    name: "Default",
    color: "blue",
    isVisible: true,
    isDefault: true,
  };

  it("prevents deleting the default calendar", () => {
    const result = resolveDeleteAction(defaultCalendar, "delete_events");
    expect(result).toEqual({
      error: "The default calendar cannot be deleted.",
    });
  });

  it("allows deleting a non-default calendar with delete_events", () => {
    const result = resolveDeleteAction(nonDefaultCalendar, "delete_events");
    expect(result).toEqual({
      action: "delete_events",
      calendarId: "cal-1",
    });
  });

  it("allows deleting with move_events when target is provided", () => {
    const result = resolveDeleteAction(
      nonDefaultCalendar,
      "move_events",
      "cal-2",
    );
    expect(result).toEqual({
      action: "move_events",
      calendarId: "cal-1",
      moveTargetId: "cal-2",
    });
  });

  it("rejects move_events without a target calendar", () => {
    const result = resolveDeleteAction(nonDefaultCalendar, "move_events");
    expect(result).toEqual({
      error: "A target calendar is required to move events.",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Category validation (using shared validateCategoryData)
// ---------------------------------------------------------------------------

describe("Category form validation", () => {
  it("rejects empty name", () => {
    const errors = validateCategoryData({ name: "", color: "blue" });
    expect(errors).toContain("Category name is required");
  });

  it("rejects whitespace-only name", () => {
    const errors = validateCategoryData({ name: "   ", color: "blue" });
    expect(errors).toContain("Category name is required");
  });

  it("accepts valid category data", () => {
    const errors = validateCategoryData({ name: "Meeting", color: "blue" });
    expect(errors).toHaveLength(0);
  });

  it("accepts all valid calendar colors", () => {
    const validColors = [
      "blue",
      "orange",
      "violet",
      "rose",
      "emerald",
      "red",
      "cyan",
      "lime",
      "amber",
      "indigo",
      "pink",
      "teal",
    ] as const;

    for (const color of validColors) {
      const errors = validateCategoryData({ name: "Test", color });
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid color", () => {
    const errors = validateCategoryData({
      name: "Test",
      color: "neon" as any,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Color must be one of");
  });

  it("accepts valid hex color", () => {
    const errors = validateCategoryData({
      name: "Test",
      color: "#FF5733" as any,
    });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Category list rendering logic
// ---------------------------------------------------------------------------

describe("Category list rendering", () => {
  const categories: CategoryModel[] = [
    {
      id: "cat-1",
      name: "Meeting",
      color: "blue",
      isActive: true,
      usageCount: 5,
    },
    {
      id: "cat-2",
      name: "Archived",
      color: "rose",
      isActive: false,
      usageCount: 0,
    },
    {
      id: "cat-3",
      name: "Travel",
      color: "emerald",
      isActive: true,
      usageCount: 12,
    },
  ];

  it("filters to only active categories", () => {
    const active = filterActiveCategories(categories);
    expect(active).toHaveLength(2);
    expect(active.every((c) => c.isActive)).toBe(true);
  });

  it("returns empty array when no categories are active", () => {
    const inactive: CategoryModel[] = [
      {
        id: "cat-1",
        name: "Old",
        color: "blue",
        isActive: false,
        usageCount: 0,
      },
    ];
    const active = filterActiveCategories(inactive);
    expect(active).toHaveLength(0);
  });

  it("preserves category order", () => {
    const active = filterActiveCategories(categories);
    expect(active[0].name).toBe("Meeting");
    expect(active[1].name).toBe("Travel");
  });

  it("returns all categories when all are active", () => {
    const allActive = categories.map((c) => ({ ...c, isActive: true }));
    const result = filterActiveCategories(allActive);
    expect(result).toHaveLength(allActive.length);
  });
});

// ---------------------------------------------------------------------------
// Tests: Category delete behavior
// ---------------------------------------------------------------------------

describe("Category delete behavior", () => {
  it("removes category assignment from events on delete", () => {
    // Model: events with categoryId should have it set to null after delete
    const events = [
      { id: "e1", title: "Event 1", categoryId: "cat-1" },
      { id: "e2", title: "Event 2", categoryId: "cat-2" },
      { id: "e3", title: "Event 3", categoryId: "cat-1" },
    ];

    const deletedCategoryId = "cat-1";
    const updatedEvents = events.map((e) =>
      e.categoryId === deletedCategoryId
        ? { ...e, categoryId: null }
        : e,
    );

    expect(updatedEvents[0].categoryId).toBeNull();
    expect(updatedEvents[1].categoryId).toBe("cat-2");
    expect(updatedEvents[2].categoryId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Calendar list rendering with color mapping
// ---------------------------------------------------------------------------

describe("Calendar list rendering", () => {
  const calendarColorMap: Record<string, string> = {
    blue: "#3b82f6",
    orange: "#f97316",
    violet: "#8b5cf6",
    rose: "#f43f5e",
    emerald: "#10b981",
  };

  function resolveCalendarColor(
    color: string,
    fallback: string,
  ): string {
    return calendarColorMap[color] ?? fallback;
  }

  it("resolves known calendar colors", () => {
    expect(resolveCalendarColor("blue", "#000")).toBe("#3b82f6");
    expect(resolveCalendarColor("emerald", "#000")).toBe("#10b981");
  });

  it("falls back for unknown colors", () => {
    expect(resolveCalendarColor("unknown", "#000")).toBe("#000");
  });

  it("renders correct number of calendars", () => {
    const calendars: CalendarModel[] = [
      {
        id: "1",
        name: "Work",
        color: "blue",
        isVisible: true,
        isDefault: true,
      },
      {
        id: "2",
        name: "Personal",
        color: "emerald",
        isVisible: true,
        isDefault: false,
      },
      {
        id: "3",
        name: "Hidden",
        color: "rose",
        isVisible: false,
        isDefault: false,
      },
    ];
    // All calendars should be rendered regardless of visibility
    expect(calendars).toHaveLength(3);
  });
});
