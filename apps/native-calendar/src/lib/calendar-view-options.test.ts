import { VIEW_OPTIONS } from "./calendar-view-options";

describe("calendar view options", () => {
  it("covers every native calendar view", () => {
    expect(VIEW_OPTIONS.map((o) => o.value)).toEqual(["week", "day", "3day"]);
  });
});
