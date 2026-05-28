import { describe, expect, it, jest } from "@jest/globals";
import {
  MailRealtimeService,
  normalizeMailChangedEvents,
  type MailChangedEvent,
} from "../../services/mail-realtime.service";

describe("mail realtime service", () => {
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
    const syncPayload = {
      accountId: "acct-1",
      initialized: false,
      changedTypes: ["Email"],
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
    const service = new MailRealtimeService({
      eventSourceUrl:
        "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      adminToken: "",
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
    await Promise.resolve();
    await Promise.resolve();
    service.stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "mail.changed",
      accountId: "acct-1",
      changedTypes: ["Email"],
      sync: syncPayload,
    });
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
