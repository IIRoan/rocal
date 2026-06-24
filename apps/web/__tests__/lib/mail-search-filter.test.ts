import { describe, expect, it } from "@jest/globals";

import { buildJmapFilter } from "../../lib/mail/mail-search-filter";

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
      text: "invoice",
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
        { inMailbox: mailboxId, text: "invoice" },
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
});
