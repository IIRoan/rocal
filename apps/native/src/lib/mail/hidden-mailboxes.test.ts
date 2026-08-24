import {
  parseHiddenMailboxIds,
  serializeHiddenMailboxIds,
  toggleHiddenMailboxId,
} from "./hidden-mailboxes";

describe("hidden mailbox persistence", () => {
  it("parses a JSON string array and ignores invalid payloads", () => {
    expect(parseHiddenMailboxIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseHiddenMailboxIds(null)).toEqual([]);
    expect(parseHiddenMailboxIds("{")).toEqual([]);
    expect(parseHiddenMailboxIds("[1, \"ok\", \"\"]")).toEqual(["ok"]);
  });

  it("serializes unique ids and toggles membership", () => {
    expect(serializeHiddenMailboxIds(["a", "a", "b"])).toBe('["a","b"]');
    expect(toggleHiddenMailboxId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleHiddenMailboxId(["a", "b"], "a")).toEqual(["b"]);
  });
});
