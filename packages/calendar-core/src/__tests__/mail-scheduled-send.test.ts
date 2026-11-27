import { describe, expect, it } from "@jest/globals";
import {
  assertMailSendHold,
  formatScheduledSendShortTime,
  getScheduledSendPresets,
  parseScheduledSendInput,
  resolveMailSendHold,
  scheduledSendKeyword,
  scheduledSendLatest,
} from "../mail-scheduled-send";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const policy = { maxDelayedSendSeconds: 30 * 86_400 };
const zone = "Europe/Amsterdam";

describe("scheduled send presets", () => {
  it("builds wall-clock presets across the October DST change", () => {
    const saturday = new Date("2026-10-24T18:00:00Z");
    expect(getScheduledSendPresets(saturday, zone, saturday.getTime() + 7 * DAY)).toEqual([
      { label: "Tomorrow morning", sendAt: "2026-10-25T07:00:00Z" },
      { label: "Tomorrow afternoon", sendAt: "2026-10-25T12:00:00Z" },
      { label: "Monday morning", sendAt: "2026-10-26T07:00:00Z" },
    ]);
  });

  it("omits Monday when it is tomorrow and drops presets past the cap", () => {
    const sunday = new Date("2026-11-15T20:00:00Z");
    expect(getScheduledSendPresets(sunday, zone, sunday.getTime() + 13 * HOUR).map((preset) => preset.label)).toEqual([
      "Tomorrow morning",
    ]);
  });

  it("parses a custom day and time in the user's zone", () => {
    expect(parseScheduledSendInput("2026-07-01", "09:30", zone)).toBe("2026-07-01T07:30:00Z");
    expect(parseScheduledSendInput("2026-07-01", "25:00", zone)).toBeNull();
    expect(parseScheduledSendInput("01-07-2026", "09:30", zone)).toBeNull();
  });
});

describe("send hold caps", () => {
  const now = Date.parse("2026-11-15T10:00:00Z");

  it("caps sealed holds at 7 days, external at 24 hours and both at the server maximum", () => {
    expect(scheduledSendLatest(now, policy, false)).toBe(now + 7 * DAY);
    expect(scheduledSendLatest(now, policy, true)).toBe(now + DAY);
    expect(scheduledSendLatest(now, { maxDelayedSendSeconds: 3600 }, false)).toBe(now + HOUR);
  });

  it("resolves an undo window, a schedule and the refusals", () => {
    const base = { undoSendSeconds: 5, policy, hasExternalRecipients: false, now };
    expect(resolveMailSendHold(base)).toEqual({ hold: { forSeconds: 5 } });
    expect(resolveMailSendHold({ ...base, undoSendSeconds: 0 })).toEqual({});
    expect(resolveMailSendHold({ ...base, sendAt: "2026-11-20T10:00:00Z" })).toEqual({ hold: { until: "2026-11-20T10:00:00Z" } });
    expect(resolveMailSendHold({ ...base, sendAt: "2026-11-15T10:01:00Z" }).error).toMatch("2 minutes");
    expect(resolveMailSendHold({ ...base, sendAt: "2026-11-23T10:00:00Z" }).error).toMatch("7 days");
    expect(resolveMailSendHold({ ...base, hasExternalRecipients: true, sendAt: "2026-11-17T10:00:00Z" }).error).toMatch("24 hours");
    expect(resolveMailSendHold({ ...base, sendAt: "tomorrow" }).error).toBe("Invalid send time.");
  });

  it("sends immediately without a schedule when the server has no delayed sending", () => {
    const base = { undoSendSeconds: 5, policy: { maxDelayedSendSeconds: 0 }, hasExternalRecipients: false, now };
    expect(resolveMailSendHold(base)).toEqual({});
    expect(resolveMailSendHold({ ...base, sendAt: "2026-11-16T10:00:00Z" }).error).toBeDefined();
  });

  it("refuses a plaintext hold past 24 hours", () => {
    const sealed = { blobId: "b", size: 1 };
    expect(() => assertMailSendHold({ hold: { until: "2026-11-17T10:00:00Z" }, sentCopyCiphertext: sealed }, now)).toThrow("Invalid send time.");
    expect(() => assertMailSendHold({ hold: { until: "2026-11-17T10:00:00Z" }, sentCopyCiphertext: null }, now)).not.toThrow();
    expect(() => assertMailSendHold({ hold: { forSeconds: 30 }, sentCopyCiphertext: sealed }, now)).not.toThrow();
  });

  it("keys the copy by the submission token", () => {
    expect(scheduledSendKeyword("a".repeat(32))).toBe(`$solace-scheduled-${"a".repeat(32)}`);
    expect(() => scheduledSendKeyword("nope")).toThrow();
  });
});

describe("formatScheduledSendShortTime", () => {
  it("names the day and clock time in the account's zone and format, without the year", () => {
    const sendAt = "2026-11-27T12:00:00Z";
    expect(formatScheduledSendShortTime(sendAt, zone, "24h")).toBe("Nov 27, 13:00");
    expect(formatScheduledSendShortTime(sendAt, zone, "12h")).toBe("Nov 27, 1:00 PM");
    expect(formatScheduledSendShortTime("2026-11-27T23:30:00Z", zone, "24h")).toBe("Nov 28, 00:30");
  });
});
