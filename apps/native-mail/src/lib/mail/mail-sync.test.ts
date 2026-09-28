import { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "./mail-runtime";
import type { MailboxMessagesInfiniteData } from "./mail-message-cache";
import type {
  JmapEmailChanges,
  JmapEmailMessage,
  JmapEmailPlacement,
} from "./types";
import {
  getMailSyncState,
  resetMailSync,
  setMailSyncState,
  syncMailboxChanges,
} from "./mail-sync";

function list(ids: string[]): MailboxMessagesInfiniteData {
  return {
    pages: [
      {
        messages: ids.map((id) => ({ id }) as JmapEmailMessage),
        total: ids.length,
        position: 0,
      },
    ],
    pageParams: [0],
  };
}

function changes(partial: Partial<JmapEmailChanges>): JmapEmailChanges {
  return {
    oldState: "s1",
    newState: "s2",
    created: [],
    updated: [],
    destroyed: [],
    ...partial,
  };
}

function createRuntime(client: Partial<MailRuntime["client"]>): MailRuntime {
  return {
    client: client as MailRuntime["client"],
    session: {} as MailRuntime["session"],
  } as MailRuntime;
}

function isInvalidated(queryClient: QueryClient, mailboxId: string) {
  return queryClient.getQueryState(QUERY_KEYS.mailMessages(mailboxId))
    ?.isInvalidated;
}

describe("syncMailboxChanges", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMailSync();
    queryClient = new QueryClient();
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), list(["a", "b"]));
  });

  it("does nothing visible when the server reports no changes", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest.fn(async () =>
      changes({ newState: "s1" }),
    );

    await syncMailboxChanges(queryClient, createRuntime({ getEmailChanges }));

    expect(getEmailChanges).toHaveBeenCalledWith({}, "s1");
    expect(isInvalidated(queryClient, "inbox")).toBe(false);
    expect(getMailSyncState()).toBe("s1");
  });

  it("drops mail deleted on another device right away and marks lists stale", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest.fn(async () => changes({ destroyed: ["a"] }));

    await syncMailboxChanges(queryClient, createRuntime({ getEmailChanges }));

    const data = queryClient.getQueryData<MailboxMessagesInfiniteData>(
      QUERY_KEYS.mailMessages("inbox"),
    );
    expect(data?.pages[0]?.messages.map((m) => m.id)).toEqual(["b"]);
    expect(isInvalidated(queryClient, "inbox")).toBe(true);
    expect(getMailSyncState()).toBe("s2");
  });

  it("marks lists stale when new mail arrives", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest.fn(async () => changes({ created: ["new"] }));

    await syncMailboxChanges(queryClient, createRuntime({ getEmailChanges }));

    expect(isInvalidated(queryClient, "inbox")).toBe(true);
  });

  it("follows hasMoreChanges pages to the final state", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest
      .fn()
      .mockResolvedValueOnce(changes({ newState: "s2", hasMoreChanges: true, updated: ["a"] }))
      .mockResolvedValueOnce(changes({ oldState: "s2", newState: "s3" }));
    const getEmailPlacements = jest.fn(async () => ({ list: [], notFound: [] }));

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailChanges, getEmailPlacements }),
    );

    expect(getEmailChanges).toHaveBeenLastCalledWith({}, "s2");
    expect(getMailSyncState()).toBe("s3");
  });

  it("re-anchors and refreshes when there is no baseline", async () => {
    const getEmailState = jest.fn(async () => "fresh");
    const getEmailChanges = jest.fn();

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailState, getEmailChanges }),
    );

    expect(getEmailChanges).not.toHaveBeenCalled();
    expect(getMailSyncState()).toBe("fresh");
    expect(isInvalidated(queryClient, "inbox")).toBe(true);
  });

  it("re-anchors when the server cannot calculate changes from the saved state", async () => {
    setMailSyncState("expired");
    const getEmailChanges = jest.fn(async () => {
      throw new Error("JMAP response did not include Email/changes.");
    });
    const getEmailState = jest.fn(async () => "fresh");

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailChanges, getEmailState }),
    );

    expect(getMailSyncState()).toBe("fresh");
    expect(isInvalidated(queryClient, "inbox")).toBe(true);
  });

  it("stays out of the way while a mutation owns the cache", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest.fn();
    let release: () => void = () => undefined;
    const pending = queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
      })
      .execute(undefined);

    await syncMailboxChanges(queryClient, createRuntime({ getEmailChanges }));
    release();
    await pending;

    expect(getEmailChanges).not.toHaveBeenCalled();
  });

  it("removes mail moved out of a list on another device and patches read state right away", async () => {
    setMailSyncState("s1");
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), {
      pages: [
        {
          messages: [
            { id: "a", mailboxIds: { inbox: true } },
            { id: "b", mailboxIds: { inbox: true }, keywords: {} },
          ] as JmapEmailMessage[],
          total: 2,
          position: 0,
        },
      ],
      pageParams: [0],
    } satisfies MailboxMessagesInfiniteData);
    queryClient.setQueryData(QUERY_KEYS.mailMessage("b"), {
      id: "b",
      keywords: {},
    } as JmapEmailMessage);
    const getEmailChanges = jest.fn(async () =>
      changes({ updated: ["a", "b", "not-cached"] }),
    );
    const placements: JmapEmailPlacement[] = [
      { id: "a", mailboxIds: { trash: true }, keywords: {} },
      { id: "b", mailboxIds: { inbox: true }, keywords: { $seen: true } },
    ];
    const getEmailPlacements = jest.fn(async () => ({
      list: placements,
      notFound: [],
    }));

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailChanges, getEmailPlacements }),
    );

    expect(getEmailPlacements).toHaveBeenCalledWith({}, ["a", "b"]);
    const data = queryClient.getQueryData<MailboxMessagesInfiniteData>(
      QUERY_KEYS.mailMessages("inbox"),
    );
    expect(data?.pages[0]?.messages.map((m) => m.id)).toEqual(["b"]);
    expect(data?.pages[0]?.messages[0]?.keywords).toEqual({ $seen: true });
    expect(data?.pages[0]?.total).toBe(1);
    expect(
      queryClient.getQueryData<JmapEmailMessage>(QUERY_KEYS.mailMessage("b"))
        ?.keywords,
    ).toEqual({ $seen: true });
    expect(getMailSyncState()).toBe("s2");
  });

  it("treats mail the server no longer finds as deleted everywhere in the cache", async () => {
    setMailSyncState("s1");
    queryClient.setQueryData(QUERY_KEYS.mailThread("t1"), [
      { id: "a", threadId: "t1" },
      { id: "c", threadId: "t1" },
    ] as JmapEmailMessage[]);
    queryClient.setQueryData(QUERY_KEYS.mailDecrypted("a"), { plaintext: "x" });
    queryClient.setQueryData(QUERY_KEYS.mailMessage("a"), { id: "a" });
    const getEmailChanges = jest.fn(async () => changes({ updated: ["a"] }));
    const getEmailPlacements = jest.fn(async () => ({
      list: [],
      notFound: ["a"],
    }));

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailChanges, getEmailPlacements }),
    );

    const inbox = queryClient.getQueryData<MailboxMessagesInfiniteData>(
      QUERY_KEYS.mailMessages("inbox"),
    );
    expect(inbox?.pages[0]?.messages.map((m) => m.id)).toEqual(["b"]);
    expect(
      queryClient
        .getQueryData<JmapEmailMessage[]>(QUERY_KEYS.mailThread("t1"))
        ?.map((m) => m.id),
    ).toEqual(["c"]);
    expect(queryClient.getQueryData(QUERY_KEYS.mailDecrypted("a"))).toBeUndefined();
    expect(queryClient.getQueryData(QUERY_KEYS.mailMessage("a"))).toBeUndefined();
  });

  it("keeps the old state when a mutation starts during the lookup so the delta replays", async () => {
    setMailSyncState("s1");
    let release: () => void = () => undefined;
    const getEmailChanges = jest.fn(async () => changes({ updated: ["a"] }));
    const getEmailPlacements = jest.fn(async () => {
      void queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
        })
        .execute(undefined);
      return { list: [], notFound: ["a"] };
    });

    await syncMailboxChanges(
      queryClient,
      createRuntime({ getEmailChanges, getEmailPlacements }),
    );
    release();

    expect(getMailSyncState()).toBe("s1");
    const inbox = queryClient.getQueryData<MailboxMessagesInfiniteData>(
      QUERY_KEYS.mailMessages("inbox"),
    );
    expect(inbox?.pages[0]?.messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("drops hidden thread caches when it has to re-anchor", async () => {
    queryClient.setQueryData(QUERY_KEYS.mailThread("t1"), [
      { id: "a" },
    ] as JmapEmailMessage[]);
    const getEmailState = jest.fn(async () => "fresh");

    await syncMailboxChanges(queryClient, createRuntime({ getEmailState }));

    expect(queryClient.getQueryData(QUERY_KEYS.mailThread("t1"))).toBeUndefined();
  });

  it("runs one sync at a time", async () => {
    setMailSyncState("s1");
    const getEmailChanges = jest.fn(async () => changes({ newState: "s1" }));
    const runtime = createRuntime({ getEmailChanges });

    await Promise.all([
      syncMailboxChanges(queryClient, runtime),
      syncMailboxChanges(queryClient, runtime),
    ]);

    expect(getEmailChanges).toHaveBeenCalledTimes(1);
  });
});
