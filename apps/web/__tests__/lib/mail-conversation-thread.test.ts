import { describe, expect, it } from "@jest/globals";

import {
  buildMailConversations,
  getConversationForMessage,
} from "../../lib/mail/conversation-thread";
import type { JmapEmailMessage } from "../../lib/mail/types";

function createMessage(
  id: string,
  input: Partial<JmapEmailMessage> = {},
): JmapEmailMessage {
  return {
    id,
    subject: input.subject ?? id,
    receivedAt: input.receivedAt ?? "2026-05-19T10:00:00.000Z",
    from: input.from ?? [{ email: `${id}@example.com` }],
    to: input.to ?? [{ email: "team@example.com" }],
    ...input,
  };
}

describe("mail conversation threading", () => {
  it("groups replies together through message-id references", () => {
    const messages = [
      createMessage("root", {
        messageId: ["<root@example.com>"],
        receivedAt: "2026-05-19T10:00:00.000Z",
      }),
      createMessage("reply-1", {
        messageId: ["<reply-1@example.com>"],
        inReplyTo: ["<root@example.com>"],
        references: ["<root@example.com>"],
        receivedAt: "2026-05-19T11:00:00.000Z",
      }),
      createMessage("reply-2", {
        messageId: ["<reply-2@example.com>"],
        inReplyTo: ["<reply-1@example.com>"],
        references: ["<root@example.com>", "<reply-1@example.com>"],
        receivedAt: "2026-05-19T12:00:00.000Z",
      }),
    ];

    const conversations = buildMailConversations(messages);

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.messageIds).toEqual(["root", "reply-1", "reply-2"]);
    expect(getConversationForMessage(messages, "reply-2").map((m) => m.id)).toEqual(
      ["root", "reply-1", "reply-2"],
    );
  });

  it("falls back to threadId when reply headers are missing", () => {
    const messages = [
      createMessage("first", {
        threadId: "thread-1",
        receivedAt: "2026-05-19T10:00:00.000Z",
      }),
      createMessage("second", {
        threadId: "thread-1",
        receivedAt: "2026-05-19T11:00:00.000Z",
      }),
      createMessage("other", {
        threadId: "thread-2",
        receivedAt: "2026-05-19T12:00:00.000Z",
      }),
    ];

    const conversations = buildMailConversations(messages);

    expect(conversations).toHaveLength(2);
    expect(getConversationForMessage(messages, "second").map((m) => m.id)).toEqual(
      ["first", "second"],
    );
  });

  it("preserves relevance order for search results instead of sorting by date", () => {
    const messages = [
      createMessage("exact", {
        subject: "hi me!",
        receivedAt: "2026-05-14T10:00:00.000Z",
      }),
      createMessage("newest", {
        subject: "thinking about u",
        receivedAt: "2026-06-29T10:00:00.000Z",
      }),
    ];

    const byDate = buildMailConversations(messages).map(
      (conversation) => conversation.latestMessage.id,
    );
    const byRelevance = buildMailConversations(messages, {
      preserveMessageOrder: true,
    }).map((conversation) => conversation.latestMessage.id);

    expect(byDate).toEqual(["newest", "exact"]);
    expect(byRelevance).toEqual(["exact", "newest"]);
  });
});
