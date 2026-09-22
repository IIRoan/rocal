import { formatCalendarHeaderTitle } from "./calendar-header-utils";

describe("formatCalendarHeaderTitle", () => {
  it("splits month and year", () => {
    expect(
      formatCalendarHeaderTitle(new Date("2022-08-18T12:00:00Z"), "Europe/Amsterdam"),
    ).toEqual({ month: "August", year: "2022" });
  });

  it("uses the user timezone rather than UTC", () => {
    const instant = new Date("2022-12-31T23:30:00Z");
    expect(formatCalendarHeaderTitle(instant, "Europe/Amsterdam")).toEqual({
      month: "January",
      year: "2023",
    });
    expect(formatCalendarHeaderTitle(instant, "America/New_York")).toEqual({
      month: "December",
      year: "2022",
    });
  });
});
