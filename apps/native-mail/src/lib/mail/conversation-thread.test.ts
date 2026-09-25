import {
  buildMailboxThreadRows,
  getConversationForMessage,
  mergeConversationSourceMessages,
} from "./conversation-thread";
import type { JmapEmailMessage } from "./types";

function message(partial: Partial<JmapEmailMessage> & { id: string }): JmapEmailMessage {
  return { ...partial };
}

describe("mergeConversationSourceMessages", () => {
  it("preserves loaded body values when later metadata lacks them", () => {
    const merged = mergeConversationSourceMessages(
      [
        message({
          id: "m1",
          receivedAt: "2026-05-19T10:00:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Secret" } },
        }),
      ],
      [
        message({
          id: "m1",
          receivedAt: "2026-05-19T10:00:00.000Z",
          subject: "Updated",
          bodyStructure: { type: "text/plain", blobId: "b1" },
        }),
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.subject).toBe("Updated");
    expect(merged[0]?.bodyValues?.text?.value).toBe("Secret");
  });
});

describe("mailbox thread rows", () => {
  it("does not list unrelated sent mail in the inbox", () => {
    const rows = buildMailboxThreadRows(
      [
        message({
          id: "inbound",
          threadId: "thread-inbound",
          mailboxIds: { inbox: true },
          receivedAt: "2026-05-19T10:00:00.000Z",
        }),
      ],
      [
        message({
          id: "sent-unrelated",
          threadId: "thread-sent",
          mailboxIds: { sent: true },
          receivedAt: "2026-05-19T12:00:00.000Z",
        }),
        message({
          id: "sent-reply",
          threadId: "thread-inbound",
          mailboxIds: { sent: true },
          receivedAt: "2026-05-19T11:00:00.000Z",
        }),
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.latestMessage.id).toBe("inbound");
    expect(rows[0]?.messageIds).toEqual(["inbound", "sent-reply"]);
  });

  it("keeps a conversation scoped to its JMAP thread", () => {
    const conversation = getConversationForMessage(
      [
        message({
          id: "inbound",
          threadId: "thread-inbound",
          receivedAt: "2026-05-19T10:00:00.000Z",
        }),
        message({
          id: "sent-unrelated",
          threadId: "thread-sent",
          receivedAt: "2026-05-19T12:00:00.000Z",
        }),
        message({
          id: "sent-reply",
          threadId: "thread-inbound",
          receivedAt: "2026-05-19T11:00:00.000Z",
        }),
      ],
      "inbound",
    );

    expect(conversation.map((entry) => entry.id)).toEqual([
      "inbound",
      "sent-reply",
    ]);
  });
});
