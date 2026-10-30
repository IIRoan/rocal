import { buildCalendarGridWeeks } from "./calendar-grid-utils";

const days = (viewMonth: Date, weekStartDay: number) =>
  buildCalendarGridWeeks(viewMonth, weekStartDay).map((week) =>
    week.cells.map((cell) => cell.day),
  );

describe("buildCalendarGridWeeks", () => {
  // November 2026 starts on a Sunday.
  const november = new Date(2026, 10, 1);

  it("starts weeks on Sunday when the user's week starts on Sunday", () => {
    const weeks = days(november, 0);
    expect(weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weeks.at(-1)).toEqual([29, 30, null, null, null, null, null]);
  });

  it("starts weeks on Monday when the user's week starts on Monday", () => {
    const weeks = days(november, 1);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(weeks.at(-1)).toEqual([30, null, null, null, null, null, null]);
  });

  it("starts weeks on Saturday when the user's week starts on Saturday", () => {
    expect(days(november, 6)[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
  });
});
