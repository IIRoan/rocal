import {
  formatLastSync,
  getSubscriptionType,
  isNamedCalendarColor,
  normalizeSubscriptionUrl,
  sortSubscriptions,
  validateCreateSubscriptionInput,
  validateEditableSubscriptionInput,
} from "./subscription-utils";
import type { CalendarSubscription } from "@workspace/calendar-core";

function makeSubscription(
  overrides: Omit<Partial<CalendarSubscription>, "calendar"> & {
    calendar?: Partial<CalendarSubscription["calendar"]>;
  } = {},
): CalendarSubscription {
  const { calendar: calendarOverrides, ...rest } = overrides;
  return {
    id: "sub-1",
    url: "https://example.com/cal.ics",
    isActive: true,
    syncIntervalMinutes: 60,
    lastSyncAt: null,
    lastSyncStatus: "success",
    lastErrorMessage: null,
    calendar: {
      id: "cal-1",
      name: "Example",
      color: "blue",
      kind: "subscribed",
      isPublic: false,
      ...calendarOverrides,
    },
    _count: { syncLogs: 0 },
    ...rest,
  } as CalendarSubscription;
}

describe("subscription-utils", () => {
  describe("isNamedCalendarColor", () => {
    it("delegates to the calendar color validator", () => {
      expect(isNamedCalendarColor("blue")).toBe(true);
      expect(isNamedCalendarColor("nope")).toBe(false);
    });
  });

  describe("validateCreateSubscriptionInput", () => {
    it("returns no errors for valid input", () => {
      expect(
        validateCreateSubscriptionInput({
          name: "Holidays",
          url: "https://example.com/holidays.ics",
          color: "blue",
        }),
      ).toEqual({});
    });

    it("requires a name", () => {
      const errors = validateCreateSubscriptionInput({
        name: "  ",
        url: "https://example.com/cal.ics",
        color: "blue",
      });
      expect(errors.name).toBeDefined();
    });

    it("rejects names over 100 characters", () => {
      const errors = validateCreateSubscriptionInput({
        name: "a".repeat(101),
        url: "https://example.com/cal.ics",
        color: "blue",
      });
      expect(errors.name).toContain("100");
    });

    it("rejects non-http(s) protocols", () => {
      const errors = validateCreateSubscriptionInput({
        name: "Cal",
        url: "ftp://example.com/cal.ics",
        color: "blue",
      });
      expect(errors.url).toBeDefined();
    });

    it("requires the URL to point to a calendar feed", () => {
      const errors = validateCreateSubscriptionInput({
        name: "Cal",
        url: "https://example.com/calendar",
        color: "blue",
      });
      expect(errors.url).toContain("calendar feed");
    });

    it("accepts tokenized PHP calendar endpoints", () => {
      const errors = validateCreateSubscriptionInput({
        name: "School",
        url: "https://wdka.asimut.net/api/ical.php?token=WoiiytWf6gsXPMww",
        color: "blue",
      });
      expect(errors).toEqual({});
    });

    it("rejects malformed URLs", () => {
      const errors = validateCreateSubscriptionInput({
        name: "Cal",
        url: "not a url",
        color: "blue",
      });
      expect(errors.url).toBeDefined();
    });

    it("rejects invalid colors", () => {
      const errors = validateCreateSubscriptionInput({
        name: "Cal",
        url: "https://example.com/cal.ics",
        color: "rainbow",
      });
      expect(errors.color).toBeDefined();
    });
  });

  describe("validateEditableSubscriptionInput", () => {
    it("validates name and color but not url", () => {
      expect(
        validateEditableSubscriptionInput({ name: "Cal", color: "blue" }),
      ).toEqual({});
      const errors = validateEditableSubscriptionInput({
        name: "",
        color: "bad",
      });
      expect(errors.name).toBeDefined();
      expect(errors.color).toBeDefined();
    });
  });

  describe("normalizeSubscriptionUrl", () => {
    it("strips hash and trailing slashes while preserving query params", () => {
      expect(
        normalizeSubscriptionUrl("https://example.com/cal/?x=1#frag"),
      ).toBe("https://example.com/cal?x=1");
    });

    it("returns trimmed original for invalid urls", () => {
      expect(normalizeSubscriptionUrl("  not a url  ")).toBe("not a url");
    });
  });

  describe("formatLastSync", () => {
    it("returns Never for missing or invalid dates", () => {
      expect(formatLastSync(null)).toBe("Never");
      expect(formatLastSync(undefined)).toBe("Never");
      expect(formatLastSync("not-a-date")).toBe("Never");
    });

    it("returns Just now for very recent syncs", () => {
      expect(formatLastSync(new Date())).toBe("Just now");
    });

    it("formats minutes, hours and days ago", () => {
      const now = Date.now();
      expect(formatLastSync(new Date(now - 5 * 60 * 1000))).toBe("5 min ago");
      expect(formatLastSync(new Date(now - 2 * 60 * 60 * 1000))).toBe(
        "2 hours ago",
      );
      expect(formatLastSync(new Date(now - 1 * 60 * 60 * 1000))).toBe(
        "1 hour ago",
      );
      expect(formatLastSync(new Date(now - 3 * 24 * 60 * 60 * 1000))).toBe(
        "3 days ago",
      );
    });
  });

  describe("getSubscriptionType", () => {
    it("identifies holiday calendars", () => {
      expect(
        getSubscriptionType(
          makeSubscription({ calendar: { kind: "public_holiday" } }),
        ),
      ).toBe("holiday");
    });

    it("treats everything else as external", () => {
      expect(getSubscriptionType(makeSubscription())).toBe("external");
    });
  });

  describe("sortSubscriptions", () => {
    it("orders holidays first, then alphabetically by name", () => {
      const subs = [
        makeSubscription({
          id: "b",
          calendar: { id: "b", name: "Zürich", kind: "subscribed" },
        }),
        makeSubscription({
          id: "a",
          calendar: { id: "a", name: "Amsterdam", kind: "subscribed" },
        }),
        makeSubscription({
          id: "h",
          calendar: { id: "h", name: "Dutch Holidays", kind: "public_holiday" },
        }),
      ];

      const sorted = sortSubscriptions(subs);
      expect(sorted.map((s) => s.id)).toEqual(["h", "a", "b"]);
    });

    it("does not mutate the input array", () => {
      const subs = [makeSubscription({ id: "x" })];
      const sorted = sortSubscriptions(subs);
      expect(sorted).not.toBe(subs);
    });
  });
});
