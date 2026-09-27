import {
  buildEventIcsExport,
  EventIcsExportError,
  toSafeIcsFilename,
} from "../event-ics-export";
import type { CalendarEvent } from "../types";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Team standup",
    description: "Daily sync",
    location: "Room 4",
    start: new Date("2025-06-16T07:00:00.000Z"),
    end: new Date("2025-06-16T07:30:00.000Z"),
    timezone: "Europe/Amsterdam",
    allDay: false,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date("2025-06-01T00:00:00.000Z"),
    updatedAt: new Date("2025-06-02T00:00:00.000Z"),
    ...overrides,
  };
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

describe("toSafeIcsFilename", () => {
  it("slugs the title and appends .ics", () => {
    expect(toSafeIcsFilename("Team Standup / Q3")).toBe("team-standup-q3.ics");
  });

  it("falls back to calendar.ics for empty or symbol-only titles", () => {
    expect(toSafeIcsFilename("   ")).toBe("calendar.ics");
    expect(toSafeIcsFilename("!!!")).toBe("calendar.ics");
  });
});

describe("buildEventIcsExport", () => {
  it("exports the decrypted content of a single event", () => {
    const { icsContent, filename } = buildEventIcsExport(makeEvent(), {
      calendarName: "Work",
    });
    const ics = unfold(icsContent);

    expect(filename).toBe("team-standup.ics");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Work");
    expect(ics).toContain("SUMMARY:Team standup");
    expect(ics).toContain("DESCRIPTION:Daily sync");
    expect(ics).toContain("LOCATION:Room 4");
    expect(ics).toContain("UID:evt-1@solace-calendar.local");
  });

  it("keeps the series rule for a recurring master", () => {
    const ics = unfold(
      buildEventIcsExport(
        makeEvent({
          recurrence: JSON.stringify({ frequency: "weekly", interval: 2, byWeekDay: [1] }),
        }),
      ).icsContent,
    );
    expect(ics).toMatch(/RRULE:FREQ=WEEKLY;INTERVAL=2/);
  });

  it("exports an expanded occurrence as a single event without the series rule", () => {
    const { icsContent, filename } = buildEventIcsExport(
      makeEvent({
        id: "evt-1_2025-06-23T07:00:00.000Z",
        parentEventId: "evt-1",
        isRecurringInstance: true,
        start: new Date("2025-06-23T07:00:00.000Z"),
        end: new Date("2025-06-23T07:30:00.000Z"),
        recurrence: JSON.stringify({ frequency: "weekly", interval: 1 }),
      }),
    );
    const ics = unfold(icsContent);

    expect(filename).toBe("team-standup-2025-06-23.ics");
    expect(ics).not.toContain("RRULE");
    expect(ics).toContain("UID:evt-1-2025-06-23T07:00:00.000Z@solace-calendar.local");
  });

  it("uses the neutral calendar label when the calendar name is unavailable", () => {
    const ics = unfold(buildEventIcsExport(makeEvent()).icsContent);
    expect(ics).toContain("X-WR-CALNAME:Solace calendar");
  });

  it("refuses to export an event this device could not decrypt", () => {
    expect(() =>
      buildEventIcsExport(
        makeEvent({ title: "Encrypted event", encryptionState: "encrypted" }),
      ),
    ).toThrow(EventIcsExportError);
  });

  it("exports an encrypted event once it is decrypted on-device", () => {
    const ics = unfold(
      buildEventIcsExport(makeEvent({ encryptionState: "encrypted" })).icsContent,
    );
    expect(ics).toContain("SUMMARY:Team standup");
  });
});
