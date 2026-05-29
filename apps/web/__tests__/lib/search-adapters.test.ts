import { describe, expect, it } from "@jest/globals";
import {
  encryptCalendarSearchShard,
  eventToCalendarSearchDocument,
} from "../../lib/search/calendar-search-adapter";
import {
  encryptMailSearchShard,
  messageToMailSearchDocument,
} from "../../lib/search/mail-search-adapter";
import {
  decryptSearchShard,
  generateLocalSearchIndexKey,
} from "../../lib/search/local-index-store";
import type { CalendarEvent } from "@workspace/calendar-core";
import type { JmapEmailMessage } from "../../lib/mail/types";

const event: CalendarEvent = {
  id: "event-1",
  title: "Encrypted planning",
  description: "Launch search",
  start: new Date("2026-05-28T10:00:00.000Z"),
  end: new Date("2026-05-28T11:00:00.000Z"),
  allDay: false,
  calendarId: "calendar-1",
  userId: "user-1",
  createdAt: new Date("2026-05-27T10:00:00.000Z"),
  updatedAt: new Date("2026-05-28T09:00:00.000Z"),
  encryptionState: "encrypted",
};

const message: JmapEmailMessage = {
  id: "message-1",
  threadId: "thread-1",
  subject: "Search design",
  from: [{ name: "Alice", email: "alice@example.com" }],
  to: [{ email: "roan@example.com" }],
  receivedAt: "2026-05-28T12:00:00.000Z",
  mailboxIds: { inbox: true },
  bodyValues: { text: { value: "Private local index" } },
  textBody: [{ partId: "text" }],
  attachments: [{ name: "plan.pdf", type: "application/pdf" }],
};

describe("search adapters", () => {
  it("maps calendar events into local index documents", () => {
    expect(eventToCalendarSearchDocument(event)).toEqual(
      expect.objectContaining({
        id: "event-1",
        title: "Encrypted planning",
        encryptionState: "encrypted",
        updatedAt: "2026-05-28T09:00:00.000Z",
      }),
    );
  });

  it("maps mail messages into local index documents", () => {
    expect(messageToMailSearchDocument(message)).toEqual(
      expect.objectContaining({
        id: "message-1",
        subject: "Search design",
        from: "Alice alice@example.com",
        body: "Private local index",
        attachmentNames: ["plan.pdf"],
      }),
    );
  });

  it("encrypts adapter shards with source-bound authenticated data", async () => {
    const key = await generateLocalSearchIndexKey();
    const shard = await encryptMailSearchShard({
      key,
      accountId: "account-1",
      mailboxId: "inbox",
      messages: [message],
    });

    expect(JSON.stringify(shard)).not.toContain("Private local index");
    await expect(
      decryptSearchShard(key, shard, {
        additionalData: "mail:account-1:inbox",
      }),
    ).resolves.toEqual({
      documents: [messageToMailSearchDocument(message)],
    });
  });

  it("encrypts calendar shards without leaking plaintext", async () => {
    const key = await generateLocalSearchIndexKey();
    const shard = await encryptCalendarSearchShard({
      key,
      userId: "user-1",
      events: [event],
    });

    expect(JSON.stringify(shard)).not.toContain("Encrypted planning");
  });
});
