/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mailToTitleIndexDocument, parseMailSearchQuery } from "@workspace/calendar-core";
import type { MailRuntime } from "../../lib/mail/mail-runtime";
import { usePaletteMailSearch } from "./use-palette-mail-search";

const mockReadIndex = jest.fn();
jest.mock("@workspace/native-core/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => ({ userId: "user-1" }),
}));
jest.mock("../../lib/search/private-title-index", () => ({
  readNativeTitleIndexSnapshot: (accountId: string) => mockReadIndex(accountId),
}));

const client = {
  searchMailboxMessages: jest.fn(async () => ({ messages: [{ id: "text-hit" }], total: 1 })),
  searchMailboxMessagesWithFilter: jest.fn(async () => ({ messages: [{ id: "filter-hit" }], total: 1 })),
  getMessagesByIds: jest.fn(async (_session: unknown, ids: string[]) =>
    ids.map((id) => ({ id, keywords: {}, mailboxIds: { archive: true } })),
  ),
};
const runtime = { client, session: { id: "session" } } as unknown as MailRuntime;
const context = { mailboxes: [{ id: "archive", name: "Archive", role: "archive" }], labels: [] };

let root: Root;
let container: HTMLDivElement;

function Harness({ query, searchesLocally }: { query: string; searchesLocally: boolean }) {
  const { data } = usePaletteMailSearch(runtime, "inbox", query, {
    enabled: true,
    limit: 12,
    parsed: parseMailSearchQuery(query, context),
    searchesLocally,
    timezone: "UTC",
  });
  return <span>{(data?.messages ?? []).map((message) => message.id).join(",")}</span>;
}

async function search(query: string, searchesLocally: boolean) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness query={query} searchesLocally={searchesLocally} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("usePaletteMailSearch", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("keeps plain words on today's text search", async () => {
    await search("invoice", false);
    expect(client.searchMailboxMessages).toHaveBeenCalledWith(runtime.session, "inbox", "invoice", 12);
    expect(container.textContent).toBe("text-hit");
  });

  it("sends operators as a JMAP filter in the typed folder while the index is off", async () => {
    await search("invoice in:archive -is:read", false);
    expect(client.searchMailboxMessagesWithFilter).toHaveBeenCalledWith(
      runtime.session,
      "archive",
      {
        operator: "AND",
        conditions: [
          { inMailbox: "archive", text: "invoice*" },
          { operator: "NOT", conditions: [{ hasKeyword: "$seen" }] },
        ],
      },
      12,
    );
    expect(client.searchMailboxMessages).not.toHaveBeenCalled();
  });

  it("runs operators over the on-device index while it is on, never the server", async () => {
    mockReadIndex.mockResolvedValue({
      documents: [
        mailToTitleIndexDocument({ id: "a1", subject: "Invoice", receivedAt: "2026-03-02T09:00:00Z", mailboxIds: { archive: true } }),
      ],
    });
    await search("invoice in:archive -is:read", true);
    expect(client.searchMailboxMessagesWithFilter).not.toHaveBeenCalled();
    expect(client.searchMailboxMessages).not.toHaveBeenCalled();
    expect(client.getMessagesByIds).toHaveBeenCalledWith(runtime.session, ["a1"], { view: "row" });
    expect(container.textContent).toBe("a1");
  });
});
