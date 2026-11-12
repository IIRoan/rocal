/** @jest-environment jsdom */

import React, { act, useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import {
  MAX_MAIL_KEYWORD_LEDGER_MESSAGES,
  MAX_MAIL_KEYWORD_LEDGER_READS,
  resolveMailServerPolicy,
} from "@workspace/calendar-core";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { useMailKeywordReconciliation } from "../../hooks/use-mail-keyword-reconciliation";
import type { ActiveMailboxState } from "../../lib/mail/mail-app-helpers";
import { StalwartJmapClient } from "../../lib/mail/jmap-client";
import type { JmapEmailMessage } from "../../lib/mail/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Reconciliation = ReturnType<typeof useMailKeywordReconciliation>;

const getMessagesByIds =
  jest.fn<
    (
      session: unknown,
      ids: string[],
      options?: { includeBodies?: boolean },
    ) => Promise<JmapEmailMessage[]>
  >();
let api: Reconciliation;
let mailbox: ActiveMailboxState | null;
let setMailbox: (next: ActiveMailboxState | null) => void;
let container: HTMLDivElement;
let root: Root;

function mailboxFor(
  accountId: string,
  messages: JmapEmailMessage[],
): ActiveMailboxState {
  const client = new StalwartJmapClient({
    baseUrl: "https://mail.solace.test",
    accessToken: "synthetic-token",
    fetcher: async () => {
      throw new Error("Unexpected fixture transport");
    },
  });
  jest.spyOn(client, "getMessagesByIds").mockImplementation(getMessagesByIds);
  return {
    session: {
      accounts: { [accountId]: {} },
      primaryAccounts: { "urn:ietf:params:jmap:mail": accountId },
      apiUrl: "https://mail.solace.test/jmap/",
    },
    client,
    messages,
    mailboxes: [],
    identities: [],
    pickerIdentities: [],
    email: "owner@solace.test",
    selectedMailboxId: null,
    accountEncryptedAtRest: false,
    mailServerPolicy: resolveMailServerPolicy({}),
    unlockedVault: {
      userId: "opaque-user",
      email: "owner@solace.test",
      publicKeyArmored: "synthetic",
      publicKeyFingerprint: "synthetic",
      encryptedPrivateKeyArmored: "synthetic",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "synthetic",
        memoryKiB: 8,
        iterations: 1,
        parallelism: 1,
      },
      vaultVersion: 1,
      createdAt: "2026-11-11T00:00:00Z",
    },
  };
}

