import { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  flattenMailboxMessagesCache,
  insertMessagesIntoMailboxCache,
  type MailboxMessagesCacheData,
} from "./mail-message-cache";
import {
  beginOptimisticMove,
  reinsertUndoneMessages,
  rollbackOptimisticMove,
} from "./mail-move-cache";
import type { JmapEmailMessage } from "./types";

function message(
  id: string,
  receivedAt: string,
  mailboxIds: Record<string, boolean>,
): JmapEmailMessage {
  return { id, receivedAt, mailboxIds, keywords: {} };
}

const m1 = message("m1", "2026-03-15T10:00:00Z", {
  inbox: true,
  project: true,
});
const m2 = message("m2", "2026-03-14T10:00:00Z", { inbox: true });
const m3 = message("m3", "2026-03-13T10:00:00Z", { inbox: true });

function inboxPages(): MailboxMessagesCacheData {
  return {
    pages: [
      { messages: [m1, m2], total: 3, position: 0 },
      { messages: [m3], total: 3, position: 2 },
    ],
    pageParams: [0, 2],
  };
}

function ids(data: MailboxMessagesCacheData | undefined) {
  return flattenMailboxMessagesCache(data).map((entry) => entry.id);
}

describe("insertMessagesIntoMailboxCache", () => {
  it("reinserts newest-first and skips messages already present", () => {
    const data: MailboxMessagesCacheData = { messages: [m1, m3], total: 2 };
    const updated = insertMessagesIntoMailboxCache(data, [m2, m1]);
    expect(ids(updated ?? undefined)).toEqual(["m1", "m2", "m3"]);
    expect(updated && "total" in updated ? updated.total : null).toBe(3);
    expect(insertMessagesIntoMailboxCache(data, [m1])).toBeNull();
  });

  it("places a message on the page that matches its date", () => {
    const data: MailboxMessagesCacheData = {
      pages: [
        { messages: [m1], total: 2, position: 0 },
        { messages: [m3], total: 2, position: 1 },
      ],
      pageParams: [0, 1],
    };
    const updated = insertMessagesIntoMailboxCache(data, [m2]);
    if (!updated || !("pages" in updated)) throw new Error("expected pages");
    expect(updated.pages[1]?.messages.map((entry) => entry.id)).toEqual([
      "m2",
      "m3",
    ]);
  });
});

describe("optimistic move and undo", () => {
  it("undoes a second move to the current mailbox and restores detail on rollback", () => {
    const client = new QueryClient();
    client.setQueryData(QUERY_KEYS.mailMessage("m2"), m2);
    client.setQueryData(QUERY_KEYS.mailMessages("inbox"), {
      messages: [m2],
      total: 1,
    });
    beginOptimisticMove(client, ["m2"], "archive");
    client.setQueryData(QUERY_KEYS.mailMessages("archive"), {
      messages: [{ ...m2, mailboxIds: { archive: true } }],
      total: 1,
    });
    const snapshot = beginOptimisticMove(client, ["m2"], "trash");
    expect(snapshot.restores).toEqual([
      { id: "m2", mailboxIds: { archive: true } },
    ]);
    rollbackOptimisticMove(client, snapshot);
    expect(client.getQueryData(QUERY_KEYS.mailMessage("m2"))).toMatchObject({
      mailboxIds: { archive: true },
    });
    const retry = beginOptimisticMove(client, ["m2"], "trash");
    reinsertUndoneMessages(client, retry);
    expect(client.getQueryData(QUERY_KEYS.mailMessage("m2"))).toMatchObject({
      mailboxIds: { archive: true },
    });
  });

  function setup() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), inboxPages());
    queryClient.setQueryData(QUERY_KEYS.mailMessages("project"), {
      messages: [m1],
      total: 1,
    });
    queryClient.setQueryData(QUERY_KEYS.mailMessages("trash"), {
      messages: [],
      total: 0,
    });
    return queryClient;
  }

  it("removes moved messages from source lists and snapshots their mailboxes", () => {
    const queryClient = setup();
    const snapshot = beginOptimisticMove(queryClient, ["m1", "m3"], "trash");

    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("inbox"))),
    ).toEqual(["m2"]);
    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("project"))),
    ).toEqual([]);
    expect(snapshot.restores).toEqual([
      { id: "m1", mailboxIds: { inbox: true, project: true } },
      { id: "m3", mailboxIds: { inbox: true } },
    ]);
    expect(snapshot.previousLists.map(([key]) => key[2]).sort()).toEqual([
      "inbox",
      "project",
    ]);
  });

  it("rolls every list back when the move fails", () => {
    const queryClient = setup();
    const snapshot = beginOptimisticMove(queryClient, ["m1"], "trash");
    rollbackOptimisticMove(queryClient, snapshot);

    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("inbox"))),
    ).toEqual(["m1", "m2", "m3"]);
    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("project"))),
    ).toEqual(["m1"]);
  });

  it("puts undone messages back into their lists and out of the target", () => {
    const queryClient = setup();
    const snapshot = beginOptimisticMove(queryClient, ["m1", "m2"], "trash");
    queryClient.setQueryData(QUERY_KEYS.mailMessages("trash"), {
      messages: [m1, m2],
      total: 2,
    });

    reinsertUndoneMessages(queryClient, snapshot);

    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("inbox"))),
    ).toEqual(["m1", "m2", "m3"]);
    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("project"))),
    ).toEqual(["m1"]);
    expect(
      ids(queryClient.getQueryData(QUERY_KEYS.mailMessages("trash"))),
    ).toEqual([]);
  });

  it("prefers the reader's detail copy when snapshotting mailboxes", () => {
    const queryClient = setup();
    queryClient.setQueryData(QUERY_KEYS.mailMessage("m2"), {
      ...m2,
      mailboxIds: { inbox: true, receipts: true },
    });
    const snapshot = beginOptimisticMove(queryClient, ["m2"], "archive");
    expect(snapshot.restores).toEqual([
      { id: "m2", mailboxIds: { inbox: true, receipts: true } },
    ]);
  });
});
