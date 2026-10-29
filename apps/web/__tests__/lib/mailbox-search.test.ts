import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mailToTitleIndexDocument, type TitleIndexDocument } from "@workspace/calendar-core";

const mockLoadLocalMailSearchDocuments =
  jest.fn<(accountId: string) => Promise<TitleIndexDocument[] | null>>();
jest.mock("@/lib/search/private-title-index", () => ({
  loadLocalMailSearchDocuments: (accountId: string) =>
    mockLoadLocalMailSearchDocuments(accountId),
}));
jest.mock("@/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => ({ userId: "user-1" }),
}));

import { searchMailbox } from "../../lib/mail/mailbox-search";
import type { StalwartJmapClient } from "../../lib/mail/jmap-client";
import type { JmapSession } from "../../lib/mail/types";

const session = { accounts: {}, primaryAccounts: {} } as unknown as JmapSession;
const documents = [
  mailToTitleIndexDocument({
    id: "m1",
    subject: "Quarterly invoice",
    receivedAt: "2026-03-02T09:00:00Z",
    mailboxIds: { inbox: true },
  }),
  mailToTitleIndexDocument({
    id: "m2",
    subject: "Invoice reminder",
    receivedAt: "2026-03-04T09:00:00Z",
    mailboxIds: { inbox: true },
  }),
];

function createClient() {
  return {
    searchMailboxMessages: jest.fn(async () => ({ messages: [{ id: "server" }], total: 1 })),
    searchMailboxMessagesWithFilter: jest.fn(async () => ({ messages: [], total: 0 })),
    getMessagesByIds: jest.fn(async (_session: JmapSession, ids: string[]) =>
      [...ids].reverse().map((id) => ({ id, keywords: id === "m2" ? { $flagged: true } : {} })),
    ),
  };
}

describe("searchMailbox", () => {
  beforeEach(() => {
    mockLoadLocalMailSearchDocuments.mockReset();
  });

  it("searches the on-device index and fetches matches by id when the index is on", async () => {
    mockLoadLocalMailSearchDocuments.mockResolvedValue(documents);
    const client = createClient();

    const messages = await searchMailbox({
      client: client as unknown as StalwartJmapClient,
      session,
      mailboxId: "inbox",
      text: "invoice",
      filters: null,
      limit: 40,
    });

    expect(client.searchMailboxMessages).not.toHaveBeenCalled();
    expect(client.searchMailboxMessagesWithFilter).not.toHaveBeenCalled();
    expect(JSON.stringify(client.getMessagesByIds.mock.calls)).not.toContain("invoice");
    expect(messages.map((message) => message.id)).toEqual(["m2", "m1"]);
  });

  it("applies keyword conditions to the fetched messages", async () => {
    mockLoadLocalMailSearchDocuments.mockResolvedValue(documents);
    const client = createClient();

    const messages = await searchMailbox({
      client: client as unknown as StalwartJmapClient,
      session,
      mailboxId: "inbox",
      text: "",
      filters: { conditions: [{ subject: "invoice", isFlagged: true }] },
      limit: 40,
    });

    expect(client.searchMailboxMessagesWithFilter).not.toHaveBeenCalled();
    expect(messages.map((message) => message.id)).toEqual(["m2"]);
  });

  it("asks the mail server when the index is off", async () => {
    mockLoadLocalMailSearchDocuments.mockResolvedValue(null);
    const client = createClient();

    const messages = await searchMailbox({
      client: client as unknown as StalwartJmapClient,
      session,
      mailboxId: "inbox",
      text: "invoice",
      filters: null,
      limit: 40,
    });

    expect(client.searchMailboxMessages).toHaveBeenCalledWith(session, "inbox", "invoice", 40);
    expect(messages.map((message) => message.id)).toEqual(["server"]);
  });
});
