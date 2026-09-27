import { CALENDAR_VIEWS } from "@workspace/calendar-core";
import { isTimelineCalendarView } from "./calendar-views";

describe("isTimelineCalendarView", () => {
  it("routes day, 3-day, and week to the timeline", () => {
    for (const view of ["day", "3day", "week"] as const) {
      expect(isTimelineCalendarView(view)).toBe(true);
    }
  });

  it("keeps month and agenda instead of coercing them to week", () => {
    expect(isTimelineCalendarView("month")).toBe(false);
    expect(isTimelineCalendarView("agenda")).toBe(false);
  });

  it("classifies every shared calendar view", () => {
    expect(CALENDAR_VIEWS.filter(isTimelineCalendarView).sort()).toEqual([
      "3day",
      "day",
      "week",
    ]);
  });
});
