import { nativeLightTheme } from "@workspace/design-tokens";
import type { Calendar, CalendarView } from "@workspace/calendar-core";
import {
  buildSidebarCalendarSections,
  getSidebarCalendarActions,
  getSidebarPrimaryMenuItems,
  SIDEBAR_VIEW_OPTIONS,
  getViewLabel,
  SIDEBAR_DROPDOWN_OPTION_HEIGHT,
  SIDEBAR_DROPDOWN_TOTAL_HEIGHT,
} from "./app-sidebar-utils";

function createCalendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "calendar-1",
    name: "Work",
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "user-1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("AppSidebar screen model", () => {
  it("keeps primary navigation focused and excludes sign out", () => {
    const items = getSidebarPrimaryMenuItems();

    expect(items.map((item) => item.key)).toEqual([
      "calendar",
      "search",
      "settings",
    ]);
    expect(items.some((item) => item.key === "sign-out")).toBe(false);
  });

  it("keeps primary navigation routes stable", () => {
    const items = getSidebarPrimaryMenuItems();

    expect(items.map((item) => item.route)).toEqual([
      "/calendar",
      "/search",
      "/settings",
    ]);
  });

  it("exposes compact calendar header actions for create and manage", () => {
    const actions = getSidebarCalendarActions();

    expect(actions.map((action) => action.key)).toEqual([
      "create-calendar",
      "manage-calendars",
    ]);
    expect(actions.map((action) => action.route)).toEqual([
      "/calendar-manage/create",
      "/calendar-manage",
    ]);
  });

  it("uses icon-only calendar actions to avoid sidebar row clutter", () => {
    const actions = getSidebarCalendarActions();

    expect(actions.every((action) => !("label" in action))).toBe(true);
    expect(
      new Set(actions.map((action) => action.accessibilityLabel)).size,
    ).toBe(actions.length);
  });

  it("groups calendar visibility rows like the web sidebar", () => {
    const sections = buildSidebarCalendarSections(
      [
        createCalendar({ id: "owned-1", name: "Work", kind: "owned" }),
        createCalendar({
          id: "public-1",
          name: "Dutch Holidays",
          kind: "public_holiday",
        }),
        createCalendar({
          id: "subscribed-1",
          name: "Team Feed",
          kind: "subscribed",
          isVisible: false,
        }),
      ],
      nativeLightTheme,
    );

    expect(sections.map((section) => section.key)).toEqual([
      "owned",
      "public",
      "subscribed",
    ]);
    expect(sections[0].title).toBeNull();
    expect(sections[1].title).toBe("Public");
    expect(sections[2].rows[0]).toMatchObject({
      id: "subscribed-1",
      name: "Team Feed",
      isVisible: false,
    });
  });

  it("returns no calendar sections for an empty sidebar list", () => {
    expect(buildSidebarCalendarSections([], nativeLightTheme)).toEqual([]);
  });

  it("omits empty public and subscribed headings", () => {
    const sections = buildSidebarCalendarSections(
      [createCalendar({ id: "owned-1", name: "Work" })],
      nativeLightTheme,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("owned");
    expect(sections[0].title).toBeNull();
  });

  it("resolves safe swatch values for named and custom calendar colors", () => {
    const sections = buildSidebarCalendarSections(
      [
        createCalendar({ id: "named", color: "emerald" }),
        createCalendar({ id: "custom", color: "#3366FF" }),
      ],
      nativeLightTheme,
    );

    expect(sections[0].rows.map((row) => row.swatchColor)).toEqual([
      nativeLightTheme.colors.calendar.emerald.bg,
      "#3366FF",
    ]);
  });

  it("falls back to the default swatch for invalid calendar colors", () => {
    const sections = buildSidebarCalendarSections(
      [createCalendar({ id: "invalid", color: "not-a-color" })],
      nativeLightTheme,
    );

    expect(sections[0].rows[0].swatchColor).toBe(
      nativeLightTheme.colors.calendar.blue.bg,
    );
  });
});

describe("View switcher options", () => {
  it("exposes all 5 calendar views in logical order", () => {
    expect(SIDEBAR_VIEW_OPTIONS.map((o) => o.view)).toEqual([
      "day",
      "3day",
      "week",
      "month",
      "agenda",
    ]);
  });

  it("provides a human-readable label for every view", () => {
    const labels = SIDEBAR_VIEW_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["Day", "3 Day", "Week", "Month", "Agenda"]);
    // All labels must be non-empty strings
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });

  it("provides an icon name for every view option", () => {
    SIDEBAR_VIEW_OPTIONS.forEach((opt) => {
      expect(typeof opt.icon).toBe("string");
      expect(opt.icon.length).toBeGreaterThan(0);
    });
  });

  it("getViewLabel returns the correct label for each view", () => {
    expect(getViewLabel("day")).toBe("Day");
    expect(getViewLabel("3day")).toBe("3 Day");
    expect(getViewLabel("week")).toBe("Week");
    expect(getViewLabel("month")).toBe("Month");
    expect(getViewLabel("agenda")).toBe("Agenda");
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
