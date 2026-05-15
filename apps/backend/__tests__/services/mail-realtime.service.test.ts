import { describe, expect, it } from "@jest/globals";
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
});
