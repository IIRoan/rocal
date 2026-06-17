import { describe, expect, it } from "bun:test";
import {
  isLikelyIcsFeedUrl,
  normalizeSubscriptionFeedUrl,
} from "./subscription-url";

describe("isLikelyIcsFeedUrl", () => {
  it("accepts direct .ics and .ical files", () => {
    expect(isLikelyIcsFeedUrl("https://example.com/calendar.ics")).toBe(true);
    expect(isLikelyIcsFeedUrl("https://example.com/calendar.ical")).toBe(true);
  });

  it("accepts tokenized PHP calendar endpoints", () => {
    expect(
      isLikelyIcsFeedUrl(
        "https://wdka.asimut.net/api/ical.php?token=WoiiytWf6gsXPMww",
      ),
    ).toBe(true);
  });

  it("accepts .ics feeds with a trailing slash before query params", () => {
    expect(
      isLikelyIcsFeedUrl(
        "https://example.com/calendar.ics/?token=abc",
      ),
    ).toBe(true);
  });

  it("accepts webcal URLs", () => {
    expect(
      isLikelyIcsFeedUrl("webcal://example.com/team/calendar.ics"),
    ).toBe(true);
  });

  it("rejects unrelated HTTP URLs", () => {
    expect(isLikelyIcsFeedUrl("https://example.com/calendar.json")).toBe(false);
    expect(isLikelyIcsFeedUrl("ftp://example.com/calendar.ics")).toBe(false);
    expect(isLikelyIcsFeedUrl("not a url")).toBe(false);
  });
});

describe("normalizeSubscriptionFeedUrl", () => {
  it("preserves query parameters used for authentication", () => {
    expect(
      normalizeSubscriptionFeedUrl(
        "https://example.com/feed/calendar.ics/?token=abc#top",
      ),
    ).toBe("https://example.com/feed/calendar.ics?token=abc");
  });

  it("normalizes tokenized PHP endpoints", () => {
    expect(
      normalizeSubscriptionFeedUrl(
        "https://wdka.asimut.net/api/ical.php?token=WoiiytWf6gsXPMww",
      ),
    ).toBe("https://wdka.asimut.net/api/ical.php?token=WoiiytWf6gsXPMww");
  });

  it("converts webcal URLs to https", () => {
    expect(
      normalizeSubscriptionFeedUrl("webcal://example.com/calendar.ics"),
    ).toBe("https://example.com/calendar.ics");
  });
});
