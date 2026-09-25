import { describe, expect, it } from "@jest/globals";
import type { CalendarSubscription } from "@workspace/calendar-core";
import { validateCategoryData } from "@workspace/calendar-core";
import { nativeLightTheme } from "@workspace/design-tokens";
import {
  getSubscriptionType,
  normalizeSubscriptionUrl,
  resolveCalendarSwatchColor,
  sortSubscriptions,
  validateCreateSubscriptionInput,
  validateEditableSubscriptionInput,
} from "../lib/subscription-utils";

function validateCalendarForm(data: { name: string }): string[] {
  const errors: string[] = [];
  if (!data.name.trim()) {
    errors.push("Calendar name is required");
  }
  if (data.name.trim().length > 100) {
    errors.push("Calendar name must be 100 characters or less");
  }
  return errors;
}

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
    return {
      error: "Make another calendar default before deleting this one.",
    };
  }
  if (action === "move_events" && !moveTargetId) {
    return {
      error: "Select another owned calendar to receive this calendar's events.",
    };
  }
  return {
    action,
    calendarId: calendar.id,
    ...(moveTargetId ? { moveTargetId } : {}),
  };
}

interface CategoryModel {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  usageCount: number;
}

function filterActiveCategories(categories: CategoryModel[]): CategoryModel[] {
  return categories.filter((category) => category.isActive);
}

function createSubscription(partial: {
  id: string;
  name: string;
  kind: "public_holiday" | "subscription";
}): CalendarSubscription {
  return {
    id: partial.id,
    calendar: {
      id: `calendar-${partial.id}`,
      name: partial.name,
      color: "blue",
      kind: partial.kind,
    },
  } as unknown as CalendarSubscription;
}

describe("Calendar form validation", () => {
  it("rejects empty name", () => {
    const errors = validateCalendarForm({ name: "" });
    expect(errors).toContain("Calendar name is required");
  });

  it("rejects whitespace-only name", () => {
    const errors = validateCalendarForm({ name: "   " });
    expect(errors).toContain("Calendar name is required");
  });

  it("rejects a name over 100 characters", () => {
    const errors = validateCalendarForm({ name: "a".repeat(101) });
    expect(errors).toContain("Calendar name must be 100 characters or less");
  });

  it("accepts a valid name", () => {
    const errors = validateCalendarForm({ name: "Work" });
    expect(errors).toHaveLength(0);
  });
});

describe("Calendar visibility toggle", () => {
  it("toggles visible to hidden", () => {
    const result = toggleVisibility({
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: true,
      isDefault: false,
    });
    expect(result.isVisible).toBe(false);
  });

  it("preserves other properties", () => {
    const calendar: CalendarModel = {
      id: "1",
      name: "Work",
      color: "blue",
      isVisible: true,
      isDefault: true,
    };
    const result = toggleVisibility(calendar);
    expect(result.id).toBe(calendar.id);
    expect(result.name).toBe(calendar.name);
    expect(result.color).toBe(calendar.color);
    expect(result.isDefault).toBe(true);
  });
});

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
      error: "Make another calendar default before deleting this one.",
    });
  });

  it("allows deleting a non-default calendar with delete_events", () => {
    const result = resolveDeleteAction(nonDefaultCalendar, "delete_events");
    expect(result).toEqual({
      action: "delete_events",
      calendarId: "cal-1",
    });
  });

  it("requires a target calendar when moving events", () => {
    const result = resolveDeleteAction(nonDefaultCalendar, "move_events");
    expect(result).toEqual({
      error: "Select another owned calendar to receive this calendar's events.",
    });
  });

  it("allows moving events into another calendar before delete", () => {
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
});

describe("Category form validation", () => {
  it("rejects empty name", () => {
    const errors = validateCategoryData({ name: "", color: "blue" });
    expect(errors).toContain("Category name is required");
  });

  it("accepts valid category data", () => {
    const errors = validateCategoryData({ name: "Meeting", color: "blue" });
    expect(errors).toHaveLength(0);
  });

  it("accepts valid hex colors", () => {
    const errors = validateCategoryData({
      name: "Travel",
      color: "#FF5733" as never,
    });
    expect(errors).toHaveLength(0);
  });
});

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
    expect(active.every((category) => category.isActive)).toBe(true);
  });

  it("preserves category order", () => {
    const active = filterActiveCategories(categories);
    expect(active[0].name).toBe("Meeting");
    expect(active[1].name).toBe("Travel");
  });
});

describe("Subscription validation", () => {
  it("requires name, URL, and color when creating", () => {
    const errors = validateCreateSubscriptionInput({
      name: "",
      url: "",
      color: "",
    });
    expect(errors).toEqual({
      name: "Calendar name is required",
      url: "Calendar URL is required",
      color: "Please select a valid color",
    });
  });

  it("rejects non-calendar subscription URLs", () => {
    const errors = validateCreateSubscriptionInput({
      name: "Company Holidays",
      url: "https://example.com/calendar.json",
      color: "blue",
    });
    expect(errors.url).toBe("URL should point to a calendar feed");
  });

  it("accepts valid external subscription input", () => {
    const errors = validateCreateSubscriptionInput({
      name: "Company Holidays",
      url: "https://example.com/company.ics",
      color: "#3366FF",
    });
    expect(errors).toEqual({});
  });

  it("validates editable subscription colors", () => {
    const errors = validateEditableSubscriptionInput({
      name: "School Calendar",
      color: "bad-color",
    });
    expect(errors.color).toBe("Please select a valid color");
  });
});

describe("Subscription helpers", () => {
  it("normalizes subscription URLs by removing hash and trailing slash", () => {
    const result = normalizeSubscriptionUrl(
      "https://example.com/feed/calendar.ics/?token=abc#top",
    );
    expect(result).toBe("https://example.com/feed/calendar.ics?token=abc");
  });

  it("identifies holiday subscriptions by calendar kind", () => {
    const subscription = createSubscription({
      id: "sub-1",
      name: "Dutch Holidays",
      kind: "public_holiday",
    });
    expect(getSubscriptionType(subscription)).toBe("holiday");
  });

  it("sorts holiday subscriptions ahead of external ones, then by name", () => {
    const subscriptions = [
      createSubscription({
        id: "sub-3",
        name: "Work Feed",
        kind: "subscription",
      }),
      createSubscription({
        id: "sub-1",
        name: "Belgian Holidays",
        kind: "public_holiday",
      }),
      createSubscription({
        id: "sub-2",
        name: "Australian Holidays",
        kind: "public_holiday",
      }),
    ];

    const result = sortSubscriptions(subscriptions).map(
      (subscription) => subscription.calendar.name,
    );

    expect(result).toEqual([
      "Australian Holidays",
      "Belgian Holidays",
      "Work Feed",
    ]);
  });
});

describe("Calendar color helpers", () => {
  it("resolves named colors through the native theme palette", () => {
    expect(resolveCalendarSwatchColor("emerald", nativeLightTheme)).toBe(
      nativeLightTheme.colors.calendar.emerald.bg,
    );
  });

  it("preserves custom hex colors instead of indexing the palette", () => {
    expect(resolveCalendarSwatchColor("#3366FF", nativeLightTheme)).toBe(
      "#3366FF",
    );
  });

  it("falls back to blue for empty or invalid values", () => {
    expect(resolveCalendarSwatchColor("", nativeLightTheme)).toBe(
      nativeLightTheme.colors.calendar.blue.bg,
    );
    expect(resolveCalendarSwatchColor("bad-color", nativeLightTheme)).toBe(
      nativeLightTheme.colors.calendar.blue.bg,
    );
  });
});
