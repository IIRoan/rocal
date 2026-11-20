import { describe, expect, it } from "@jest/globals";

import {
  formatTrashEntryDetail,
  getEventDeleteConfirmCopy,
  getTrashRestoreNotice,
} from "../event-trash";
import type { EventParticipant } from "../types";

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

describe("getEventDeleteConfirmCopy", () => {
  const event = {
    id: "event-1",
    title: "Planning",
    start: new Date("2099-03-02T08:00:00.000Z"),
    userId: "me",
  };
  const attendee: EventParticipant = {
    id: "p-1",
    eventId: "event-1",
    userId: "me",
    email: "me@solace.test",
    role: "attendee",
    status: "accepted",
  };
  const invitation = { ...event, externalId: "uid-1", participants: [attendee] };
  const series = { ...event, recurrence: "RRULE:FREQ=WEEKLY" };
  const detached = { ...event, id: "child-1", parentEventId: "event-1" };
  const description = (...args: Parameters<typeof getEventDeleteConfirmCopy>) =>
    getEventDeleteConfirmCopy(...args).description;

  it("sends a whole event or series to the trash", () => {
    expect(getEventDeleteConfirmCopy(event)).toEqual({
      title: "Delete “Planning”?",
      description: "It moves to Trash for 30 days.",
      confirmLabel: "Delete event",
    });
    expect(description(series, "all")).toBe("It moves to Trash for 30 days.");
  });

  it("trashes an occurrence that was already edited into its own row", () => {
    expect(description(detached, "this_only")).toBe("It moves to Trash for 30 days.");
    expect(description(detached, "this_and_future")).toBe("You can’t undo this.");
  });

  it("deletes one occurrence or the rest of a series for good", () => {
    expect(description(series, "this_only")).toBe("You can’t undo this.");
    expect(description(series, "this_and_future")).toBe("You can’t undo this.");
  });

  it("declines and removes an attendee's invitation for good", () => {
    expect(getEventDeleteConfirmCopy(invitation)).toEqual({
      title: "Decline “Planning”?",
      description: "The invitation is declined and leaves your calendar. You can’t undo this.",
      confirmLabel: "Decline and remove",
    });
    expect(getEventDeleteConfirmCopy({ ...invitation, isCancelled: true }).confirmLabel).toBe(
      "Remove event",
    );
    expect(description({ ...invitation, recurrence: "RRULE:FREQ=WEEKLY" }, "all")).toBe(
      "You can’t undo this.",
    );
  });

  it("trashes a cancelled event that came without an invitation", () => {
    const cancelled = { ...event, isCancelled: true, participants: [attendee] };
    expect(description(cancelled)).toBe("It moves to Trash for 30 days.");
  });
});
