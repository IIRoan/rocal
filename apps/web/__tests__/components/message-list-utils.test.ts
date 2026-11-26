import { describe, expect, it } from "@jest/globals";
import {
  buildMessageListItems,
  getRowHeight,
  getThreadAvatarSenders,
  ROW_HEIGHT_NARROW,
  type MessageListThreadRow,
} from "../../components/mail/message-list/message-list-utils";
import type { JmapEmailMessage, LabelDef } from "../../lib/mail/types";

const labels = [{ id: "l1", name: "Work", color: "#3b82f6" }] as LabelDef[];
// Only id, keywords and preview matter for the row height.
const labelled = { id: "m1", keywords: { "label:l1": true }, preview: "See you Friday" } as unknown as JmapEmailMessage;
const plain = { id: "m2", keywords: {}, preview: "Lunch?" } as unknown as JmapEmailMessage;
const noPreview = { id: "m3", keywords: {} } as unknown as JmapEmailMessage;

describe("getRowHeight", () => {
  it("gives every stacked row one height, with or without a preview or labels", () => {
    expect(getRowHeight(plain, labels, true, "compact")).toBe(ROW_HEIGHT_NARROW);
    expect(getRowHeight(labelled, labels, true, "comfortable")).toBe(ROW_HEIGHT_NARROW);
    expect(getRowHeight(noPreview, labels, true, "compact")).toBe(ROW_HEIGHT_NARROW);
    expect(getRowHeight(labelled, labels, false, "comfortable", true, true)).toBe(ROW_HEIGHT_NARROW);
  });
});

describe("list items", () => {
  const message = (id: string, email: string, receivedAt: string) =>
    ({ id, from: [{ email, name: email.split("@")[0] }], receivedAt }) as unknown as JmapEmailMessage;
  const row = (id: string, messages: JmapEmailMessage[]): MessageListThreadRow => ({
    id,
    messages,
    messageIds: messages.map((entry) => entry.id),
    latestMessage: messages[messages.length - 1] as JmapEmailMessage,
  });

  it("stacks the latest two distinct senders of a thread, newest first", () => {
    const thread = [
      message("a", "me@solace.onl", "2026-11-15T10:00:00Z"),
      message("b", "Manon@solace.onl", "2026-11-16T10:00:00Z"),
      message("c", "manon@solace.onl", "2026-11-17T10:00:00Z"),
    ];
    expect(getThreadAvatarSenders(thread).map((sender) => sender.email)).toEqual(["manon@solace.onl", "me@solace.onl"]);
  });

  it("puts rows under one heading per day and gives each heading its messages", () => {
    const rows = [
      row("t1", [message("a", "x@solace.onl", "2026-11-26T09:00:00Z"), message("b", "y@solace.onl", "2026-11-26T10:00:00Z")]),
      row("t2", [message("c", "x@solace.onl", "2026-11-26T08:00:00Z")]),
      row("t3", [message("d", "x@solace.onl", "2026-11-25T08:00:00Z")]),
    ];
    const items = buildMessageListItems(rows, (entry) => (entry.id === "t3" ? "Yesterday" : "Today"));
    expect(items.map((item) => (item.kind === "day" ? `${item.label}:${item.messageIds.join("")}` : item.id))).toEqual([
      "Today:abc",
      "t1",
      "t2",
      "Yesterday:d",
      "t3",
    ]);
    expect(buildMessageListItems(rows, null).every((item) => item.kind === "row")).toBe(true);
  });
});
