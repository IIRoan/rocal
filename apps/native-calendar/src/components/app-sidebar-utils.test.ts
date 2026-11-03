import { SIDEBAR_VIEW_OPTIONS } from "./app-sidebar-utils";

describe("View switcher options", () => {
  it("exposes every calendar view in logical order", () => {
    expect(SIDEBAR_VIEW_OPTIONS.map((o) => o.value)).toEqual([
      "day",
      "3day",
      "week",
      "month",
      "agenda",
    ]);
  });
});
