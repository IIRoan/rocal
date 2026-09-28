import { QueryClient } from "@tanstack/react-query";
import { resolveMailServerPolicy } from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "./mail-runtime";
import type { MailboxMessagesInfiniteData } from "./mail-message-cache";
import {
  captureMailOfflineSnapshot,
  compactOfflineMessage,
  hasTruncatedBody,
  hydrateMailOfflineSnapshot,
  isMailOfflineSnapshot,
  isMailOfflineSnapshotKey,
} from "./mail-offline-snapshot";
import type { MailDecryptResult } from "./mail-crypto";
import type { JmapEmailMessage } from "./types";

jest.mock("./mail-api", () => ({
  createServerMailTokenManager: jest.fn(() => ({
    getAccessToken: jest.fn(async () => "token"),
  })),
  getMailConfig: jest.fn(),
  mailFetch: jest.fn(),
}));


function message(id: string, body = "hello"): JmapEmailMessage {
  return {
    id,
    threadId: `t-${id}`,
    mailboxIds: { inbox: true },
    receivedAt: "2026-09-01T10:00:00Z",
    textBody: [{ partId: "1" }],
    bodyValues: { "1": { value: body } },
  };
}

function listData(messages: JmapEmailMessage[], total = messages.length) {
  return {
    pages: [{ messages, total, position: 0 }],
    pageParams: [0],
  } satisfies MailboxMessagesInfiniteData;
}

function runtime(): MailRuntime {
  return {
    config: {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "https://mail.solace.onl",
      signupEnabled: true,
      oauth: { mailTokenEndpoint: "https://api.solace.onl/token" },
    } as MailRuntime["config"],
    client: {} as MailRuntime["client"],
    session: {
      accounts: { acc: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "acc" },
      apiUrl: "https://mail.solace.onl/jmap/",
    },
    accountId: "acc",
    mailboxes: [{ id: "inbox", name: "Inbox", role: "inbox" }],
    identities: [{ id: "i1", email: "alice@solace.onl" }],
    pickerIdentities: [],
    encryptedAtRest: false,
    mailServerPolicy: resolveMailServerPolicy({}),
  };
}

function seededClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(QUERY_KEYS.mailAccount(), {
    email: "alice@solace.onl",
    displayName: "Alice",
    provisioned: true,
  });
  queryClient.setQueryData(QUERY_KEYS.mailRuntime(), runtime());
  return queryClient;
}

describe("captureMailOfflineSnapshot", () => {
  it("returns null until a provisioned mailbox is connected", () => {
    expect(
      captureMailOfflineSnapshot(new QueryClient(), {
        userId: "u1",
        emailState: null,
      }),
    ).toBeNull();
  });

  it("saves mailbox lists and threads but never search results or the live client", () => {
    const queryClient = seededClient();
    queryClient.setQueryData(
      QUERY_KEYS.mailMessages("inbox"),
      listData([message("a"), message("b")], 40),
    );
    queryClient.setQueryData(
      QUERY_KEYS.mailSearchMessages("inbox", 1),
      listData([message("secret-search-hit")]),
    );
    queryClient.setQueryData(QUERY_KEYS.mailThread("t-a"), [message("a")]);
    queryClient.setQueryData(QUERY_KEYS.mailThread("t-older"), [message("older")]);

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s1",
      now: 1000,
    });

    expect(snapshot?.lists).toEqual([
      { mailboxId: "inbox", total: 40, messages: [message("a"), message("b")] },
    ]);
    expect(snapshot?.threads).toEqual([
      { threadId: "t-a", messages: [message("a")] },
    ]);
    expect(snapshot?.emailState).toBe("s1");
    expect(snapshot?.runtime).not.toHaveProperty("client");
    expect(JSON.stringify(snapshot)).not.toContain("secret-search-hit");
  });

  it("keeps invalidated lists offline but discards the sync baseline", async () => {
    const queryClient = seededClient();
    queryClient.setQueryData(
      QUERY_KEYS.mailMessages("inbox"),
      listData([message("a")]),
    );
    queryClient.setQueryData(
      QUERY_KEYS.mailMessages("archive"),
      listData([message("b")]),
    );
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailMessages("archive"),
      refetchType: "none",
    });

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s1",
    });

    expect(snapshot?.lists.map((list) => list.mailboxId).sort()).toEqual([
      "archive",
      "inbox",
    ]);
    expect(snapshot?.emailState).toBeNull();
  });

  it("keeps cached mail after a failed refetch and restores it stale", async () => {
    const queryClient = seededClient();
    const key = QUERY_KEYS.mailMessages("inbox");
    queryClient.setQueryData(key, listData([message("a")]));
    await expect(
      queryClient.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error("Offline");
        },
        retry: false,
      }),
    ).rejects.toThrow("Offline");

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s2",
    });
    if (!snapshot) throw new Error("expected a snapshot");
    expect(snapshot.lists[0]?.messages).toEqual([message("a")]);
    expect(snapshot.emailState).toBeNull();
    const restored = new QueryClient();
    hydrateMailOfflineSnapshot(restored, snapshot);
    expect(restored.getQueryData(key)).toEqual(listData([message("a")]));
    expect(restored.getQueryState(key)?.dataUpdatedAt).toBe(0);
  });

  it("keeps invalidated thread siblings and requires a full reconciliation", async () => {
    const queryClient = seededClient();
    queryClient.setQueryData(
      QUERY_KEYS.mailMessages("inbox"),
      listData([message("a")]),
    );
    queryClient.setQueryData(QUERY_KEYS.mailThread("t-a"), [
      message("a"),
      message("b"),
    ]);
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailThread("t-a"),
      refetchType: "none",
    });

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s2",
    });
    expect(snapshot?.threads[0]?.messages).toHaveLength(2);
    expect(snapshot?.emailState).toBeNull();
  });

  it("caps each list to one page", () => {
    const queryClient = seededClient();
    const many = Array.from({ length: 80 }, (_, index) => message(`m${index}`));
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), listData(many, 80));

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: null,
    });

    expect(snapshot?.lists[0]?.messages).toHaveLength(30);
    expect(snapshot?.lists[0]?.total).toBe(80);
  });
});

