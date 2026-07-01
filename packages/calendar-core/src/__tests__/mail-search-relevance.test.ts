import { describe, expect, it } from "@jest/globals";
import {
  normalizeSearchText,
  scoreMailSearchMessage,
  sortMailMessagesBySearchRelevance,
  tokenizeSearchQuery,
} from "../mail-search-relevance";
import type { MailSearchScorableMessage } from "../mail-search-relevance";

const message = (
  id: string,
  overrides: Partial<MailSearchScorableMessage> = {},
): MailSearchScorableMessage => ({
  id,
  subject: "Planning notes",
  from: [{ name: "Alice", email: "alice@example.com" }],
  receivedAt: "2026-05-27T10:00:00.000Z",
  ...overrides,
});

describe("mail search relevance", () => {
  it("normalizes and tokenizes query text", () => {
    expect(normalizeSearchText("  Café   Search!! ")).toBe("café search");
    expect(tokenizeSearchQuery("Search search mail")).toEqual([
      "search",
      "mail",
    ]);
  });

  it("ranks subject matches above body-only matches", () => {
    const messages = [
      message("body-only", {
        subject: "Weekly update",
        bodyValues: { text: { value: "invoice attached" } },
        textBody: [{ partId: "text" }],
        receivedAt: "2026-06-01T10:00:00.000Z",
      }),
      message("subject-match", {
        subject: "Invoice due",
        bodyValues: { text: { value: "Please review" } },
        textBody: [{ partId: "text" }],
        receivedAt: "2026-05-01T10:00:00.000Z",
      }),
    ];

    expect(
      sortMailMessagesBySearchRelevance(messages, "invoice").map(
        (entry) => entry.id,
      ),
    ).toEqual(["subject-match", "body-only"]);
  });

  it("prefers exact phrase matches in the subject", () => {
    const messages = [
      message("partial", {
        subject: "hello there",
        receivedAt: "2026-06-01T10:00:00.000Z",
      }),
      message("exact", {
        subject: "hello world",
        receivedAt: "2026-05-01T10:00:00.000Z",
      }),
    ];

    expect(
      sortMailMessagesBySearchRelevance(messages, "hello world").map(
        (entry) => entry.id,
      ),
    ).toEqual(["exact", "partial"]);
  });

  it("scores searchable body text for snippets", () => {
    const scored = scoreMailSearchMessage(
      message("mail-1", {
        subject: "Planning notes",
        bodyValues: {
          text: { value: "Calendar launch checklist and private search details" },
        },
        textBody: [{ partId: "text" }],
      }),
      "private search",
    );

    expect(scored?.matchedFields).toContain("body");
    expect(scored?.snippet).toContain("private search");
  });

  it("does not treat substrings like hi inside thinking as token matches", () => {
    expect(
      scoreMailSearchMessage(
        message("thinking", { subject: "thinking about u" }),
        "hi me",
      ),
    ).toBeNull();
  });

  it("ranks an exact hi me subject match above a prefix-only partial match, above no match at all", () => {
    const messages = [
      message("exact", {
        subject: "hi me!",
        receivedAt: "2026-05-14T10:00:00.000Z",
      }),
      message("newest", {
        subject: "thinking about u",
        receivedAt: "2026-06-29T10:00:00.000Z",
      }),
      message("partial", {
        subject: "Re: hiii pook :)",
        receivedAt: "2026-06-01T10:00:00.000Z",
      }),
    ];

    expect(
      sortMailMessagesBySearchRelevance(messages, "hi me").map((entry) => entry.id),
    ).toEqual(["exact", "partial", "newest"]);
  });

  it("tolerates a single typo in a query token (fuzzy matching)", () => {
    const scored = scoreMailSearchMessage(
      message("typo", { subject: "Important message about the trip" }),
      "meesage",
    );

    expect(scored?.matchedFields).toContain("subject");
  });

  it("ranks an exact match above a fuzzy typo match for the same query", () => {
    const messages = [
      message("typo", {
        subject: "Weekly digest",
        bodyValues: { text: { value: "meesage from the team" } },
        textBody: [{ partId: "text" }],
        receivedAt: "2026-06-29T10:00:00.000Z",
      }),
      message("exact", {
        subject: "Message from the team",
        receivedAt: "2026-05-01T10:00:00.000Z",
      }),
    ];

    expect(
      sortMailMessagesBySearchRelevance(messages, "message").map(
        (entry) => entry.id,
      ),
    ).toEqual(["exact", "typo"]);
  });

  it("matches a short token as a prefix of a longer word (hi -> hii)", () => {
    const scored = scoreMailSearchMessage(
      message("hii", { subject: "hii there, how are you?" }),
      "hi",
    );

    expect(scored?.matchedFields).toContain("subject");
  });

  it("matches a query token as a prefix of a longer word (search-as-you-type)", () => {
    const scored = scoreMailSearchMessage(
      message("invoice", { subject: "Your invoicing summary is ready" }),
      "invoic",
    );

    expect(scored?.matchedFields).toContain("subject");
  });

  it("ranks a full-word exact match above a prefix-only match for the same query", () => {
    const messages = [
      message("prefix-only", {
        subject: "Please review the invoicing summary",
        receivedAt: "2026-06-29T10:00:00.000Z",
      }),
      message("exact", {
        subject: "Invoice due",
        receivedAt: "2026-05-01T10:00:00.000Z",
      }),
    ];

    expect(
      sortMailMessagesBySearchRelevance(messages, "invoice").map(
        (entry) => entry.id,
      ),
    ).toEqual(["exact", "prefix-only"]);
  });

  it("does not fuzzy-match a short token to unrelated words", () => {
    expect(
      scoreMailSearchMessage(message("no-match", { subject: "top secret plan" }), "hi"),
    ).toBeNull();
  });
});
