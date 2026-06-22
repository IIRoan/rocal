import { describe, expect, it } from "@jest/globals";
import type {
  CalendarEvent,
  EventNotification,
} from "@workspace/ui/components/calendar";

import {
  buildEventEditorEncryptionPreview,
  canSaveEventEditor,
  formatReminderMinutes,
  getEnabledEmailReminderMinutes,
  getEventDateDisplay,
  getRecurringRuleSummary,
  isRecurringEventDeleteCandidate,
} from "../../lib/event-editor-view-model";
import type { RecurrenceRule } from "../../lib/types/calendar";

const reminderNotifications: Array<
  Pick<EventNotification, "isEnabled" | "minutesBefore" | "notificationType">
> = [
  {
    isEnabled: true,
    minutesBefore: 60,
    notificationType: "email",
  },
  {
    isEnabled: false,
    minutesBefore: 15,
    notificationType: "email",
  },
  {
    isEnabled: true,
    minutesBefore: 5,
    notificationType: "email",
  },
];

const recurringSeriesRule: RecurrenceRule = {
  byWeekDay: [1, 3, 5],
  count: 10,
  frequency: "weekly",
  interval: 2,
};

const monthlyUntilRule: RecurrenceRule = {
  frequency: "monthly",
  interval: 1,
  until: new Date("2026-05-01T00:00:00.000Z"),
};

type RecurringDeleteCandidate = Pick<
  CalendarEvent,
  "id" | "isRecurringInstance" | "parentEventId" | "recurrence"
>;

describe("event-editor-view-model", () => {
  it("derives the correct encryption preview states", () => {
    expect(
      buildEventEditorEncryptionPreview({
        hasActiveEncryptionSession: false,
      }),
    ).toEqual({ encryptionState: "plaintext" });

    expect(
      buildEventEditorEncryptionPreview({
        hasActiveEncryptionSession: true,
      }),
    ).toEqual({ encryptionState: "encrypted" });
  });

  it("formats dates, reminders, and enabled reminder lists consistently", () => {
    expect(
      getEventDateDisplay(new Date(2026, 3, 24), new Date(2026, 3, 24)),
    ).toEqual({
      isSameDay: true,
      label: "Friday, April 24, 2026",
      startLabel: "Fri, Apr 24",
      endLabel: "Fri, Apr 24",
    });

    expect(
      getEventDateDisplay(new Date(2026, 3, 24), new Date(2026, 3, 25)),
    ).toEqual({
      endLabel: "Sat, Apr 25, 2026",
      isSameDay: false,
      label: "Friday, April 24, 2026",
      startLabel: "Fri, Apr 24",
    });

    expect(formatReminderMinutes(30)).toBe("30 min");
    expect(formatReminderMinutes(120)).toBe("2 hours");
    expect(formatReminderMinutes(2880)).toBe("2 days");
    expect(formatReminderMinutes(20160)).toBe("2 weeks");

    expect(getEnabledEmailReminderMinutes(reminderNotifications)).toEqual([
      5, 60,
    ]);
  });

  it("summarizes recurrence and recurring delete eligibility", () => {
    expect(getRecurringRuleSummary(recurringSeriesRule)).toBe(
      "Every 2 weeks on Mon, Wed, Fri, 10 times",
    );

    expect(getRecurringRuleSummary(monthlyUntilRule)).toBe(
      "Monthly, until May 1, 2026",
    );

    expect(
      isRecurringEventDeleteCandidate({
        id: "parent_2026-04-24",
        recurrence: null,
      } as RecurringDeleteCandidate),
    ).toBe(true);
    expect(
      isRecurringEventDeleteCandidate({
        id: "event-1",
        recurrence: null,
      } as RecurringDeleteCandidate),
    ).toBe(false);
  });

  it("only allows save when the form is valid and not already saving", () => {
    expect(
      canSaveEventEditor({
        eventCalendarId: "calendar-1",
        eventSaving: false,
        eventTitle: "Planning",
      }),
    ).toBe(true);
    expect(
      canSaveEventEditor({
        eventCalendarId: "",
        eventSaving: false,
        eventTitle: "Planning",
      }),
    ).toBe(false);
    expect(
      canSaveEventEditor({
        eventCalendarId: "calendar-1",
        eventSaving: true,
        eventTitle: "Planning",
      }),
    ).toBe(false);
    expect(
      canSaveEventEditor({
        eventCalendarId: "calendar-1",
        eventSaving: false,
        eventTitle: "   ",
      }),
    ).toBe(false);
  });
});