function Harness({ initial }: { initial: ActiveMailboxState }) {
  const [state, setState] = useState<ActiveMailboxState | null>(initial);
  const ref = useRef<ActiveMailboxState | null>(initial);
  useEffect(() => {
    ref.current = state;
  }, [state]);
  const reconciliation = useMailKeywordReconciliation({
    accountId: state
      ? (state.session.primaryAccounts["urn:ietf:params:jmap:mail"] ?? null)
      : null,
    activeMailboxRef: ref,
    setActiveMailbox: setState,
  });
  useEffect(() => {
    api = reconciliation;
    mailbox = state;
    setMailbox = setState;
  }, [reconciliation, state]);
  return null;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const star = (messageId: string) => [
  { messageId, keyword: "$flagged", enabled: true },
];
const keywordsOf = (id: string) =>
  mailbox?.messages.find((message) => message.id === id)?.keywords;

async function mount(accountId: string, messages: JmapEmailMessage[]) {
  await act(async () => {
    root.render(<Harness initial={mailboxFor(accountId, messages)} />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  getMessagesByIds.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("reads a row afresh when a snapshot disagrees with it, and shows what the server has now", async () => {
  await mount("a", [{ id: "m1", keywords: {} }]);
  getMessagesByIds.mockResolvedValue([{ id: "m1", keywords: { $seen: true } }]);

  let guard: ReturnType<Reconciliation["guardSnapshot"]>;
  await act(async () => {
    guard = api.guardSnapshot("a", [{ id: "m1", keywords: { $seen: true } }]);
  });

  expect(guard?.keepLocal).toBe(true);
  expect(getMessagesByIds).toHaveBeenCalledWith(expect.anything(), ["m1"], {
    includeBodies: false,
  });
  expect(keywordsOf("m1")).toEqual({ $seen: true });
});

it("does not read anything when a snapshot agrees with the rows shown", async () => {
  await mount("a", [{ id: "m1", keywords: { $seen: true } }]);
  await act(async () => {
    api.guardSnapshot("a", [
      { id: "m1", keywords: { $seen: true } },
      { id: "unseen-here", keywords: {} },
    ]);
  });
  expect(getMessagesByIds).not.toHaveBeenCalled();
});

it("waits for a write in flight before confirming, and keeps an edit that raced the confirming read", async () => {
  await mount("a", [{ id: "m1", keywords: { $flagged: true } }]);
  const write = deferred<void>();
  const firstRead = deferred<JmapEmailMessage[]>();
  getMessagesByIds.mockReturnValueOnce(firstRead.promise);
  getMessagesByIds.mockResolvedValue([{ id: "m1", keywords: {} }]);

  let tracked: Promise<void> = Promise.resolve();
  await act(async () => {
    tracked = api.trackWrite(star("m1"), () => write.promise);
    api.guardSnapshot("a", [{ id: "m1", keywords: {} }]);
  });
  expect(getMessagesByIds).not.toHaveBeenCalled();

  await act(async () => {
    write.resolve();
    await tracked;
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);

  const second = deferred<void>();
  let racing: Promise<void> = Promise.resolve();
  await act(async () => {
    racing = api.trackWrite(star("m1"), () => second.promise);
    firstRead.resolve([{ id: "m1", keywords: {} }]);
  });
  expect(keywordsOf("m1")).toEqual({ $flagged: true });
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);

  await act(async () => {
    second.resolve();
    await racing;
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(2);
  expect(keywordsOf("m1")).toEqual({});
});

it("retries a failed confirming read on the next snapshot instead of dropping the row", async () => {
  await mount("a", [{ id: "m1", keywords: {} }]);
  getMessagesByIds.mockRejectedValueOnce(new Error("offline"));
  getMessagesByIds.mockResolvedValue([{ id: "m1", keywords: { $seen: true } }]);

  await act(async () => {
    api.guardSnapshot("a", [{ id: "m1", keywords: { $seen: true } }]);
  });
  expect(keywordsOf("m1")).toEqual({});

  await act(async () => {
    api.guardSnapshot("a", []);
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(2);
  expect(keywordsOf("m1")).toEqual({ $seen: true });
});

it("ignores a snapshot for another account and starts from nothing after an account switch", async () => {
  await mount("a", [{ id: "m1", keywords: { $flagged: true } }]);
  const write = deferred<void>();
  let tracked: Promise<void> = Promise.resolve();
  await act(async () => {
    tracked = api.trackWrite(star("m1"), () => write.promise);
  });
  expect(
    api.guardSnapshot("other", [{ id: "m1", keywords: {} }]),
  ).toBeUndefined();

  const read = api.beginRead();
  await act(async () => {
    setMailbox(mailboxFor("b", [{ id: "m1", keywords: {} }]));
  });
  expect(api.endRead(read, ["m1"])).toBeUndefined();
  const guard = api.guardSnapshot("b", [{ id: "m1", keywords: {} }]);
  expect(guard?.held.size).toBe(0);

  await act(async () => {
    write.resolve();
    await tracked;
  });
  expect(api.guardSnapshot("b", [])?.held.size).toBe(0);
});

it("discards a confirming read that answers after sign-out", async () => {
  await mount("a", [{ id: "m1", keywords: {} }]);
  const read = deferred<JmapEmailMessage[]>();
  getMessagesByIds.mockReturnValueOnce(read.promise);
  await act(async () => {
    api.guardSnapshot("a", [{ id: "m1", keywords: { $seen: true } }]);
  });

  await act(async () => {
    api.reset();
    setMailbox(null);
  });
  await act(async () => {
    read.resolve([{ id: "m1", keywords: { $seen: true } }]);
  });
  expect(mailbox).toBeNull();
  expect(api.beginRead()).toBeNull();
});

it("ends a confirming read when only the open account changed, and never reads the old rows under the new account", async () => {
  await mount("a", [
    { id: "m1", keywords: {} },
    { id: "m2", keywords: {} },
  ]);
  const read = deferred<JmapEmailMessage[]>();
  getMessagesByIds.mockReturnValueOnce(read.promise);
  getMessagesByIds.mockResolvedValue([{ id: "m2", keywords: { $seen: true } }]);
  await act(async () => {
    api.guardSnapshot("a", [{ id: "m1", keywords: { $seen: true } }]);
  });
  await act(async () => {
    api.guardSnapshot("a", [{ id: "m2", keywords: { $seen: true } }]);
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);

  // No reconciliation call announces the switch: only the mailbox state changes.
  await act(async () => {
    setMailbox(
      mailboxFor("b", [
        { id: "m1", keywords: {} },
        { id: "m2", keywords: {} },
      ]),
    );
  });
  await act(async () => {
    read.resolve([{ id: "m1", keywords: { $seen: true } }]);
  });

  expect(keywordsOf("m1")).toEqual({});
  expect(keywordsOf("m2")).toEqual({});
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);
  expect(api.guardSnapshot("a", [{ id: "m1", keywords: {} }])).toBeUndefined();
  await act(async () => {
    api.guardSnapshot("b", []);
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);
});

it("retires its state when the mailbox closes without any call, so a late answer and a late write touch nothing", async () => {
  await mount("a", [{ id: "m1", keywords: {} }]);
  const read = deferred<JmapEmailMessage[]>();
  const write = deferred<void>();
  getMessagesByIds.mockReturnValueOnce(read.promise);
  let tracked: Promise<void> = Promise.resolve();
  await act(async () => {
    api.guardSnapshot("a", [{ id: "m1", keywords: { $seen: true } }]);
    tracked = api.trackWrite(star("m1"), () => write.promise);
  });
  const begun = api.beginRead();
  expect(begun).not.toBeNull();

  await act(async () => {
    setMailbox(null);
  });
  await act(async () => {
    read.resolve([{ id: "m1", keywords: { $seen: true } }]);
    write.resolve();
    await tracked;
  });

  expect(mailbox).toBeNull();
  expect(api.beginRead()).toBeNull();
  expect(api.endRead(begun, ["m1"])).toBeUndefined();
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);
});

it("never brings back a row that was removed while its confirming read was in flight", async () => {
  await mount("a", [
    { id: "m1", keywords: {} },
    { id: "m2", keywords: {} },
  ]);
  const read = deferred<JmapEmailMessage[]>();
  getMessagesByIds.mockReturnValueOnce(read.promise);
  await act(async () => {
    api.guardSnapshot("a", [
      { id: "m1", keywords: { $seen: true } },
      { id: "m2", keywords: { $seen: true } },
    ]);
  });
  await act(async () => {
    setMailbox(mailboxFor("a", [{ id: "m2", keywords: {} }]));
  });
  await act(async () => {
    read.resolve([
      { id: "m1", keywords: { $seen: true } },
      { id: "m2", keywords: { $seen: true } },
    ]);
  });
  expect(mailbox?.messages.map((message) => message.id)).toEqual(["m2"]);
  expect(keywordsOf("m2")).toEqual({ $seen: true });
});

it("stays bounded when more rows disagree than it will remember: it reads every row shown instead of forgetting any", async () => {
  const rows = Array.from(
    { length: MAX_MAIL_KEYWORD_LEDGER_MESSAGES + 5 },
    (_, index) => ({ id: `m${index}`, keywords: {} }),
  );
  await mount("a", rows);
  const first = deferred<JmapEmailMessage[]>();
  getMessagesByIds.mockReturnValueOnce(first.promise);
  getMessagesByIds.mockImplementation(async (_session, ids) =>
    ids.map((id) => ({ id, keywords: { $seen: true } })),
  );
  await act(async () => {
    api.guardSnapshot("a", [{ id: "m0", keywords: { $seen: true } }]);
  });
  // The first read is held, so the next snapshot's disagreements can only pile up.
  await act(async () => {
    api.guardSnapshot(
      "a",
      rows.slice(1).map((row) => ({ ...row, keywords: { $seen: true } })),
    );
  });
  await act(async () => {
    first.resolve([{ id: "m0", keywords: { $seen: true } }]);
  });

  expect(getMessagesByIds).toHaveBeenCalledTimes(2);
  expect(getMessagesByIds.mock.calls[1]?.[1]).toEqual(
    rows.map((row) => row.id),
  );
  expect(
    mailbox?.messages.every((message) => message.keywords?.$seen === true),
  ).toBe(true);
  await act(async () => {
    api.guardSnapshot("a", []);
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(2);
});

it("retries a confirming read that a ledger collapse made untrusted", async () => {
  await mount("a", [{ id: "row", keywords: {} }]);
  const first = deferred<JmapEmailMessage[]>();
  getMessagesByIds
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue([{ id: "row", keywords: { $seen: true } }]);
  await act(async () => {
    api.guardSnapshot("a", [{ id: "row", keywords: { $seen: true } }]);
  });
  for (let index = 0; index <= MAX_MAIL_KEYWORD_LEDGER_READS; index += 1)
    api.beginRead();
  await act(async () =>
    first.resolve([{ id: "row", keywords: { $seen: true } }]),
  );
  expect(getMessagesByIds).toHaveBeenCalledTimes(2);
  expect(keywordsOf("row")).toEqual({ $seen: true });
});

it("confirms page rows held by overflow once the retired write settles", async () => {
  await mount("a", [{ id: "row", keywords: { $flagged: true } }]);
  getMessagesByIds.mockResolvedValue([
    { id: "row", keywords: { $flagged: true, $seen: true } },
  ]);
  const read = api.beginRead();
  const write = deferred<void>();
  const writing = api.trackWrite(star("row"), () => write.promise);
  for (let index = 0; index <= MAX_MAIL_KEYWORD_LEDGER_READS; index += 1)
    api.beginRead();
  await act(async () => {
    expect(api.endRead(read, ["row"])?.keepLocal).toBe(true);
  });
  expect(getMessagesByIds).not.toHaveBeenCalled();
  await act(async () => {
    write.resolve();
    await writing;
  });
  expect(getMessagesByIds).toHaveBeenCalledTimes(1);
  expect(keywordsOf("row")).toEqual({ $flagged: true, $seen: true });
});