describe("compactOfflineMessage", () => {
  it("truncates oversized plaintext bodies and flags them", () => {
    const compacted = compactOfflineMessage(message("a", "x".repeat(20_000)));
    expect(compacted.bodyValues?.["1"]?.value).toHaveLength(16_000);
    expect(hasTruncatedBody(compacted)).toBe(true);
  });

  it("leaves small bodies untouched", () => {
    const original = message("a");
    expect(compactOfflineMessage(original)).toBe(original);
    expect(hasTruncatedBody(original)).toBe(false);
  });

  it("keeps PGP ciphertext whole so previews can still decrypt", () => {
    const armored = `-----BEGIN PGP MESSAGE-----\n\n${"A".repeat(20_000)}\n-----END PGP MESSAGE-----`;
    const original = message("a", armored);
    expect(compactOfflineMessage(original)).toBe(original);
  });
});

describe("hydrateMailOfflineSnapshot", () => {
  function snapshot() {
    const snap = captureMailOfflineSnapshot(
      (() => {
        const queryClient = seededClient();
        queryClient.setQueryData(
          QUERY_KEYS.mailMessages("inbox"),
          listData([message("a")], 12),
        );
        return queryClient;
      })(),
      { userId: "u1", emailState: "s1", now: 5_000 },
    );
    if (!snap) throw new Error("expected a snapshot");
    return snap;
  }

  it("seeds account, a working runtime, and first-page list data", () => {
    const queryClient = new QueryClient();
    hydrateMailOfflineSnapshot(queryClient, snapshot(), 9_000);

    const restored = queryClient.getQueryData<MailRuntime>(QUERY_KEYS.mailRuntime());
    expect(restored?.accountId).toBe("acc");
    expect(typeof restored?.client.getEmailChanges).toBe("function");
    expect(restored?.pickerIdentities).toEqual([
      { id: "i1", email: "alice@solace.onl" },
    ]);
    expect(queryClient.getQueryData(QUERY_KEYS.mailMessages("inbox"))).toEqual(
      listData([message("a")], 12),
    );
    // Runtime keeps its saved age so the normal stale time rebuilds it in the background.
    expect(
      queryClient.getQueryState(QUERY_KEYS.mailRuntime())?.dataUpdatedAt,
    ).toBe(5_000);
    expect(
      queryClient.getQueryState(QUERY_KEYS.mailMessages("inbox"))?.dataUpdatedAt,
    ).toBe(9_000);
  });

  it("never overwrites data that is already live", () => {
    const queryClient = new QueryClient();
    const live = listData([message("live")]);
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), live);

    hydrateMailOfflineSnapshot(queryClient, snapshot());

    expect(queryClient.getQueryData(QUERY_KEYS.mailMessages("inbox"))).toBe(live);
  });
});

