import {
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  MailRealtimeService,
  normalizeMailChangedEvents,
  type MailChangedEvent,
} from "../../services/mail-realtime.service";

function createSyncPayload(changedTypes: string[] = ["Email"]) {
  return {
    accountId: "acct-1",
    initialized: false,
    changedTypes,
    email: {
      oldState: "email-old",
      newState: "email-new",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
    mailbox: {
      oldState: "mailbox-old",
      newState: "mailbox-new",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
    thread: {
      oldState: "thread-old",
      newState: "thread-new",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
    calendarImport: {
      messagesScanned: 0,
      icsPartsFound: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    },
  };
}

function createInboundSyncPayload() {
  const payload = createSyncPayload(["Email"]);
  return {
    ...payload,
    email: {
      ...payload.email,
      created: ["in-1"],
      records: [
        {
          id: "in-1",
          subject: "Lunch tomorrow",
          from: [{ email: "sam@example.com", name: "Sam" }],
          mailboxIds: { "mb-inbox": true },
        },
      ],
    },
    mailbox: {
      ...payload.mailbox,
      records: [{ id: "mb-inbox", name: "Inbox", role: "inbox" }],
    },
  };
}

const EVENT_SOURCE_URL =
  "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("mail realtime service", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("normalizes JMAP state changes into minimal mail.changed events", () => {
    const events = normalizeMailChangedEvents(
      {
        "@type": "StateChange",
        changed: {
          "acct-1": {
            Email: "email-state-1",
            Mailbox: "mailbox-state-1",
            Thread: "thread-state-1",
            CalendarEvent: "calendar-state-1",
          },
        },
      },
      "2026-05-13T09:00:00.000Z",
    );

    expect(events).toEqual([
      {
        type: "mail.changed",
        accountId: "acct-1",
        changedTypes: ["Email", "Mailbox", "Thread"],
        receivedAt: "2026-05-13T09:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(events[0])).not.toContain("subject");
    expect(JSON.stringify(events[0])).not.toContain("body");
    expect(JSON.stringify(events[0])).not.toContain("attachments");
  });

  it("publishes events only to subscribers authorized for the account", () => {
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "token-1",
    });
    const accountOneEvents: MailChangedEvent[] = [];
    const accountTwoEvents: MailChangedEvent[] = [];

    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        accountOneEvents.push(event);
      },
    });
    service.subscribe({
      subscriberId: "sub-2",
      accountIds: ["acct-2"],
      onEvent: (event) => {
        accountTwoEvents.push(event);
      },
    });

    service.publish({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
    });

    expect(accountOneEvents).toEqual([
      {
        type: "mail.changed",
        accountId: "acct-1",
        changedTypes: ["Email"],
        receivedAt: "2026-05-13T09:00:00.000Z",
      },
    ]);
    expect(accountTwoEvents).toEqual([]);
  });

  it("polls linked accounts and publishes fetched sync payloads for receipt-time mail", async () => {
    jest.useFakeTimers();
    const syncPayload = createSyncPayload();
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "",
      notificationThrottleMs: 25,
      receiptPollIntervalMs: 60_000,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => [
          {
            accountId: "acct-1",
            changedTypes: ["Email"],
            sync: syncPayload,
          },
        ]),
      },
    });
    const events: MailChangedEvent[] = [];

    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    service.start();
    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(25);
    await flushMicrotasks();
    service.stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      sync: syncPayload,
    });
  });

  it("coalesces rapid account changes into one synced event for all subscribers", async () => {
    jest.useFakeTimers();
    const syncAccount = jest.fn(async () => ({
      accountId: "acct-1",
      changedTypes: ["Email", "Mailbox"],
      sync: createSyncPayload(["Email", "Mailbox"]),
    }));
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "token-1",
      notificationThrottleMs: 50,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => []),
        syncAccount,
      },
    });
    const firstSubscriberEvents: MailChangedEvent[] = [];
    const secondSubscriberEvents: MailChangedEvent[] = [];

    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        firstSubscriberEvents.push(event);
      },
    });
    service.subscribe({
      subscriberId: "sub-2",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        secondSubscriberEvents.push(event);
      },
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
    });
    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Mailbox"],
      receivedAt: "2026-05-13T09:00:01.000Z",
    });

    await jest.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(syncAccount).toHaveBeenCalledTimes(1);
    expect(firstSubscriberEvents).toHaveLength(1);
    expect(secondSubscriberEvents).toHaveLength(1);
    expect(firstSubscriberEvents[0]).toMatchObject({
      accountId: "acct-1",
      changedTypes: ["Email", "Mailbox"],
      sync: createSyncPayload(["Email", "Mailbox"]),
    });
  });

  it("runs one follow-up flush when changes arrive during an active sync", async () => {
    jest.useFakeTimers();
    let resolveFirstSync: (() => void) | undefined;
    const syncAccount = jest
      .fn<
        (accountId: string) => Promise<{
          accountId: string;
          changedTypes: string[];
          sync: ReturnType<typeof createSyncPayload>;
        } | null>
      >()
      .mockImplementationOnce(
        (_accountId) =>
          new Promise((resolve) => {
            resolveFirstSync = () => {
              resolve({
                accountId: "acct-1",
                changedTypes: ["Email"],
                sync: createSyncPayload(["Email"]),
              });
            };
          }),
      )
      .mockImplementationOnce(async (_accountId) => ({
        accountId: "acct-1",
        changedTypes: ["Mailbox"],
        sync: createSyncPayload(["Mailbox"]),
      }));
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "token-1",
      notificationThrottleMs: 40,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => []),
        syncAccount,
      },
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: () => undefined,
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
    });

    await jest.advanceTimersByTimeAsync(40);
    await flushMicrotasks();

    expect(syncAccount).toHaveBeenCalledTimes(1);

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Mailbox"],
      receivedAt: "2026-05-13T09:00:01.000Z",
    });

    if (resolveFirstSync) {
      resolveFirstSync();
    }
    await flushMicrotasks();
    expect(syncAccount).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(40);
    await flushMicrotasks();

    expect(syncAccount).toHaveBeenCalledTimes(2);
  });

  it("live-syncs EventSource changes and publishes a coalesced snapshot", async () => {
    jest.useFakeTimers();
    const inboundSync = createInboundSyncPayload();
    const emptySync = createSyncPayload(["Email"]);
    const syncAccount = jest.fn(async () => ({
      accountId: "acct-1",
      changedTypes: ["Email"],
      sync: emptySync,
    }));
    const events: MailChangedEvent[] = [];
    const service = new MailRealtimeService({
      eventSourceUrl: EVENT_SOURCE_URL,
      adminToken: "token-1",
      notificationThrottleMs: 50,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => []),
        syncAccount,
      },
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
      sync: inboundSync,
    });
    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:01.000Z",
    });

    await jest.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    service.stop();

    expect(syncAccount).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({
        accountId: "acct-1",
        sync: expect.objectContaining({
          email: expect.objectContaining({
            created: ["in-1"],
          }),
        }),
      }),
    ]);
  });

  it("live-syncs when EventSource arrives first, then keeps a later inbound snapshot", async () => {
    jest.useFakeTimers();
    const inboundSync = createInboundSyncPayload();
    const emptySync = createSyncPayload(["Email"]);
    const syncAccount = jest.fn(async () => ({
      accountId: "acct-1",
      changedTypes: ["Email"],
      sync: emptySync,
    }));
    const events: MailChangedEvent[] = [];
    const service = new MailRealtimeService({
      eventSourceUrl: EVENT_SOURCE_URL,
      adminToken: "token-1",
      notificationThrottleMs: 50,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => []),
        syncAccount,
      },
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
    });
    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:01.000Z",
      sync: inboundSync,
    });

    await jest.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    service.stop();

    expect(syncAccount).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({
        accountId: "acct-1",
        sync: expect.objectContaining({
          email: expect.objectContaining({
            created: ["in-1"],
          }),
        }),
      }),
    ]);
  });

  it("does not replace an inbound snapshot with a later empty re-sync payload", async () => {
    jest.useFakeTimers();
    const inboundSync = createInboundSyncPayload();
    const emptySync = createSyncPayload(["Email"]);
    const syncAccount = jest.fn(async () => ({
      accountId: "acct-1",
      changedTypes: ["Email"],
      sync: emptySync,
    }));
    const events: MailChangedEvent[] = [];
    const service = new MailRealtimeService({
      eventSourceUrl: EVENT_SOURCE_URL,
      adminToken: "token-1",
      notificationThrottleMs: 50,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => []),
        syncAccount,
      },
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
      sync: inboundSync,
    });
    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:01.000Z",
      sync: emptySync,
    });

    await jest.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    service.stop();

    expect(events).toEqual([
      expect.objectContaining({
        accountId: "acct-1",
        sync: expect.objectContaining({
          email: expect.objectContaining({
            created: ["in-1"],
          }),
        }),
      }),
    ]);
    expect(syncAccount).not.toHaveBeenCalled();
  });

  it("merges inbound created emails from overlapping receipt-time snapshots", async () => {
    jest.useFakeTimers();
    const first = createInboundSyncPayload();
    const second = {
      ...createInboundSyncPayload(),
      email: {
        ...createInboundSyncPayload().email,
        created: ["in-2"],
        records: [
          {
            id: "in-2",
            subject: "Dinner tomorrow",
            from: [{ email: "sam@example.com", name: "Sam" }],
            mailboxIds: { "mb-inbox": true },
          },
        ],
      },
    };
    const events: MailChangedEvent[] = [];
    const service = new MailRealtimeService({
      eventSourceUrl: EVENT_SOURCE_URL,
      adminToken: "token-1",
      notificationThrottleMs: 50,
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:00.000Z",
      sync: first,
    });
    (service as any).enqueueEvent({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      receivedAt: "2026-05-13T09:00:01.000Z",
      sync: second,
    });

    await jest.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    service.stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        accountId: "acct-1",
        sync: expect.objectContaining({
          email: expect.objectContaining({
            created: ["in-1", "in-2"],
          }),
        }),
      }),
    );
  });

  it("polls changed accounts and publishes receipt-time snapshots", async () => {
    jest.useFakeTimers();
    const inboundSync = createInboundSyncPayload();
    const events: MailChangedEvent[] = [];
    const service = new MailRealtimeService({
      eventSourceUrl: EVENT_SOURCE_URL,
      adminToken: "",
      notificationThrottleMs: 25,
      receiptPollIntervalMs: 60_000,
      syncProvider: {
        syncKnownChangedAccounts: jest.fn(async () => [
          {
            accountId: "acct-1",
            changedTypes: ["Email"],
            sync: inboundSync,
          },
        ]),
      },
    });
    service.subscribe({
      subscriberId: "sub-1",
      accountIds: ["acct-1"],
      onEvent: (event) => {
        events.push(event);
      },
    });

    service.start();
    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(25);
    await flushMicrotasks();
    service.stop();

    expect(events).toEqual([
      expect.objectContaining({
        accountId: "acct-1",
        sync: inboundSync,
      }),
    ]);
  });

  it("aborts the active EventSource listener when stopped", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetcher = jest.fn(
      async (_url: string, init?: RequestInit): Promise<Response> => {
        capturedSignal = init?.signal as AbortSignal | undefined;
        await new Promise<void>((resolve) => {
          capturedSignal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        throw new Error("aborted");
      },
    );
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "token-1",
      fetcher: fetcher as unknown as typeof fetch,
      reconnectDelayMs: 60_000,
    });

    service.start();
    await Promise.resolve();
    service.stop();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalled();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
