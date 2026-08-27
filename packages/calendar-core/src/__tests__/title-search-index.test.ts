import { describe, expect, it } from "@jest/globals";
import type { CalendarEvent } from "../types";
import {
  LOCKED_EVENT_TITLE,
  eventToTitleIndexDocument,
  mailToTitleIndexDocument,
  mergeUnifiedSearchResults,
  searchTitleIndex,
  titleHitToUnifiedResult,
} from "../title-search-index";

const event = (
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: "event-1",
  title: "Team standup",
  location: "Kitchen",
  start: new Date("2026-05-28T09:00:00.000Z"),
  end: new Date("2026-05-28T09:30:00.000Z"),
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-28T08:00:00.000Z"),
  ...overrides,
});

describe("title search index", () => {
  it("indexes decrypted calendar titles and skips locked placeholders", () => {
    expect(eventToTitleIndexDocument(event())?.title).toBe("Team standup");
    expect(
      eventToTitleIndexDocument(
        event({
          title: LOCKED_EVENT_TITLE,
          encryptionState: "encrypted",
        }),
      ),
    ).toBeNull();
  });

  it("marks hydrated encrypted events as encrypted-indexed, not locked", () => {
    const document = eventToTitleIndexDocument(
      event({ encryptionState: "encrypted", title: "Secret launch" }),
    );
    expect(document?.encryptionStatus).toBe("encrypted-indexed");
    expect(document?.title).toBe("Secret launch");
  });

  it("indexes mail subjects and senders without needing a body", () => {
    const document = mailToTitleIndexDocument({
      id: "mail-1",
      subject: "Q3 roadmap",
      from: [{ name: "Ada", email: "ada@example.com" }],
      receivedAt: "2026-04-01T12:00:00.000Z",
      mailboxIds: { inbox: true },
    });

    expect(document).toEqual(
      expect.objectContaining({
        id: "mail:mail-1",
        title: "Q3 roadmap",
        from: "Ada <ada@example.com>",
        encryptionStatus: "plaintext",
      }),
    );
  });

  it("finds old titles by prefix without requiring an exact phrase", () => {
    const hits = searchTitleIndex(
      [
        eventToTitleIndexDocument(event({ id: "a", title: "Roadmap review" }))!,
        mailToTitleIndexDocument({
          id: "b",
          subject: "Lunch plans",
          from: [{ email: "sam@example.com" }],
        }),
      ],
      "road",
      10,
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.document.title).toBe("Roadmap review");
  });

  it("merges local and live hits by id, keeping the higher score", () => {
    const local = titleHitToUnifiedResult({
      document: eventToTitleIndexDocument(event())!,
      score: 12,
      matchedFields: ["title"],
    });
    const live = {
      ...local,
      score: 4,
      snippet: "live",
    };

    const merged = mergeUnifiedSearchResults([[local], [live]], 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBe(12);
  });
});
