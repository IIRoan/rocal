import type { CalendarView } from "@workspace/calendar-core";
import {
  getSidebarPrimaryMenuItems,
  SIDEBAR_VIEW_OPTIONS,
  getViewLabel,
  SIDEBAR_DROPDOWN_OPTION_HEIGHT,
  SIDEBAR_DROPDOWN_TOTAL_HEIGHT,
} from "./app-sidebar-utils";

describe("AppSidebar screen model", () => {
  it("keeps primary navigation focused and excludes sign out", () => {
    const items = getSidebarPrimaryMenuItems();

    expect(items.map((item) => item.key)).toEqual([
      "calendar",
      "settings",
    ]);
    expect(items.some((item) => item.key === "sign-out")).toBe(false);
  });

  it("keeps primary navigation routes stable", () => {
    const items = getSidebarPrimaryMenuItems();

    expect(items.map((item) => item.route)).toEqual([
      "/calendar",
      "/settings",
    ]);
  });
});

describe("View switcher options", () => {
  it("exposes the native calendar views in logical order, without month or agenda", () => {
    expect(SIDEBAR_VIEW_OPTIONS.map((o) => o.view)).toEqual([
      "day",
      "3day",
      "week",
    ]);
  });

  it("provides a human-readable label for every view", () => {
    const labels = SIDEBAR_VIEW_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["Day", "3 Day", "Week"]);
    // All labels must be non-empty strings
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(
      true,
    );
  });

  it("getViewLabel returns the correct label for each view", () => {
    expect(getViewLabel("day")).toBe("Day");
    expect(getViewLabel("3day")).toBe("3 Day");
    expect(getViewLabel("week")).toBe("Week");
  });

  it("getViewLabel falls back to Day for the web-only month and agenda views", () => {
    expect(getViewLabel("month")).toBe("Day");
    expect(getViewLabel("agenda")).toBe("Day");
  });

  it("getViewLabel falls back to Day for an unknown view", () => {
    expect(getViewLabel("unknown" as CalendarView)).toBe("Day");
  });

  it("dropdown option height is a positive number", () => {
    expect(SIDEBAR_DROPDOWN_OPTION_HEIGHT).toBeGreaterThan(0);
  });

  it("dropdown total height equals options count times option height", () => {
    expect(SIDEBAR_DROPDOWN_TOTAL_HEIGHT).toBe(
      SIDEBAR_VIEW_OPTIONS.length * SIDEBAR_DROPDOWN_OPTION_HEIGHT,
    );
  });

  it("all view option views are unique", () => {
    const views = SIDEBAR_VIEW_OPTIONS.map((o) => o.view);
    expect(new Set(views).size).toBe(views.length);
  });
});
