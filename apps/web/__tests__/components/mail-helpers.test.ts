import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { formatMessageDate } from "../../components/mail/mail-helpers";

describe("formatMessageDate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-26T12:00:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("shows today's time and one day-month format for every other date, whatever the browser locale", () => {
    expect(formatMessageDate("2026-11-26T08:15:00.000Z", "24h", "Europe/Amsterdam")).toBe("09:15");
    expect(formatMessageDate("2026-09-29T10:00:00.000Z", "24h", "Europe/Amsterdam")).toBe("29 Sep");
    expect(formatMessageDate("2026-10-02T10:00:00.000Z", "24h", "Europe/Amsterdam")).toBe("2 Oct");
    expect(formatMessageDate("2025-03-03T10:00:00.000Z", "24h", "Europe/Amsterdam")).toBe("3 Mar 2025");
  });

  it("counts the day in the account's time zone", () => {
    expect(formatMessageDate("2026-11-25T23:30:00.000Z", "24h", "Europe/Amsterdam")).toBe("00:30");
    expect(formatMessageDate("2026-11-25T23:30:00.000Z", "24h", "UTC")).toBe("25 Nov");
    expect(formatMessageDate(undefined, "24h", "UTC")).toBe("");
  });
});
