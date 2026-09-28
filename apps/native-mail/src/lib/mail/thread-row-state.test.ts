import { getThreadRowState } from "./thread-row-state";
import type { MailConversation } from "./conversation-thread";
import type { JmapEmailMessage } from "./types";

function message(
  partial: Partial<JmapEmailMessage> & { id: string },
): JmapEmailMessage {
  return { ...partial };
}

function conversation(
  first: JmapEmailMessage,
  ...rest: JmapEmailMessage[]
): MailConversation {
  const messages = [first, ...rest];
  return {
    id: first.id,
    messages,
    messageIds: messages.map((entry) => entry.id),
    latestMessage: messages[messages.length - 1] ?? first,
  };
}

describe("getThreadRowState", () => {
  it("counts unread only for messages in the open mailbox", () => {
    const row = conversation(
      message({ id: "m1", keywords: { $seen: true } }),
      message({ id: "m2" }),
      message({ id: "companion" }),
    );

    const state = getThreadRowState(
      row,
      new Set(["m1", "m2"]),
      new Set<string>(),
    );

    expect(state.unreadCount).toBe(1);
    expect(state.selectableIds).toEqual(["m1", "m2"]);
    expect(state.selected).toBe(false);
  });

  it("marks the row selected when any selectable message is selected", () => {
    const row = conversation(message({ id: "m1" }), message({ id: "m2" }));

    const state = getThreadRowState(
      row,
      new Set(["m1", "m2"]),
      new Set(["m2"]),
    );

    expect(state.selected).toBe(true);
  });

  it("falls back to the latest message when the thread has no selectable ids", () => {
    const row = conversation(message({ id: "companion" }));

    const state = getThreadRowState(
      row,
      new Set<string>(),
      new Set(["companion"]),
    );

    expect(state.selectableIds).toEqual([]);
    expect(state.selected).toBe(true);
  });
});
