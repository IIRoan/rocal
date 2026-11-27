import {
  buildEmailDestroyMethodCall,
  buildEmailMarkReadMethodCall,
  buildEmailMoveMethodCall,
  buildEmailRestoreMailboxesMethodCall,
  buildUnreadMailboxQueryMethodCall,
  collectMailboxRestores,
  drainMailboxInBatches,
} from "../mail-jmap-email-set";

describe("mail JMAP Email/set builders", () => {
  it("builds destroy and move calls", () => {
    expect(buildEmailDestroyMethodCall("acc", ["m1", "m2"])).toEqual([
      "Email/set",
      { accountId: "acc", destroy: ["m1", "m2"] },
      "c1",
    ]);
    expect(buildEmailMoveMethodCall("acc", ["m1"], "trash")).toEqual([
      "Email/set",
      { accountId: "acc", update: { m1: { mailboxIds: { trash: true } } } },
      "c1",
    ]);
  });

  it("restores the full original mailbox membership on undo", () => {
    const restores = collectMailboxRestores([
      { id: "m1", mailboxIds: { inbox: true, project: true } },
      { id: "m1", mailboxIds: { trash: true } },
      { id: "m2", mailboxIds: { archive: true, stale: false } },
      { id: "m3", mailboxIds: {} },
      { id: "m4" },
    ]);
    expect(restores).toEqual([
      { id: "m1", mailboxIds: { inbox: true, project: true } },
      { id: "m2", mailboxIds: { archive: true } },
    ]);
    expect(buildEmailRestoreMailboxesMethodCall("acc", restores)).toEqual([
      "Email/set",
      {
        accountId: "acc",
        update: {
          m1: { mailboxIds: { inbox: true, project: true } },
          m2: { mailboxIds: { archive: true } },
        },
      },
      "c1",
    ]);
  });
});

describe("drainMailboxInBatches, emptying a mailbox", () => {
  it("destroys page by page until the mailbox is empty", async () => {
    let remaining = Array.from({ length: 5 }, (_, i) => `m${i}`);
    const destroyed: string[][] = [];
    const count = await drainMailboxInBatches({
      batchSize: 2,
      listIds: async (limit) => remaining.slice(0, limit),
      apply: async (ids) => {
        destroyed.push(ids);
        remaining = remaining.filter((id) => !ids.includes(id));
      },
    });
    expect(count).toBe(5);
    expect(destroyed).toEqual([["m0", "m1"], ["m2", "m3"], ["m4"]]);
  });

  it("returns zero for an empty mailbox", async () => {
    const destroy = jest.fn(async () => undefined);
    await expect(
      drainMailboxInBatches({ listIds: async () => [], apply: destroy }),
    ).resolves.toBe(0);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("stops when the server keeps returning the same batch", async () => {
    const destroy = jest.fn(async () => undefined);
    const count = await drainMailboxInBatches({
      batchSize: 2,
      listIds: async () => ["m1", "m2"],
      apply: destroy,
    });
    expect(count).toBe(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("drainMailboxInBatches, marking a mailbox read", () => {
  it("queries only the mailbox's unread messages from the first position", () => {
    expect(buildUnreadMailboxQueryMethodCall("acc", "inbox", 50)).toEqual([
      "Email/query",
      {
        accountId: "acc",
        filter: { inMailbox: "inbox", notKeyword: "$seen" },
        position: 0,
        limit: 50,
      },
      "q1",
    ]);
    expect(buildEmailMarkReadMethodCall("acc", ["m1"])).toEqual([
      "Email/set",
      { accountId: "acc", update: { m1: { "keywords/$seen": true } } },
      "c1",
    ]);
  });

  it("marks unread messages read page by page until none are left", async () => {
    let unread = Array.from({ length: 5 }, (_, i) => `m${i}`);
    const marked: string[][] = [];
    const count = await drainMailboxInBatches({
      batchSize: 2,
      listIds: async (limit) => unread.slice(0, limit),
      apply: async (ids) => {
        marked.push(ids);
        unread = unread.filter((id) => !ids.includes(id));
      },
    });
    expect(count).toBe(5);
    expect(marked).toEqual([["m0", "m1"], ["m2", "m3"], ["m4"]]);
  });

  it("stops when the server keeps the same messages unread", async () => {
    const markRead = jest.fn(async () => undefined);
    const count = await drainMailboxInBatches({
      batchSize: 2,
      listIds: async () => ["m1", "m2"],
      apply: markRead,
    });
    expect(count).toBe(2);
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed write instead of reporting progress", async () => {
    await expect(
      drainMailboxInBatches({
        listIds: async () => ["m1"],
        apply: async () => {
          throw new Error("refused");
        },
      }),
    ).rejects.toThrow("refused");
  });
});
