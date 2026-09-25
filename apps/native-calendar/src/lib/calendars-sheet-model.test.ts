import type { Calendar, CalendarSubscription } from "@workspace/calendar-core";
import {
  buildCalendarsSheetModel,
  ownedCalendarDetail,
  readOnlyCalendarDetail,
  validateCalendarName,
} from "./calendars-sheet-model";

function calendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "cal",
    name: "Work",
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "user-1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function subscription(
  id: string,
  name: string,
  kind: "public_holiday" | "subscribed",
  lastSyncAt: string | null = null,
): CalendarSubscription {
  return {
    id,
    name,
    url: `https://example.com/${id}.ics`,
    isActive: true,
    syncIntervalMinutes: 60,
    lastSyncAt,
    lastSyncStatus: "success",
    calendar: { id: `cal-${id}`, name, color: "green", kind },
    _count: { syncLogs: 0 },
  };
}

describe("buildCalendarsSheetModel", () => {
  it("puts the default calendar first, then sorts owned calendars by name", () => {
    const model = buildCalendarsSheetModel(
      [
        calendar({ id: "b", name: "Personal" }),
        calendar({ id: "c", name: "Family", isDefault: true }),
        calendar({ id: "a", name: "Errands" }),
      ],
      [],
    );
    expect(model.owned.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("splits read-only calendars into holidays and feeds and links their calendars", () => {
    const hiddenFeedCalendar = calendar({
      id: "cal-feed",
      name: "Team",
      kind: "subscribed",
      isVisible: false,
    });
    const model = buildCalendarsSheetModel(
      [calendar({ id: "own" }), hiddenFeedCalendar],
      [
        subscription("feed", "Team", "subscribed"),
        subscription("nl", "Dutch Holidays", "public_holiday"),
      ],
    );

    expect(model.owned.map((entry) => entry.id)).toEqual(["own"]);
    expect(model.holidays.map((entry) => entry.subscription.id)).toEqual(["nl"]);
    expect(model.feeds.map((entry) => entry.subscription.id)).toEqual(["feed"]);
    expect(model.feeds[0]?.calendar).toBe(hiddenFeedCalendar);
    expect(model.holidays[0]?.calendar).toBeUndefined();
  });
});

describe("validateCalendarName", () => {
  it("requires a non-blank name of at most 100 characters", () => {
    expect(validateCalendarName("  ")).toBe("Calendar name is required");
    expect(validateCalendarName("a".repeat(101))).toBe(
      "Calendar name must be 100 characters or less",
    );
    expect(validateCalendarName(`  ${"a".repeat(100)}  `)).toBeUndefined();
  });
});

describe("row details", () => {
  it("flags default, encrypted, and hidden owned calendars", () => {
    expect(ownedCalendarDetail(calendar({}))).toBeUndefined();
    expect(
      ownedCalendarDetail(
        calendar({ isDefault: true, forceFullEncryption: true, isVisible: false }),
      ),
    ).toBe("Default · Encrypted · Hidden");
  });

  it("shows last sync only for feeds, after the hidden flag", () => {
    const [holiday] = buildCalendarsSheetModel(
      [],
      [subscription("nl", "Dutch Holidays", "public_holiday")],
    ).holidays;
    expect(holiday && readOnlyCalendarDetail(holiday)).toBeUndefined();

    const [feed] = buildCalendarsSheetModel(
      [calendar({ id: "cal-feed", kind: "subscribed", isVisible: false })],
      [subscription("feed", "Team", "subscribed")],
    ).feeds;
    expect(feed && readOnlyCalendarDetail(feed)).toBe("Hidden · Synced never");
  });

  it("reports a failed feed sync instead of the last sync time", () => {
    const [feed] = buildCalendarsSheetModel(
      [],
      [{ ...subscription("feed", "Team", "subscribed"), lastErrorMessage: "404" }],
    ).feeds;
    expect(feed && readOnlyCalendarDetail(feed)).toBe("Sync failed");
  });
});
