import {
  buildRiftboundIcs,
  parseRiftboundEventUrl,
  type RiftboundEvent,
} from "../riftbound";
import { parseIcsImport } from "../ics-import";

const event: RiftboundEvent = {
  id: "123",
  title: "Nexus Night",
  start: "2026-10-30T18:00:00.000Z",
  location: "Berkel en Rodenrijs",
};

describe("Riftbound boundaries", () => {
  it("accepts a localized public event URL and preserves a long opaque identifier as a string", () => {
    expect(
      parseRiftboundEventUrl(
        "https://playriftbound.com/en-US/events/117489519215247523",
      ),
    ).toBe("117489519215247523");
  });

  it.each([
    "https://evil.test/en-US/events/123",
    "https://playriftbound.com.evil.test/en-US/events/123",
    "http://playriftbound.com/en-US/events/123",
    "https://name:secret@playriftbound.com/en-US/events/123",
    "https://playriftbound.com/en-US/events/123?name=private",
    "https://playriftbound.com/en-US/events/123#secret",
    "https://playriftbound.com/en-US/events/abc",
  ])("rejects untrusted or private-bearing event URLs", (url) => {
    expect(() => parseRiftboundEventUrl(url)).toThrow();
  });

  it.each(["not-a-date", "2026-10-30T18:00:00", "2026-02-30T18:00:00Z"])(
    "rejects invalid or timezone-free instants",
    (startsAt) => {
      expect(() =>
        buildRiftboundIcs([{ ...event, start: startsAt }], 240),
      ).toThrow();
    },
  );

  it("rejects carriage-return injection from upstream content", () => {
    expect(() =>
      buildRiftboundIcs([{ ...event, title: "Bad\rATTENDEE:someone" }], 240),
    ).toThrow();
  });
});

describe("Riftbound ICS export", () => {
  it("round-trips through Solace's existing importer using a selected duration and stable UID", () => {
    const content = buildRiftboundIcs([event], 240);
    const result = parseIcsImport(content, "Europe/Amsterdam");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      sourceUid: "riftbound-123@playriftbound.com",
      title: event.title,
      location: event.location,
      start: event.start,
      end: "2026-10-30T22:00:00.000Z",
      allDay: false,
    });
    expect(result.events[0]?.description).toContain(
      "https://playriftbound.com/en-US/events/123",
    );
    expect(content).not.toContain("ATTENDEE:");
    expect(content).not.toContain("ORGANIZER:");
  });

  it("does not invent a duration or silently accept a fractional duration", () => {
    for (const duration of [0, -1, 1.5, 1441, Number.NaN])
      expect(() => buildRiftboundIcs([event], duration)).toThrow();
  });

  it("deduplicates identical records and rejects conflicting duplicates", () => {
    expect(
      buildRiftboundIcs([event, event], 60).match(/BEGIN:VEVENT/g),
    ).toHaveLength(1);
    expect(() =>
      buildRiftboundIcs([event, { ...event, title: "Different" }], 60),
    ).toThrow();
  });

  it("keeps UTC instants correct across a daylight-saving transition", () => {
    const content = buildRiftboundIcs(
      [{ ...event, start: "2026-10-25T00:30:00.000Z" }],
      120,
    );
    expect(parseIcsImport(content, "Europe/Amsterdam").events[0]).toMatchObject(
      { start: "2026-10-25T00:30:00.000Z", end: "2026-10-25T02:30:00.000Z" },
    );
  });

  it("uses the shared encoder to escape separators and fold Unicode text", () => {
    const title = "Nexus; Night, " + "界".repeat(80);
    const content = buildRiftboundIcs([{ ...event, title }], 60);
    expect(parseIcsImport(content).events[0]?.title).toBe(title);
    for (const line of content.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("represents a complete empty listing without inventing events", () => {
    expect(buildRiftboundIcs([], 60)).not.toContain("BEGIN:VEVENT");
  });
});
