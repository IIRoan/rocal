import { placePickedEndTime, roundUpToQuarterHour } from "../date-utils";

describe("roundUpToQuarterHour", () => {
  it("rounds up to the next quarter hour", () => {
    expect(
      roundUpToQuarterHour(new Date("2026-11-02T22:51:30.000Z")).toISOString(),
    ).toBe("2026-11-02T23:00:00.000Z");
    expect(
      roundUpToQuarterHour(new Date("2026-11-02T22:31:00.000Z")).toISOString(),
    ).toBe("2026-11-02T22:45:00.000Z");
  });

  it("keeps a time already on a quarter hour", () => {
    expect(
      roundUpToQuarterHour(new Date("2026-11-02T22:45:00.000Z")).toISOString(),
    ).toBe("2026-11-02T22:45:00.000Z");
  });

  it("lands on a quarter hour in quarter-hour offset zones", () => {
    const rounded = roundUpToQuarterHour(new Date("2026-11-02T10:01:00.000Z"));
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kathmandu",
        hour: "2-digit",
        minute: "2-digit",
      }).format(rounded),
    ).toBe("16:00");
  });
});

describe("placePickedEndTime", () => {
  it("rolls an end before the start over to the next day", () => {
    expect(
      placePickedEndTime(
        "2026-11-02T22:51",
        "2026-11-02T23:51",
        "2026-11-02T01:00",
      ),
    ).toBe("2026-11-03T01:00");
  });

  it("keeps a later end on the start day", () => {
    expect(
      placePickedEndTime(
        "2026-11-02T22:51",
        "2026-11-02T23:51",
        "2026-11-02T23:00",
      ),
    ).toBe("2026-11-02T23:00");
  });

  it("keeps the end day of an event exactly a day long", () => {
    expect(
      placePickedEndTime(
        "2026-11-02T10:00",
        "2026-11-03T10:00",
        "2026-11-03T10:30",
      ),
    ).toBe("2026-11-03T10:30");
  });

  it("brings an overnight end back to the start day when the time fits", () => {
    expect(
      placePickedEndTime(
        "2026-11-02T22:00",
        "2026-11-03T01:00",
        "2026-11-03T23:30",
      ),
    ).toBe("2026-11-02T23:30");
  });

  it("rolls across month and year ends", () => {
    expect(
      placePickedEndTime(
        "2026-12-31T23:00",
        "2026-12-31T23:30",
        "2026-12-31T00:30",
      ),
    ).toBe("2027-01-01T00:30");
  });

  it("keeps the end day of events longer than a day", () => {
    expect(
      placePickedEndTime(
        "2026-11-02T10:00",
        "2026-11-05T12:00",
        "2026-11-05T09:00",
      ),
    ).toBe("2026-11-05T09:00");
  });
});
