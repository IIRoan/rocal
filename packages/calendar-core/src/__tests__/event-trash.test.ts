import { describe, expect, it } from "@jest/globals";

import { formatTrashEntryDetail, getTrashRestoreNotice } from "../event-trash";

const entry = {
  start: new Date("2099-03-02T08:00:00.000Z"),
  allDay: false,
  timezone: "Europe/Amsterdam",
  trashedAt: new Date("2026-11-14T23:30:00.000Z"),
  purgeAt: new Date("2026-12-14T23:30:00.000Z"),
};

describe("formatTrashEntryDetail", () => {
  it("names the event date, when it was deleted and when it goes for good, in the account's zone", () => {
    expect(formatTrashEntryDetail(entry, "Europe/Amsterdam")).toBe(
      "Mon 2 Mar 2099 · Deleted 15 Nov · removed 15 Dec",
    );
    expect(formatTrashEntryDetail(entry, "America/New_York")).toBe(
      "Mon 2 Mar 2099 · Deleted 14 Nov · removed 14 Dec",
    );
  });

  it("reads an all-day event's date in the event's own zone", () => {
    const allDay = { ...entry, allDay: true, start: new Date("2099-03-01T23:00:00.000Z") };
    expect(formatTrashEntryDetail(allDay, "America/New_York")).toMatch(/^Mon 2 Mar 2099 · /);
  });
});

describe("getTrashRestoreNotice", () => {
  const calendars = [{ id: "personal", name: "Personal" }];

  it("names the calendar a restore fell back to", () => {
    expect(getTrashRestoreNotice("personal", "deleted-cal", calendars)).toBe("Restored to Personal");
    expect(getTrashRestoreNotice("personal", "deleted-cal", undefined)).toBe("Restored to your default calendar");
    expect(getTrashRestoreNotice("work", "work", calendars)).toBe("Event restored");
  });
});
