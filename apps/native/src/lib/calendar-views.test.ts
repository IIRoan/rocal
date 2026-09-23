import { toNativeCalendarView } from "./calendar-views";

describe("toNativeCalendarView", () => {
  it("opens week view when the shared default is month", () => {
    expect(toNativeCalendarView("month")).toBe("week");
  });

  it("keeps views native renders", () => {
    for (const view of ["day", "3day", "week", "agenda"] as const) {
      expect(toNativeCalendarView(view)).toBe(view);
    }
  });
});
