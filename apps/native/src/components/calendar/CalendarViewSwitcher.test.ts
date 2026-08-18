import {
  formatCalendarToolbarTitle,
  formatViewDateHeader,
  resolveCalendarSwitcherDate,
} from "./view-switcher-utils";

// ─── formatViewDateHeader ────────────────────────────────────────────────────

describe("formatCalendarToolbarTitle", () => {
  it("returns abbreviated month and year only", () => {
    const date = new Date(2025, 5, 10);
    expect(formatCalendarToolbarTitle(date)).toBe("Jun 2025");
  });

  it("does not include day numbers for week-focused dates", () => {
    const date = new Date(2025, 0, 15);
    expect(formatCalendarToolbarTitle(date)).toBe("Jan 2025");
  });
});

describe("formatViewDateHeader", () => {
  // Month view
  it('returns "MMMM yyyy" for month view', () => {
    const date = new Date(2025, 0, 15); // January 15, 2025
    expect(formatViewDateHeader("month", date)).toBe("January 2025");
  });

  it('returns "MMMM yyyy" for agenda view', () => {
    const date = new Date(2025, 5, 10); // June 10, 2025
    expect(formatViewDateHeader("agenda", date)).toBe("June 2025");
  });

  // Day view
  it('returns "MMM d, yyyy" for day view', () => {
    const date = new Date(2025, 0, 15); // January 15, 2025
    expect(formatViewDateHeader("day", date)).toBe("Jan 15, 2025");
  });

  it("handles single-digit day in day view", () => {
    const date = new Date(2025, 2, 3); // March 3, 2025
    expect(formatViewDateHeader("day", date)).toBe("Mar 3, 2025");
  });

  // Week view — same month
  it("shows compact range for week view within same month", () => {
    // Week of Jan 13–19, 2025 (Mon–Sun with weekStartDay=1)
    const date = new Date(2025, 0, 15); // Wednesday Jan 15
    const result = formatViewDateHeader("week", date, 1);
    expect(result).toBe("Jan 13 – 19");
  });

  // Week view — cross-month
  it("shows full month names for week view crossing months", () => {
    // Week containing Dec 30, 2024 – Jan 5, 2025 (Mon start)
    const date = new Date(2025, 0, 1); // Wednesday Jan 1
    const result = formatViewDateHeader("week", date, 1);
    expect(result).toBe("Dec 30 – Jan 5");
  });

  // Week view — Sunday start
  it("respects weekStartDay=0 (Sunday) for week view", () => {
    const date = new Date(2025, 0, 15); // Wednesday Jan 15
    const result = formatViewDateHeader("week", date, 0);
    // Sunday Jan 12 – Saturday Jan 18
    expect(result).toBe("Jan 12 – 18");
  });

  // 3-Day view — same month
  it("shows compact range for 3-day view within same month", () => {
    const date = new Date(2025, 0, 14); // Jan 14
    const result = formatViewDateHeader("3day", date);
    // Jan 13 – 15
    expect(result).toBe("Jan 13 – 15");
  });

  // 3-Day view — cross-month
  it("shows full month names for 3-day view crossing months", () => {
    const date = new Date(2024, 11, 31); // Dec 31
    const result = formatViewDateHeader("3day", date);
    // Dec 30 – Jan 1
    expect(result).toBe("Dec 30 – Jan 1");
  });

  // Default weekStartDay
  it("defaults weekStartDay to 0 (Sunday) when not provided", () => {
    const date = new Date(2025, 0, 15); // Wednesday Jan 15
    const result = formatViewDateHeader("week", date);
    // Sunday Jan 12 – Saturday Jan 18
    expect(result).toBe("Jan 12 – 18");
  });

  it("uses the configured timezone so the week title matches the grid", () => {
    const date = new Date("2026-08-23T22:30:00.000Z");
    expect(formatViewDateHeader("week", date, 1, "Europe/Amsterdam")).toBe(
      "Aug 24 – 30",
    );
  });
});

describe("resolveCalendarSwitcherDate", () => {
  it("keeps the week title on the page being previewed during a swipe", () => {
    const selectedDate = new Date(2026, 7, 11);
    const previewDate = new Date(2026, 7, 18);

    expect(
      formatViewDateHeader(
        "week",
        resolveCalendarSwitcherDate({
          view: "week",
          currentDate: selectedDate,
          selectedDate,
          previewDate,
        }),
        1,
        "Europe/Amsterdam",
      ),
    ).toBe("Aug 17 – 23");
  });

  it("uses the selected date for timeline titles once the swipe commits", () => {
    const selectedDate = new Date(2026, 7, 18);

    expect(
      formatViewDateHeader(
        "week",
        resolveCalendarSwitcherDate({
          view: "week",
          currentDate: new Date(2026, 7, 1),
          selectedDate,
        }),
        1,
        "Europe/Amsterdam",
      ),
    ).toBe("Aug 17 – 23");
  });
});
