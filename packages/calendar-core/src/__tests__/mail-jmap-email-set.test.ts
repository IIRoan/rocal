import {
  buildEmailDestroyMethodCall,
  buildEmailMoveMethodCall,
  buildEmailRestoreMailboxesMethodCall,
  collectMailboxRestores,
  destroyMailboxMessagesInBatches,
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

describe("destroyMailboxMessagesInBatches", () => {
  it("destroys page by page until the mailbox is empty", async () => {
    let remaining = Array.from({ length: 5 }, (_, i) => `m${i}`);
    const destroyed: string[][] = [];
    const count = await destroyMailboxMessagesInBatches({
      batchSize: 2,
      listIds: async (limit) => remaining.slice(0, limit),
      destroy: async (ids) => {
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
      destroyMailboxMessagesInBatches({ listIds: async () => [], destroy }),
    ).resolves.toBe(0);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("stops when the server keeps returning the same batch", async () => {
    const destroy = jest.fn(async () => undefined);
    const count = await destroyMailboxMessagesInBatches({
      batchSize: 2,
      listIds: async () => ["m1", "m2"],
      destroy,
    });
    expect(count).toBe(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
