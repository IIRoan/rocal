import { describe, expect, it } from "@jest/globals";
import {
  coalescePendingMailSync,
  listInboundCreatedEmails,
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
      { id: "mb-sent", name: "Sent", role: "sent" },
      { id: "mb-drafts", name: "Drafts", role: "drafts" },
      { id: "mb-junk", name: "Junk", role: "junk" },
      { id: "mb-trash", name: "Trash", role: "trash" },
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

describe("listInboundCreatedEmails", () => {
  it("counts inbox creations and ignores updates, drafts, and sent mail", () => {
    expect(
      listInboundCreatedEmails(
        sync({
          email: {
            ...emptyCollection(),
            created: ["in-1", "draft-1", "sent-1"],
            updated: ["flag-1"],
            records: [
              {
                id: "in-1",
                mailboxIds: { "mb-inbox": true },
              },
              {
                id: "draft-1",
                keywords: { $draft: true },
                mailboxIds: { "mb-drafts": true },
              },
              {
                id: "sent-1",
                mailboxIds: { "mb-sent": true },
              },
              {
                id: "flag-1",
                mailboxIds: { "mb-inbox": true },
              },
            ],
          },
        }),
      ),
    ).toHaveLength(1);
  });

  it("uses the subject and sender of a single inbound message", () => {
    expect(
      listInboundCreatedEmails(
        sync({
          email: {
            ...emptyCollection(),
            created: ["in-1"],
            records: [
              {
                id: "in-1",
                subject: "  Secret subject  ",
                from: [{ email: "a@example.com", name: "  Sam Wilson  " }],
                mailboxIds: { "mb-inbox": true },
              },
            ],
          },
        }),
      ),
    ).toEqual([
      { emailId: "in-1", subject: "Secret subject", fromName: "Sam Wilson" },
    ]);
  });

  it("lists each inbound message with its subject and sender", () => {
    expect(
      listInboundCreatedEmails(
        sync({
          email: {
            ...emptyCollection(),
            created: ["in-1", "in-2"],
            records: [
              {
                id: "in-1",
                subject: "First",
                from: [{ email: "a@example.com", name: "Sam" }],
                mailboxIds: { "mb-inbox": true },
              },
              {
                id: "in-2",
                subject: "Second",
                from: [{ email: "a@example.com", name: "Sam" }],
                mailboxIds: { "mb-inbox": true },
              },
            ],
          },
        }),
      ),
    ).toEqual([
      { emailId: "in-1", subject: "First", fromName: "Sam" },
      { emailId: "in-2", subject: "Second", fromName: "Sam" },
    ]);
  });

  it("counts mail in custom folders and skips junk, trash, and missing records", () => {
    expect(
      listInboundCreatedEmails(
        sync({
          email: {
            ...emptyCollection(),
            created: ["in-1", "missing-1", "junk-1", "trash-1"],
            records: [
              {
                id: "in-1",
                subject: "Labelled",
                mailboxIds: { "mb-custom": true },
              },
              {
                id: "junk-1",
                mailboxIds: { "mb-junk": true },
              },
              {
                id: "trash-1",
                mailboxIds: { "mb-trash": true },
              },
            ],
          },
          mailbox: emptyCollection([
            { id: "mb-inbox", name: "Inbox", role: "inbox" },
            { id: "mb-custom", name: "Later", role: null },
            { id: "mb-junk", name: "Junk", role: "junk" },
            { id: "mb-trash", name: "Trash", role: "trash" },
          ]),
        }),
      ),
    ).toEqual([{ emailId: "in-1", subject: "Labelled", fromName: null }]);
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

  it("replaces an empty pending snapshot with later inbound mail", () => {
    const pending = sync();
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

    expect(listInboundCreatedEmails(coalescePendingMailSync(pending, next)!)).toEqual([
      { emailId: "in-1", subject: "Lunch", fromName: null },
    ]);
  });

  it("keeps the pending snapshot when the next event has no sync", () => {
    const pending = sync({
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

    expect(coalescePendingMailSync(pending, undefined)).toBe(pending);
  });

  it("keeps inbound created ids when a later snapshot has none", () => {
    const pending = sync({
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
    const next = sync();

    expect(listInboundCreatedEmails(coalescePendingMailSync(pending, next)!)).toEqual([
      { emailId: "in-1", subject: "Lunch", fromName: null },
    ]);
  });

  it("merges inbound created emails from overlapping snapshots", () => {
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

    expect(listInboundCreatedEmails(coalescePendingMailSync(pending, next)!)).toEqual([
      { emailId: "in-1", subject: "First", fromName: null },
      { emailId: "in-2", subject: "Second", fromName: null },
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
          records: [{ id: "th-1", emailIds: ["in-1"] }],
        }),
        calendarImport: {
          messagesScanned: 2,
          icsPartsFound: 1,
          eventsCreated: 1,
          eventsUpdated: 0,
          eventsDeleted: 0,
          errors: ["invite parse failed"],
        },
      }),
    );
  });

  it("merges overlapping thread records and calendar import summaries", () => {
    const pending = sync({
      thread: {
        ...emptyCollection(),
        created: ["th-1"],
        records: [{ id: "th-1", emailIds: ["in-1"] }],
      },
      calendarImport: {
        messagesScanned: 1,
        icsPartsFound: 1,
        eventsCreated: 1,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: ["first"],
      },
    });
    const next = sync({
      thread: {
        ...emptyCollection(),
        created: ["th-2"],
        updated: ["th-1"],
        records: [
          { id: "th-1", emailIds: ["in-1", "in-2"] },
          { id: "th-2", emailIds: ["in-3"] },
        ],
      },
      calendarImport: {
        messagesScanned: 3,
        icsPartsFound: 1,
        eventsCreated: 0,
        eventsUpdated: 1,
        eventsDeleted: 1,
        errors: ["first", "second"],
      },
    });

    expect(coalescePendingMailSync(pending, next)).toEqual(
      expect.objectContaining({
        thread: expect.objectContaining({
          created: ["th-1", "th-2"],
          updated: ["th-1"],
          records: [
            { id: "th-1", emailIds: ["in-1", "in-2"] },
            { id: "th-2", emailIds: ["in-3"] },
          ],
        }),
        calendarImport: {
          messagesScanned: 4,
          icsPartsFound: 2,
          eventsCreated: 1,
          eventsUpdated: 1,
          eventsDeleted: 1,
          errors: ["first", "second"],
        },
      }),
    );
  });
});
