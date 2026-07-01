import { describe, expect, it } from "@jest/globals";

import {
  buildJmapFilter,
  hasActiveFilters,
  mergeInlineSearchResults,
  toJmapTextQuery,
} from "../../lib/mail/mail-search-filter";
import type { JmapEmailMessage } from "../../lib/mail/types";

describe("toJmapTextQuery", () => {
  it("appends wildcard suffix to each word for Stalwart FTS prefix matching", () => {
    expect(toJmapTextQuery("hi me")).toBe("hi* me*");
  });

  it("does not double-append wildcards", () => {
    expect(toJmapTextQuery("hello* world")).toBe("hello* world*");
  });

  it("returns empty string for blank input", () => {
    expect(toJmapTextQuery("   ")).toBe("");
  });

  it("collapses internal whitespace and still wildcard-prefixes each token", () => {
    expect(toJmapTextQuery("  hi   me  ")).toBe("hi* me*");
  });

  it("does not append wildcard to a token that already ends with a quote", () => {
    expect(toJmapTextQuery('invoice"')).toBe('invoice"');
  });

  it("wildcard-prefixes quoted tokens that do not end with a quote", () => {
    expect(toJmapTextQuery('"exact phrase"')).toBe('"exact* phrase"');
  });

  it("wildcard-prefixes email addresses and hash tokens without escaping", () => {
    expect(toJmapTextQuery("alice@example.com #urgent")).toBe(
      "alice@example.com* #urgent*",
    );
  });

  it("wildcard-prefixes tokens with punctuation that FTS may tokenize separately", () => {
    expect(toJmapTextQuery("re: invoice")).toBe("re:* invoice*");
  });
});

describe("mergeInlineSearchResults", () => {
  const message = (
    id: string,
    subject: string,
    receivedAt = "2026-05-27T10:00:00.000Z",
  ): JmapEmailMessage => ({
    id,
    subject,
    receivedAt,
    mailboxIds: { "mailbox-1": true },
  });

  it("adds loaded messages that match punctuation-normalized client search", () => {
    const loaded = [message("local-1", "hi me!")];
    expect(
      mergeInlineSearchResults([], loaded, "hi me").map((entry) => entry.id),
    ).toEqual(["local-1"]);
  });

  it("deduplicates server and local matches", () => {
    const shared = message("shared-1", "hi me!");
    expect(
      mergeInlineSearchResults([shared], [shared], "hi me").map(
        (entry) => entry.id,
      ),
    ).toEqual(["shared-1"]);
  });

  it("returns server results unchanged for blank query", () => {
    const server = [message("server-1", "Invoice")];
    expect(mergeInlineSearchResults(server, [message("local-1", "hi me!")], "  "))
      .toBe(server);
  });

  it("ranks merged server and local matches by relevance", () => {
    const server = [
      message("server-1", "Weekly digest", "2026-06-01T10:00:00.000Z"),
      message("server-2", "hello world", "2026-05-01T10:00:00.000Z"),
    ];
    server[0] = {
      ...server[0],
      bodyValues: { text: { value: "hello from the newsletter" } },
      textBody: [{ partId: "text" }],
    };
    const loaded = [
      server[1]!,
      message("local-2", "hello team", "2026-06-02T10:00:00.000Z"),
    ];
    expect(
      mergeInlineSearchResults(server, loaded, "hello").map((entry) => entry.id),
    ).toEqual(["local-2", "server-2", "server-1"]);
  });

  it("returns server-only results when loaded mailbox has no client matches", () => {
    const server = [message("server-1", "Invoice due")];
    const loaded = [message("local-1", "Unrelated subject")];
    expect(mergeInlineSearchResults(server, loaded, "invoice")).toEqual(server);
  });
});

describe("buildJmapFilter", () => {
  const mailboxId = "mailbox-1";

  it("includes free-text search", () => {
    expect(
      buildJmapFilter(mailboxId, {
        text: "invoice",
        conditions: [],
      }),
    ).toEqual({
      inMailbox: mailboxId,
      text: "invoice*",
    });
  });

  it("merges a single condition into the base filter", () => {
    expect(
      buildJmapFilter(mailboxId, {
        conditions: [{ from: "alice@example.com" }],
      }),
    ).toEqual({
      inMailbox: mailboxId,
      from: "alice@example.com",
    });
  });

  it("ANDs multiple UI conditions together", () => {
    expect(
      buildJmapFilter(mailboxId, {
        text: "invoice",
        conditions: [
          { from: "alice@example.com" },
          { hasAttachment: true },
        ],
      }),
    ).toEqual({
      operator: "AND",
      conditions: [
        { inMailbox: mailboxId, text: "invoice*" },
        { inMailbox: mailboxId, from: "alice@example.com" },
        { inMailbox: mailboxId, hasAttachment: true },
      ],
    });
  });

  it("maps unread and starred booleans to JMAP keywords", () => {
    expect(
      buildJmapFilter(mailboxId, {
        conditions: [{ isFlagged: true, isUnread: true }],
      }),
    ).toEqual({
      inMailbox: mailboxId,
      hasKeyword: "$flagged",
      notKeyword: "$seen",
    });
  });

  it("ignores whitespace-only inline text", () => {
    expect(
      buildJmapFilter(mailboxId, {
        text: "   ",
        conditions: [],
      }),
    ).toEqual({
      inMailbox: mailboxId,
    });
  });

  it("combines inline text with a single advanced condition in one filter", () => {
    expect(
      buildJmapFilter(mailboxId, {
        text: "invoice",
        conditions: [{ from: "alice@example.com" }],
      }),
    ).toEqual({
      inMailbox: mailboxId,
      text: "invoice*",
      from: "alice@example.com",
    });
  });
});

describe("hasActiveFilters", () => {
  it("treats whitespace-only inline text as inactive", () => {
    expect(
      hasActiveFilters({
        text: "   ",
        conditions: [],
      }),
    ).toBe(false);
  });

  it("detects active advanced conditions without inline text", () => {
    expect(
      hasActiveFilters({
        conditions: [{ hasAttachment: true }],
      }),
    ).toBe(true);
  });
});
