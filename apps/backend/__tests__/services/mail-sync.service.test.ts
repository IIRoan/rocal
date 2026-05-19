import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MailSyncService } from "../../services/mail-sync.service";

function createHarness() {
  const prisma = {
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<any | null>>(),
    },
    mailJmapSyncState: {
      findUnique: jest.fn<() => Promise<any | null>>(),
      update: jest.fn<() => Promise<any>>(),
      upsert: jest.fn<() => Promise<any>>(),
    },
  };

  const jmapAdminClient = {
    callJmap: jest.fn(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName] = methodCalls[0]!;

        return {
          methodResponses: [
            [
              methodName,
              {
                oldState: "state-0",
                newState: "state-0",
                hasMoreChanges: false,
                created: [],
                updated: [],
                destroyed: [],
              },
              "c1",
            ],
          ],
        };
      },
    ),
  };

  return {
    prisma,
    jmapAdminClient,
    service: new MailSyncService(prisma as never, jmapAdminClient as never),
  };
}

describe("MailSyncService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists the single authorized account id for a user via the unique mailbox link", async () => {
    const { prisma, service } = createHarness();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      id: "entry-1",
      stalwartAccountId: "acct-1",
    });

    await expect(service.listAuthorizedAccountIdsForUser("user-1")).resolves.toEqual(
      ["acct-1"],
    );
    expect(prisma.mailDirectoryEntry.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        id: true,
        stalwartAccountId: true,
      },
    });
  });

  it("reuses cached mailbox authorization and sync state during repeat change detection", async () => {
    const { prisma, service } = createHarness();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      id: "entry-1",
      userId: "user-1",
      stalwartAccountId: "acct-1",
    });
    prisma.mailJmapSyncState.findUnique.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-1",
      mailboxState: "mailbox-state-1",
      threadState: "thread-state-1",
    });

    await service.detectChanges({ userId: "user-1", accountId: "acct-1" });
    await service.detectChanges({ userId: "user-1", accountId: "acct-1" });

    expect(prisma.mailDirectoryEntry.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.mailJmapSyncState.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.mailJmapSyncState.findUnique).toHaveBeenCalledWith({
      where: { directoryEntryId: "entry-1" },
      select: {
        id: true,
        directoryEntryId: true,
        stalwartAccountId: true,
        emailState: true,
        mailboxState: true,
        threadState: true,
      },
    });
  });
});
