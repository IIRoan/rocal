import { formatCalendarHeaderTitle } from "./calendar-header-utils";

describe("formatCalendarHeaderTitle", () => {
  it("splits month and year", () => {
    expect(formatCalendarHeaderTitle(new Date(2022, 7, 18))).toEqual({
      month: "August",
      year: "2022",
    });
  });

  it("keeps the picker date's own day at month and year boundaries", () => {
    expect(formatCalendarHeaderTitle(new Date(2023, 0, 1))).toEqual({
      month: "January",
      year: "2023",
    });
    expect(formatCalendarHeaderTitle(new Date(2022, 11, 31, 23, 59))).toEqual({
      month: "December",
      year: "2022",
    });
  });
});
