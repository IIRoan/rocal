import { describe, expect, it } from "@jest/globals";

import { mergeMailboxRefresh, missingMailboxMessageIds } from "../mail-mailbox-refresh";

type Message = { id: string; subject: string; keywords?: Record<string, boolean>; mailboxIds?: Record<string, boolean> };

describe("mailbox refresh", () => {
  const held = new Map<string, Message>([
    ["a", { id: "a", subject: "Held A", keywords: {}, mailboxIds: { inbox: true } }],
    ["gone", { id: "gone", subject: "Deleted elsewhere", keywords: {} }],
  ]);
  const flags = [
    { id: "new", keywords: {}, mailboxIds: { inbox: true } },
    { id: "a", keywords: { $seen: true }, mailboxIds: { inbox: true } },
  ];

  it("downloads only messages it does not already hold", () => {
    expect(missingMailboxMessageIds(flags, held)).toEqual(["new"]);
  });

  it("keeps held messages with fresh flags, adds new ones in server order and drops what left the mailbox", () => {
    const merged = mergeMailboxRefresh(flags, held, [{ id: "new", subject: "Fresh", keywords: {} }]);
    expect(merged.map((message) => message.id)).toEqual(["new", "a"]);
    expect(merged[1]).toEqual({ id: "a", subject: "Held A", keywords: { $seen: true }, mailboxIds: { inbox: true } });
  });

  it("skips a new id whose download failed instead of inventing a row", () => {
    expect(mergeMailboxRefresh(flags, held, []).map((message) => message.id)).toEqual(["a"]);
  });
});
