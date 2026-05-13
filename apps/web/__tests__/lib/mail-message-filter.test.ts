import { describe, expect, it } from "@jest/globals";
import { filterMessages } from "../../lib/mail/message-filter";
import type { FilterableMessage } from "../../lib/mail/message-filter";

const messages: FilterableMessage[] = [
  {
    id: "1",
    subject: "Hello World",
    from: [{ name: "Alice Smith", email: "alice@example.com" }],
  },
  {
    id: "2",
    subject: "Meeting tomorrow",
    from: [{ name: "Bob Jones", email: "bob@company.org" }],
  },
  {
    id: "3",
    subject: "Invoice #123",
    from: [{ name: null, email: "billing@shop.com" }],
  },
  {
    id: "4",
    subject: null,
    from: [],
  },
  {
    id: "5",
    subject: "Multiple senders",
    from: [
      { name: "Carol", email: "carol@a.com" },
      { name: "Dave", email: "dave@b.com" },
    ],
  },
];

describe("filterMessages", () => {
  it("returns all messages when query is empty", () => {
    expect(filterMessages(messages, "")).toHaveLength(5);
  });

  it("returns all messages when query is only whitespace", () => {
    expect(filterMessages(messages, "   ")).toHaveLength(5);
  });

  it("filters by subject partial match", () => {
    const result = filterMessages(messages, "meeting");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("2");
  });

  it("filters by sender name", () => {
    const result = filterMessages(messages, "alice");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("1");
  });

  it("filters by sender email", () => {
    const result = filterMessages(messages, "billing@shop");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("3");
  });

  it("is case-insensitive for subjects", () => {
    expect(filterMessages(messages, "HELLO")).toHaveLength(1);
    expect(filterMessages(messages, "hello")).toHaveLength(1);
  });

  it("is case-insensitive for sender names", () => {
    expect(filterMessages(messages, "ALICE SMITH")).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterMessages(messages, "zzznomatch")).toHaveLength(0);
  });

  it("handles messages with null subject and empty from gracefully", () => {
    const result = filterMessages(messages, "xyz");
    expect(result).toHaveLength(0);
  });

  it("matches a second sender in a multi-sender message", () => {
    const result = filterMessages(messages, "dave");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("5");
  });

  it("matches by email domain", () => {
    const result = filterMessages(messages, "@example.com");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("1");
  });

  it("preserves original order of results", () => {
    const result = filterMessages(messages, "o");
    const ids = result.map((m) => m.id);
    // "Hello World", "Bob Jones", "Invoice #123", "Multiple senders" all contain 'o'
    expect(ids).toEqual(["1", "2", "3", "5"]);
  });
});
