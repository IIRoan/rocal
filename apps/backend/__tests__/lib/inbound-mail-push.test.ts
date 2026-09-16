import { describe, expect, it } from "@jest/globals";
import {
  coalescePendingMailSync,
  mergeInboundMailPushItems,
} from "../../lib/inbound-mail-push";
import type { MailSyncResult } from "../../services/mail-sync.service";

function emptyCollection<T>(records: T[] = []) {
  return {
    oldState: null,
    newState: "s1",
    created: [] as string[],
    updated: [] as string[],
    destroyed: [] as string[],
    records,
  };
}

function sync(overrides: Partial<MailSyncResult> = {}): MailSyncResult {
  return {
    accountId: "acct-1",
    initialized: false,
    changedTypes: ["Email"],
    email: emptyCollection(),
    mailbox: emptyCollection([
      { id: "mb-inbox", name: "Inbox", role: "inbox" },
    ]),
    thread: emptyCollection(),
    calendarImport: {
      messagesScanned: 0,
      icsPartsFound: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    },
    ...overrides,
  };
}

describe("mergeInboundMailPushItems", () => {
  it("deduplicates by email id and keeps opaque refs only", () => {
    expect(
      mergeInboundMailPushItems(
        [{ emailId: "in-1" }, { emailId: " " }],
        [{ emailId: " in-1 " }, { emailId: "in-2" }],
      ),
    ).toEqual([{ emailId: "in-1" }, { emailId: "in-2" }]);
  });
});

describe("coalescePendingMailSync", () => {
  it("uses the next snapshot when nothing is pending yet", () => {
    const next = sync({
      email: {
        ...emptyCollection(),
        created: ["in-1"],
        records: [
          {
            id: "in-1",
            subject: "Lunch",
            mailboxIds: { "mb-inbox": true },
          },
        ],
      },
    });

    expect(coalescePendingMailSync(undefined, next)).toBe(next);
  });

  it("merges created email ids from overlapping snapshots", () => {
    const pending = sync({
      email: {
        ...emptyCollection(),
        created: ["in-1"],
        records: [
          {
            id: "in-1",
            subject: "First",
            mailboxIds: { "mb-inbox": true },
          },
        ],
      },
    });
    const next = sync({
      email: {
        ...emptyCollection(),
        created: ["in-2"],
        records: [
          {
            id: "in-2",
            subject: "Second",
            mailboxIds: { "mb-inbox": true },
          },
        ],
      },
    });

    expect(coalescePendingMailSync(pending, next)?.email.created).toEqual([
      "in-1",
      "in-2",
    ]);
  });

  it("keeps pending thread changes and calendar import stats when next is empty", () => {
    const pending = sync({
      changedTypes: ["Thread"],
      thread: {
        ...emptyCollection(),
        created: ["th-1"],
        records: [{ id: "th-1", emailIds: ["in-1"] }],
      },
      calendarImport: {
        messagesScanned: 2,
        icsPartsFound: 1,
        eventsCreated: 1,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: ["invite parse failed"],
      },
    });
    const next = sync({
      thread: {
        ...emptyCollection(),
        newState: "s2",
      },
    });

    expect(coalescePendingMailSync(pending, next)).toEqual(
      expect.objectContaining({
        changedTypes: ["Thread", "Email"],
        thread: expect.objectContaining({
          newState: "s2",
          created: ["th-1"],
        }),
        calendarImport: expect.objectContaining({
          messagesScanned: 2,
          eventsCreated: 1,
          errors: ["invite parse failed"],
        }),
      }),
    );
  });
});
