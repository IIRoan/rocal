import { describe, expect, it, jest } from "@jest/globals";
import {
  fieldSearchConditions,
  hasRowStageConditions,
  matchesMessageConditions,
  orderByIds,
  searchIndexedMailbox,
  searchIndexedMailboxMessages,
} from "../mail-local-search";
import { mailToTitleIndexDocument } from "../title-search-index";

const documents = [
  mailToTitleIndexDocument({
    id: "m1",
    subject: "Quarterly invoice",
    from: [{ name: "Ada", email: "ada@example.com" }],
    to: [{ name: "Finance", email: "finance@example.com" }],
    receivedAt: "2026-03-02T09:00:00Z",
    mailboxIds: { inbox: true },
  }),
  { ...mailToTitleIndexDocument({
    id: "m2",
    subject: "Lunch",
    from: [{ email: "bob@example.com" }],
    receivedAt: "2026-03-05T12:00:00Z",
    mailboxIds: { inbox: true },
  }), body: "the invoice is attached" },
  mailToTitleIndexDocument({
    id: "m3",
    subject: "Invoice copy",
    receivedAt: "2026-03-06T12:00:00Z",
    mailboxIds: { archive: true },
  }),
];

describe("searchIndexedMailbox", () => {
  it("ranks text matches within the mailbox, subject before body", () => {
    expect(searchIndexedMailbox(documents, { mailboxId: "inbox", text: "invoice" })).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("matches field conditions, recipients and dates without any text", () => {
    expect(
      searchIndexedMailbox(documents, {
        mailboxId: "inbox",
        conditions: fieldSearchConditions({ to: "finance" }),
      }),
    ).toEqual(["m1"]);
    expect(
      searchIndexedMailbox(documents, {
        mailboxId: "inbox",
        conditions: [{ after: "2026-03-04" }],
        timezone: "UTC",
      }),
    ).toEqual(["m2"]);
    expect(
      searchIndexedMailbox(documents, {
        mailboxId: "inbox",
        conditions: [{ from: "ada@" }, { subject: "lunch" }],
      }),
    ).toEqual([]);
  });

  it("checks keyword and attachment conditions on the fetched messages and keeps the index order", () => {
    const messages: { id: string; keywords: Record<string, boolean>; hasAttachment: boolean }[] = [
      { id: "m2", keywords: { $seen: true }, hasAttachment: true },
      { id: "m1", keywords: { $flagged: true }, hasAttachment: false },
    ];
    expect(matchesMessageConditions(messages[0]!, [{ hasAttachment: true }])).toBe(true);
    expect(matchesMessageConditions(messages[0]!, [{ isUnread: true }])).toBe(false);
    expect(matchesMessageConditions(messages[1]!, [{ isFlagged: true }])).toBe(true);
    expect(orderByIds(messages, ["m1", "m2", "gone"]).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("negated and row-stage conditions", () => {
  it("inverts a negated condition only in the stage that owns it", () => {
    expect(
      searchIndexedMailbox(documents, { mailboxId: "inbox", conditions: [{ text: "invoice", negated: true }] }),
    ).toEqual([]);
    expect(
      searchIndexedMailbox(documents, { mailboxId: "inbox", conditions: [{ from: "ada", negated: true }] }),
    ).toEqual(["m2"]);
    expect(
      searchIndexedMailbox(documents, { mailboxId: "inbox", conditions: [{ isFlagged: true, negated: true }] }),
    ).toEqual(["m2", "m1"]);
    expect(matchesMessageConditions({ keywords: {} }, [{ from: "ada", negated: true }])).toBe(true);
  });

  it("checks cc, labels, size, read state and excluded folders on fetched messages", () => {
    const message = {
      keywords: { $seen: true, "label:work": true },
      cc: [{ name: "Grace", email: "grace@example.com" }],
      size: 2_000_000,
      mailboxIds: { inbox: true },
    };
    expect(matchesMessageConditions(message, [{ cc: "grace" }, { isRead: true }])).toBe(true);
    expect(matchesMessageConditions(message, [{ label: { id: "work", name: "Work" } }])).toBe(true);
    expect(matchesMessageConditions(message, [{ minSize: 1_000_000 }, { maxSize: 3_000_000 }])).toBe(true);
    expect(matchesMessageConditions(message, [{ maxSize: 1_000_000 }])).toBe(false);
    expect(matchesMessageConditions({ keywords: {} }, [{ minSize: 1 }])).toBe(false);
    expect(matchesMessageConditions(message, [{ inMailbox: { id: "inbox", name: "inbox" }, negated: true }])).toBe(false);
    expect(matchesMessageConditions(message, [{ inMailbox: { id: "inbox", name: "inbox" } }])).toBe(true);
    expect(matchesMessageConditions(message, [{ cc: "grace", negated: true }])).toBe(false);
  });
});

describe("searchIndexedMailboxMessages", () => {
  it("fetches index hits by id and applies the row conditions", async () => {
    const getMessagesByIds = jest.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, mailboxIds: { inbox: true }, keywords: { $flagged: id === "m2" } })),
    );
    const result = await searchIndexedMailboxMessages({
      documents,
      mailboxId: "inbox",
      text: "invoice",
      conditions: [{ isFlagged: true }],
      limit: 1,
      getMessagesByIds,
    });
    expect(getMessagesByIds).toHaveBeenCalledWith(["m1", "m2"]);
    expect(result).toEqual({ messages: [expect.objectContaining({ id: "m2" })], matchCount: 2 });
    expect(hasRowStageConditions([{ from: "a" }])).toBe(false);
    expect(hasRowStageConditions([{ inMailbox: { id: "x", name: "x" } }])).toBe(false);
    expect(hasRowStageConditions([{ inMailbox: { id: "x", name: "x" }, negated: true }])).toBe(true);
  });
});
