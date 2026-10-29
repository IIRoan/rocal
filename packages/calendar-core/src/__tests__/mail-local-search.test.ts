import { describe, expect, it } from "@jest/globals";
import {
  fieldSearchConditions,
  matchesMessageConditions,
  orderByIds,
  searchIndexedMailbox,
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
    const messages = [
      { id: "m2", keywords: { $seen: true }, hasAttachment: true },
      { id: "m1", keywords: { $flagged: true }, hasAttachment: false },
    ];
    expect(matchesMessageConditions(messages[0]!, [{ hasAttachment: true }])).toBe(true);
    expect(matchesMessageConditions(messages[0]!, [{ isUnread: true }])).toBe(false);
    expect(matchesMessageConditions(messages[1]!, [{ isFlagged: true }])).toBe(true);
    expect(orderByIds(messages, ["m1", "m2", "gone"]).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
