import { buildReplyContext } from "../mail-reply-context";

it("preserves reply ancestry without duplicating the parent or mutating source headers", () => {
  const source = {
    threadId: "conversation",
    messageId: ["parent@example.com"],
    references: ["root@example.com", "parent@example.com", ""],
  };
  const before = JSON.stringify(source);
  expect(buildReplyContext(source)).toEqual({
    threadId: "conversation",
    inReplyTo: ["parent@example.com"],
    references: ["root@example.com", "parent@example.com"],
  });
  expect(JSON.stringify(source)).toBe(before);
});

it("starts the reference chain with the original message id", () => {
  expect(buildReplyContext({ messageId: ["original@example.com"] })).toEqual({
    threadId: null,
    inReplyTo: ["original@example.com"],
    references: ["original@example.com"],
  });
});

it("omits absent or empty message ids instead of inventing a reply link", () => {
  expect(buildReplyContext({ messageId: [""], references: [""] })).toEqual({
    threadId: null,
    inReplyTo: undefined,
    references: undefined,
  });
});
