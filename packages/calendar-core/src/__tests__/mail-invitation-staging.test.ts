import { describe, expect, it } from "@jest/globals";
import {
  isMailInvitationStagingCalendar,
  MAIL_INVITATION_STAGING_CALENDAR_NAME,
} from "../mail-invitation-staging";
import { partitionCalendarsByKind } from "../calendar-helpers";
import { listSidebarCalendars } from "../calendar-helpers";
import { transformCalendarEvents, createCalendarMap } from "../view-model";
import type { Calendar, CalendarEvent } from "../types";

function calendarFixture(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "calendar-1",
    name: "Personal",
    color: "#10b981",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: true,
    isSyncOnly: false,
    icsShareEnabled: false,
    forceFullEncryption: false,
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function eventFixture(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Planning sync",
    start: new Date("2026-05-27T10:00:00.000Z"),
    end: new Date("2026-05-27T11:00:00.000Z"),
    allDay: false,
    timezone: "UTC",
    isPrivate: false,
    isCancelled: false,
    isSynced: false,
    calendarId: "invitations-cal-1",
    userId: "user-1",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    participants: [
      {
        id: "participant-1",
        eventId: "event-1",
        userId: "user-1",
        email: "guest@example.com",
        displayName: "Guest",
        role: "attendee",
        status: "pending",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

describe("mail invitation staging helpers", () => {
  it("identifies the hidden invitations staging calendar", () => {
    expect(
      isMailInvitationStagingCalendar(
        calendarFixture({
          name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
          isVisible: false,
        }),
      ),
    ).toBe(true);
    expect(isMailInvitationStagingCalendar(calendarFixture())).toBe(false);
  });

  it("hides the invitations staging calendar from owned calendar lists", () => {
    const owned = calendarFixture({ id: "owned-1" });
    const staging = calendarFixture({
      id: "invitations-cal-1",
      name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
      isVisible: false,
    });

    expect(partitionCalendarsByKind([owned, staging])).toEqual({
      ownedCalendars: [owned],
      publicCalendars: [],
      subscribedCalendars: [],
    });
  });

  it("hides the invitations staging calendar from sidebar calendar lists", () => {
    const owned = calendarFixture({ id: "owned-1" });
    const staging = calendarFixture({
      id: "invitations-cal-1",
      name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
      isVisible: false,
    });

    expect(listSidebarCalendars([owned, staging])).toEqual([owned]);
  });

  it("still shows pending invitation ghost events from hidden calendars", () => {
    const calendars = [
      calendarFixture({ id: "owned-1" }),
      calendarFixture({
        id: "invitations-cal-1",
        name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
        isVisible: false,
      }),
    ];
    const calendarMap = createCalendarMap(calendars);
    const visibleCalendarIds = new Set(["owned-1"]);
    const ghostEvent = eventFixture();

    const result = transformCalendarEvents(
      [ghostEvent],
      calendarMap,
      visibleCalendarIds,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("event-1");
  });
});
