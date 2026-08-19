import { wallClockToUtc } from "@workspace/calendar-core";
import {
  formatTimelineEventTime,
  resolveTimelineEventDensity,
  shouldShowEncryptionIcon,
  timelineEventHeight,
  timelineEventTitleLines,
} from "./timeline-event-content";

const TIMEZONE = "Europe/Amsterdam";

describe("shouldShowEncryptionIcon", () => {
  it("hides the badge for plaintext events", () => {
    expect(
      shouldShowEncryptionIcon({ encryptionState: "plaintext" }),
    ).toBe(false);
  });

  it("shows the badge for decrypted encrypted events", () => {
    expect(
      shouldShowEncryptionIcon({
        encryptionState: "encrypted",
        encryptedContent: null,
      }),
    ).toBe(true);
  });

  it("shows the badge when a calendar forces full encryption", () => {
    expect(
      shouldShowEncryptionIcon({
        encryptionState: "plaintext",
        calendar: { forceFullEncryption: true },
      }),
    ).toBe(true);
  });
});

describe("resolveTimelineEventDensity", () => {
  it("stacks hour-long timed events so the title can use the block", () => {
    expect(
      resolveTimelineEventDensity({ durationMinutes: 60 }),
    ).toBe("stacked");
  });

  it("uses stacked density for 30-minute events", () => {
    expect(
      resolveTimelineEventDensity({ durationMinutes: 30 }),
    ).toBe("stacked");
  });

  it("uses compact chips for short events", () => {
    expect(
      resolveTimelineEventDensity({ durationMinutes: 15 }),
    ).toBe("compact");
  });

  it("treats all-day events as compact header chips", () => {
    expect(
      resolveTimelineEventDensity({ durationMinutes: 1440, allDay: true }),
    ).toBe("compact");
  });
});

describe("formatTimelineEventTime", () => {
  it("omits :00 in 24-hour labels and keeps minutes otherwise", () => {
    const nine = wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
    const nineThirty = wallClockToUtc(new Date(2026, 7, 18), 9, 30, TIMEZONE);

    expect(formatTimelineEventTime(nine, "24h", TIMEZONE)).toBe("9");
    expect(formatTimelineEventTime(nineThirty, "24h", TIMEZONE)).toBe("9:30");
  });

  it("formats 12-hour labels in the user timezone, not the device zone", () => {
    const instant = wallClockToUtc(new Date(2026, 7, 18), 14, 0, TIMEZONE);
    expect(formatTimelineEventTime(instant, "12h", TIMEZONE)).toBe("2pm");
  });
});

describe("timelineEventHeight", () => {
  it("maps 60 minutes to the kit hour height", () => {
    expect(timelineEventHeight(60, 72)).toBe(72);
    expect(timelineEventHeight(30, 72)).toBe(36);
  });
});

describe("timelineEventTitleLines", () => {
  it("keeps short chips to a single line", () => {
    expect(timelineEventTitleLines("compact", 15)).toBe(1);
    expect(timelineEventTitleLines("small", 20)).toBe(1);
  });

  it("lets a 45-minute event wrap instead of ellipsizing immediately", () => {
    expect(timelineEventTitleLines("stacked", 45)).toBeGreaterThanOrEqual(3);
  });
});
