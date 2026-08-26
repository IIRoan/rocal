import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MailSyncService } from "../../services/mail-sync.service";

type JmapTestEnvelope = {
  methodResponses: Array<[string, Record<string, unknown>, string]>;
};

function createHarness() {
  const prisma = {
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<any | null>>(),
      findMany: jest.fn<() => Promise<any[]>>(),
    },
    mailJmapSyncState: {
      findUnique: jest.fn<() => Promise<any | null>>(),
      update: jest.fn<() => Promise<any>>(),
      upsert: jest.fn<() => Promise<any>>(),
    },
  };

  const jmapAdminClient = {
    callJmap: jest.fn<
      (input: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => Promise<JmapTestEnvelope>
    >(
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

    await expect(
      service.listAuthorizedAccountIdsForUser("user-1"),
    ).resolves.toEqual(["acct-1"]);
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

  it("forces a full sync when Email/changes cannot be calculated", async () => {
    const { prisma, jmapAdminClient, service } = createHarness();
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
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName] = methodCalls[0]!;
        if (methodName === "Email/changes") {
          return {
            methodResponses: [
              ["error", { type: "cannotCalculateChanges" }, "c1"],
            ],
          };
        }

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
    );

    await expect(
      service.detectChanges({ userId: "user-1", accountId: "acct-1" }),
    ).resolves.toEqual({ hasChanges: true, changedTypes: ["Email"] });
  });

  it("retries Email/get without bodies when the full fetch fails", async () => {
    const { prisma, jmapAdminClient, service } = createHarness();
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
    prisma.mailJmapSyncState.update.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-2",
      mailboxState: "mailbox-state-1",
      threadState: "thread-state-1",
    });
    let fullFetches = 0;
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName, params] = methodCalls[0]!;
        if (methodName === "Email/changes") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  oldState: "email-state-1",
                  newState: "email-state-2",
                  hasMoreChanges: false,
                  created: ["in-1"],
                  updated: [],
                  destroyed: [],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/get" && Array.isArray(params.ids)) {
          if (params.fetchAllBodyValues === true) {
            fullFetches += 1;
            return {
              methodResponses: [
                ["error", { type: "invalidArguments" }, "c1"],
              ],
            };
          }
          return {
            methodResponses: [
              [
                methodName,
                {
                  state: "email-state-2",
                  list: [
                    {
                      id: "in-1",
                      subject: "Lunch",
                      mailboxIds: { "mb-inbox": true },
                      from: [{ email: "a@example.com", name: "Sam" }],
                    },
                  ],
                },
                "c1",
              ],
            ],
          };
        }

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
    );

    const result = await service.syncForUser({
      userId: "user-1",
      accountId: "acct-1",
    });

    expect(fullFetches).toBe(1);
    expect(result.email.created).toEqual(["in-1"]);
    expect(result.email.records).toEqual([
      expect.objectContaining({
        id: "in-1",
        subject: "Lunch",
      }),
    ]);
  });

  it("passes changed email records through the calendar ICS ingestion hook", async () => {
    const { prisma, jmapAdminClient } = createHarness();
    const calendarImport = {
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 1,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    };
    const mailCalendarIngestion = {
      ingestFromEmails: jest.fn(async () => calendarImport),
    };
    const service = new MailSyncService(
      prisma as never,
      jmapAdminClient as never,
      mailCalendarIngestion as never,
    );
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
    prisma.mailJmapSyncState.update.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-2",
      mailboxState: "mailbox-state-2",
      threadState: "thread-state-2",
    });
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName] = methodCalls[0]!;
        if (methodName === "Email/changes") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  oldState: "email-state-1",
                  newState: "email-state-2",
                  hasMoreChanges: false,
                  created: ["email-1"],
                  updated: [],
                  destroyed: [],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/get") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  state: "email-state-2",
                  list: [
                    {
                      id: "email-1",
                      subject: "Invite",
                      bodyValues: { calendar: { value: "BEGIN:VCALENDAR" } },
                    },
                  ],
                },
                "c1",
              ],
            ],
          };
        }

        return {
          methodResponses: [
            [
              methodName,
              {
                oldState: `${methodName}-state-1`,
                newState: `${methodName}-state-2`,
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
    );

    const result = await service.syncForUser({
      userId: "user-1",
      accountId: "acct-1",
    });

    expect(mailCalendarIngestion.ingestFromEmails).toHaveBeenCalledWith({
      userId: "user-1",
      emails: [
        {
          id: "email-1",
          subject: "Invite",
          bodyValues: { calendar: { value: "BEGIN:VCALENDAR" } },
        },
      ],
    });
    expect(result.calendarImport).toBe(calendarImport);
  });

  it("imports recent calendar invites when establishing the initial sync state", async () => {
    const { prisma, jmapAdminClient } = createHarness();
    const calendarImport = {
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 1,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    };
    const mailCalendarIngestion = {
      ingestFromEmails: jest.fn(async () => calendarImport),
    };
    const service = new MailSyncService(
      prisma as never,
      jmapAdminClient as never,
      mailCalendarIngestion as never,
    );
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      id: "entry-1",
      userId: "user-1",
      stalwartAccountId: "acct-1",
    });
    prisma.mailJmapSyncState.findUnique.mockResolvedValue(null);
    prisma.mailJmapSyncState.upsert.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-1",
      mailboxState: "mailbox-state-1",
      threadState: "thread-state-1",
    });
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName, params] = methodCalls[0]!;
        if (methodName === "Mailbox/get") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  state: "mailbox-state-1",
                  list: [],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Thread/get") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  state: "thread-state-1",
                  list: [],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/query") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  ids: ["email-1"],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/get" && Array.isArray(params.ids)) {
          const ids = params.ids as string[];
          return {
            methodResponses: [
              [
                methodName,
                ids.length === 0
                  ? {
                    state: "email-state-1",
                    list: [],
                  }
                  : {
                    state: "email-state-1",
                    list: [
                      {
                        id: "email-1",
                        subject: "Google invite",
                        bodyValues: {
                          calendar: { value: "BEGIN:VCALENDAR" },
                        },
                      },
                    ],
                  },
                "c1",
              ],
            ],
          };
        }

        throw new Error(`Unexpected JMAP method ${methodName}`);
      },
    );

    const result = await service.syncForUser({
      userId: "user-1",
      accountId: "acct-1",
    });

    expect(mailCalendarIngestion.ingestFromEmails).toHaveBeenCalledWith({
      userId: "user-1",
      emails: [
        {
          id: "email-1",
          subject: "Google invite",
          bodyValues: { calendar: { value: "BEGIN:VCALENDAR" } },
        },
      ],
    });
    expect(result.initialized).toBe(true);
    expect(result.calendarImport).toBe(calendarImport);
  });

  it("syncs all known linked mail accounts for receipt-time calendar ingestion", async () => {
    const { prisma, jmapAdminClient } = createHarness();
    const calendarImport = {
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 1,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    };
    const mailCalendarIngestion = {
      ingestFromEmails: jest.fn(async () => calendarImport),
    };
    const service = new MailSyncService(
      prisma as never,
      jmapAdminClient as never,
      mailCalendarIngestion as never,
    );
    prisma.mailDirectoryEntry.findMany.mockResolvedValue([
      {
        id: "entry-1",
        userId: "user-1",
        stalwartAccountId: "acct-1",
      },
    ]);
    prisma.mailJmapSyncState.findUnique.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-1",
      mailboxState: "mailbox-state-1",
      threadState: "thread-state-1",
    });
    prisma.mailJmapSyncState.update.mockResolvedValue({
      id: "sync-1",
      directoryEntryId: "entry-1",
      stalwartAccountId: "acct-1",
      emailState: "email-state-2",
      mailboxState: "mailbox-state-2",
      threadState: "thread-state-2",
    });
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName] = methodCalls[0]!;
        if (methodName === "Email/changes") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  oldState: "email-state-1",
                  newState: "email-state-2",
                  hasMoreChanges: false,
                  created: ["email-1"],
                  updated: [],
                  destroyed: [],
                },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/get") {
          return {
            methodResponses: [
              [
                methodName,
                {
                  state: "email-state-2",
                  list: [
                    {
                      id: "email-1",
                      subject: "Invite",
                      bodyValues: { calendar: { value: "BEGIN:VCALENDAR" } },
                    },
                  ],
                },
                "c1",
              ],
            ],
          };
        }

        return {
          methodResponses: [
            [
              methodName,
              {
                oldState: `${methodName}-state-1`,
                newState: `${methodName}-state-2`,
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
    );

    const results = await service.syncKnownChangedAccounts();

    expect(prisma.mailDirectoryEntry.findMany).toHaveBeenCalledWith({
      where: { userId: { not: null } },
      select: {
        id: true,
        userId: true,
        stalwartAccountId: true,
      },
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      accountId: "acct-1",
      userId: "user-1",
      changedTypes: ["Email"],
    });
    expect(results[0]?.sync.calendarImport).toBe(calendarImport);
    expect(mailCalendarIngestion.ingestFromEmails).toHaveBeenCalledWith({
      userId: "user-1",
      emails: [
        {
          id: "email-1",
          subject: "Invite",
          bodyValues: { calendar: { value: "BEGIN:VCALENDAR" } },
        },
      ],
    });
  });

  it("resolves ingested telemetry document ids via recent sender match", async () => {
    const { jmapAdminClient, service } = createHarness();
    const now = new Date();
    const recentReceivedAt = now.toISOString();
    const olderReceivedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName, params] = methodCalls[0]!;

        if (methodName === "Email/query") {
          return {
            methodResponses: [
              [
                methodName,
                { ids: ["gcqaaabqw", "gcuaaabqv"] },
                "c1",
              ],
            ],
          };
        }
        if (methodName === "Email/get" && Array.isArray(params.ids)) {
          const ids = params.ids as string[];
          if (ids.includes("1558")) {
            return {
              methodResponses: [[methodName, { list: [] }, "c1"]],
            };
          }
          return {
            methodResponses: [
              [
                methodName,
                {
                  list: ids.map((id) => ({
                    id,
                    subject: id === "gcqaaabqw" ? "Re: 5142" : "Older",
                    from: [{ email: "vanwesteropbroan@gmail.com", name: "Roan" }],
                    receivedAt: id === "gcqaaabqw"
                      ? recentReceivedAt
                      : olderReceivedAt,
                    messageId: ["<latest@example.com>"],
                  })),
                },
                "c1",
              ],
            ],
          };
        }

        throw new Error(`Unexpected JMAP method ${methodName}`);
      },
    );

    await expect(
      service.resolveIngestedJmapEmailId("acct-1", {
        documentId: "1558",
        fromEmail: "vanwesteropbroan@gmail.com",
      }),
    ).resolves.toBe("gcqaaabqw");
  });

  it("resolves ingested telemetry document ids via RFC Message-ID", async () => {
    const { jmapAdminClient, service } = createHarness();
    jmapAdminClient.callJmap.mockImplementation(
      async ({
        methodCalls,
      }: {
        methodCalls: Array<[string, Record<string, unknown>, string]>;
      }) => {
        const [methodName, params] = methodCalls[0]!;

        if (methodName === "Email/query") {
          return {
            methodResponses: [[methodName, { ids: ["gceaaabqr"] }, "c1"]],
          };
        }
        if (methodName === "Email/get" && Array.isArray(params.ids)) {
          const ids = params.ids as string[];
          if (ids.includes("1556")) {
            return {
              methodResponses: [[methodName, { list: [] }, "c1"]],
            };
          }
          return {
            methodResponses: [
              [
                methodName,
                {
                  list: ids.map((id) => ({
                    id,
                    subject: "Invoice attached",
                    from: [{ email: "sam@example.com", name: "Sam Wilson" }],
                    messageId: ["<abc@example.com>"],
                  })),
                },
                "c1",
              ],
            ],
          };
        }

        throw new Error(`Unexpected JMAP method ${methodName}`);
      },
    );

    await expect(
      service.resolveIngestedJmapEmailId("acct-1", {
        documentId: "1556",
        messageId: "abc@example.com",
      }),
    ).resolves.toBe("gceaaabqr");
  });

  it("loads email metadata for push enrichment", async () => {
    const { jmapAdminClient, service } = createHarness();
    jmapAdminClient.callJmap.mockResolvedValue({
      methodResponses: [
        [
          "Email/get",
          {
            list: [
              {
                id: "in-1",
                subject: "54321",
                from: [{ email: "sam@example.com" }],
              },
            ],
          },
          "c1",
        ],
      ],
    });

    await expect(
      service.getEmailPushMetadata("acct-1", "in-1"),
    ).resolves.toEqual({
      emailId: "in-1",
      subject: "54321",
      fromName: "sam@example.com",
    });
  });
});
