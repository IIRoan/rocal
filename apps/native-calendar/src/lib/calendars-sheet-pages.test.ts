import {
  CALENDAR_CREATE_PAGE,
  CALENDARS_ROOT_PAGE,
  CATEGORIES_PAGE,
  CATEGORY_CREATE_PAGE,
  SUBSCRIPTION_CREATE_PAGE,
  calendarEditPage,
  categoryEditPage,
  isCalendarsSheetPage,
  parseCalendarsSheetPage,
  subscriptionEditPage,
} from "./calendars-sheet-pages";

describe("calendars sheet pages", () => {
  it("round-trips edit pages with their ids", () => {
    expect(parseCalendarsSheetPage(calendarEditPage("cal-1"))).toEqual({
      kind: "calendar-edit",
      id: "cal-1",
    });
    expect(parseCalendarsSheetPage(subscriptionEditPage("sub-1"))).toEqual({
      kind: "subscription-edit",
      id: "sub-1",
    });
  });

  it("parses the static pages", () => {
    expect(parseCalendarsSheetPage(CALENDARS_ROOT_PAGE)).toEqual({ kind: "root" });
    expect(parseCalendarsSheetPage(CALENDAR_CREATE_PAGE)).toEqual({ kind: "calendar-create" });
    expect(parseCalendarsSheetPage(SUBSCRIPTION_CREATE_PAGE)).toEqual({
      kind: "subscription-create",
    });
  });

  it("falls back to the root list for unknown or id-less keys", () => {
    expect(parseCalendarsSheetPage("nope")).toEqual({ kind: "root" });
    expect(parseCalendarsSheetPage(calendarEditPage(""))).toEqual({ kind: "root" });
    expect(parseCalendarsSheetPage(subscriptionEditPage(""))).toEqual({ kind: "root" });
  });

  it("parses the category pages", () => {
    expect(parseCalendarsSheetPage(CATEGORIES_PAGE)).toEqual({ kind: "categories" });
    expect(parseCalendarsSheetPage(CATEGORY_CREATE_PAGE)).toEqual({ kind: "category-create" });
    expect(parseCalendarsSheetPage(categoryEditPage("cat-1"))).toEqual({
      kind: "category-edit",
      id: "cat-1",
    });
    expect(parseCalendarsSheetPage(categoryEditPage(""))).toEqual({ kind: "root" });
    expect(isCalendarsSheetPage(CATEGORIES_PAGE)).toBe(true);
  });

  it("recognizes only calendars drawer keys", () => {
    expect(isCalendarsSheetPage(CALENDARS_ROOT_PAGE)).toBe(true);
    expect(isCalendarsSheetPage(CALENDAR_CREATE_PAGE)).toBe(true);
    expect(isCalendarsSheetPage(subscriptionEditPage("sub-1"))).toBe(true);
    expect(isCalendarsSheetPage("calendar")).toBe(false);
    expect(isCalendarsSheetPage(calendarEditPage(""))).toBe(false);
  });
});
