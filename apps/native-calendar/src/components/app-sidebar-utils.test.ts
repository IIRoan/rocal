import { SIDEBAR_VIEW_OPTIONS } from "./app-sidebar-utils";

describe("View switcher options", () => {
  it("exposes every calendar view in logical order", () => {
    expect(SIDEBAR_VIEW_OPTIONS.map((o) => o.view)).toEqual([
      "day",
      "3day",
      "week",
      "month",
      "agenda",
    ]);
  });

  it("provides a human-readable label for every view", () => {
    expect(SIDEBAR_VIEW_OPTIONS.map((o) => o.label)).toEqual([
      "Day",
      "3 Day",
      "Week",
      "Month",
      "Agenda",
    ]);
  });
});