describe("snapshot guards", () => {
  it("rejects other versions and malformed payloads", () => {
    const valid = captureMailOfflineSnapshot(seededClient(), {
      userId: "u1",
      emailState: null,
    });
    expect(isMailOfflineSnapshot(valid)).toBe(true);
    expect(isMailOfflineSnapshot({ ...valid, version: 1 })).toBe(false);
    expect(isMailOfflineSnapshot({ ...valid, lists: [{}] })).toBe(false);
    expect(isMailOfflineSnapshot({ ...valid, decrypted: [{ messageId: "a" }] })).toBe(false);
    expect(isMailOfflineSnapshot(null)).toBe(false);
  });

  it("only watches keys that feed the snapshot", () => {
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailMessages("inbox"))).toBe(true);
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailRuntime())).toBe(true);
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailDecrypted("a"))).toBe(true);
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailLabels())).toBe(true);
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailSearchMessages("inbox", 1))).toBe(false);
    expect(isMailOfflineSnapshotKey(QUERY_KEYS.mailMessage("a"))).toBe(false);
  });
});

describe("decrypted content in the snapshot", () => {
  function decrypted(plaintext: string, extra: Partial<MailDecryptResult> = {}) {
    return {
      plaintext,
      html: null,
      signatureVerificationState: "verified",
      hasVerifiedSignature: true,
      ...extra,
    } satisfies MailDecryptResult;
  }

  function clientWithInbox(ids: string[]) {
    const queryClient = seededClient();
    queryClient.setQueryData(
      QUERY_KEYS.mailMessages("inbox"),
      listData(ids.map((id) => message(id))),
    );
    return queryClient;
  }

  it("keeps decrypted bodies of saved messages and drops those of mail no longer listed", () => {
    const queryClient = clientWithInbox(["a"]);
    queryClient.setQueryData(QUERY_KEYS.mailDecrypted("a"), decrypted("Secret plan"));
    queryClient.setQueryData(QUERY_KEYS.mailDecrypted("removed"), decrypted("Old secret"));
    queryClient.setQueryData(QUERY_KEYS.mailLabels(), [
      { id: "l1", name: "Work", color: "blue" },
    ]);

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s1",
    });

    expect(snapshot?.decrypted).toEqual([
      { messageId: "a", result: decrypted("Secret plan"), partial: false },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("Old secret");
    expect(snapshot?.labels).toEqual([{ id: "l1", name: "Work", color: "blue" }]);
  });

  it("keeps only a preview for oversized bodies or ones carrying attachment bytes", () => {
    const queryClient = clientWithInbox(["big", "attached"]);
    queryClient.setQueryData(
      QUERY_KEYS.mailDecrypted("big"),
      decrypted(`Hello there ${"x".repeat(70_000)}`),
    );
    queryClient.setQueryData(
      QUERY_KEYS.mailDecrypted("attached"),
      decrypted("See attached", {
        attachments: [{ name: "a.pdf", content: new Uint8Array([1, 2]) }],
      }),
    );

    const snapshot = captureMailOfflineSnapshot(queryClient, {
      userId: "u1",
      emailState: "s1",
    });

    const big = snapshot?.decrypted.find((entry) => entry.messageId === "big");
    expect(big?.partial).toBe(true);
    expect(big?.result.plaintext.startsWith("Hello there")).toBe(true);
    expect(big?.result.plaintext.length).toBeLessThanOrEqual(500);
    const attached = snapshot?.decrypted.find((entry) => entry.messageId === "attached");
    expect(attached).toEqual({
      messageId: "attached",
      partial: true,
      result: {
        plaintext: "See attached",
        html: null,
        signatureVerificationState: "verified",
        hasVerifiedSignature: true,
      },
    });
  });

  it("hydrates full copies as fresh and partial copies as stale so they decrypt again when shown", () => {
    const source = clientWithInbox(["a", "big"]);
    source.setQueryData(QUERY_KEYS.mailDecrypted("a"), decrypted("Secret plan"));
    source.setQueryData(QUERY_KEYS.mailDecrypted("big"), decrypted("y".repeat(70_000)));
    const snap = captureMailOfflineSnapshot(source, { userId: "u1", emailState: "s1" });
    if (!snap) throw new Error("expected a snapshot");

    const queryClient = new QueryClient();
    hydrateMailOfflineSnapshot(queryClient, snap);

    expect(queryClient.getQueryData(QUERY_KEYS.mailDecrypted("a"))).toEqual(
      decrypted("Secret plan"),
    );
    expect(queryClient.getQueryState(QUERY_KEYS.mailDecrypted("a"))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(QUERY_KEYS.mailDecrypted("big"))?.isInvalidated).toBe(true);

    // Saving again before the re-decrypt lands must not promote the preview to a full body.
    const resaved = captureMailOfflineSnapshot(queryClient, { userId: "u1", emailState: "s1" });
    expect(resaved?.decrypted.find((entry) => entry.messageId === "big")?.partial).toBe(true);
  });
});
