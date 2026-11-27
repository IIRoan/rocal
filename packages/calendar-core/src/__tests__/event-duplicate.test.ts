import { describe, expect, it } from "@jest/globals";

import { buildEventDuplicate, canDuplicateEvent } from "../event-duplicate";
import { MAIL_INVITATION_STAGING_CALENDAR_NAME } from "../mail-invitation-staging";
import type { Calendar, CalendarEvent } from "../types";

function calendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "work",
    name: "Work",
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "u1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const work = calendar({ id: "work" });
const feed = calendar({ id: "feed", name: "Holidays", isSyncOnly: true });
const staging = calendar({
  id: "staging",
  name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
  isVisible: false,
});

const event: CalendarEvent = {
  id: "e1",
  title: "Standup",
  description: "Notes",
  location: "Room 4",
  start: new Date("2026-11-25T09:00:00Z"),
  end: new Date("2026-11-25T09:15:00Z"),
  timezone: "Europe/Amsterdam",
  allDay: false,
  color: "green",
  calendarId: "work",
  categoryId: "c1",
  recurrence: '{"frequency":"weekly"}',
  reminder: 10,
  userId: "u1",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isSynced: true,
  parentEventId: "series",
  participants: [
    { id: "p1", eventId: "e1", email: "a@x.test", role: "organizer", status: "accepted" },
  ],
};

describe("buildEventDuplicate", () => {
  it("copies content and times into an unsaved event without invitees or sync state", () => {
    expect(buildEventDuplicate(event, [work])).toMatchObject({
      id: "",
      title: "Standup",
      description: "Notes",
      location: "Room 4",
      start: event.start,
      end: event.end,
      color: "green",
      calendarId: "work",
      categoryId: "c1",
      recurrence: '{"frequency":"weekly"}',
      reminder: 10,
      participants: [],
    });
    const copy = buildEventDuplicate(event, [work]);
    expect(copy?.isSynced).toBeUndefined();
    expect(copy?.parentEventId).toBeUndefined();
    expect(copy?.start).not.toBe(event.start);
  });

  it("moves copies of feed or invitation events to a writable calendar", () => {
    expect(buildEventDuplicate({ ...event, calendarId: "feed" }, [feed, staging, work])?.calendarId).toBe("work");
    expect(buildEventDuplicate({ ...event, calendarId: "staging" }, [staging, work])?.calendarId).toBe("work");
  });

  it("offers nothing without a writable calendar or readable content", () => {
    expect(canDuplicateEvent(event, [feed, staging])).toBe(false);
    expect(buildEventDuplicate(event, [feed])).toBeNull();
    expect(canDuplicateEvent({ ...event, contentUnavailable: true }, [work])).toBe(false);
    expect(canDuplicateEvent({ ...event, id: "" }, [work])).toBe(false);
    expect(canDuplicateEvent(event, [work])).toBe(true);
  });
});
