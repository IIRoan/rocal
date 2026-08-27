import {
  addRecipientChip,
  collectCommittedEmails,
  consumeRecipientDraft,
  parseRecipientField,
  removeRecipientChip,
  serializeRecipientField,
  shouldCommitDraftOnChange,
} from "./compose-recipients";

describe("parseRecipientField", () => {
  it("keeps an incomplete last token as draft", () => {
    expect(parseRecipientField("alice@solace.onl, bo")).toEqual({
      chips: [{ email: "alice@solace.onl" }],
      draft: "bo",
    });
  });

  it("commits every valid address when there is no in-progress token", () => {
    expect(
      parseRecipientField("Alice <alice@solace.onl>, bob@solace.onl"),
    ).toEqual({
      chips: [
        { name: "Alice", email: "alice@solace.onl" },
        { email: "bob@solace.onl" },
      ],
      draft: "",
    });
  });

  it("treats a trailing comma as an empty draft", () => {
    expect(parseRecipientField("alice@solace.onl, ")).toEqual({
      chips: [{ email: "alice@solace.onl" }],
      draft: "",
    });
  });

  it("dedupes repeated addresses", () => {
    expect(
      parseRecipientField("alice@solace.onl, Alice <alice@solace.onl>"),
    ).toEqual({
      chips: [{ email: "alice@solace.onl" }],
      draft: "",
    });
  });
});

describe("serializeRecipientField", () => {
  it("round-trips named chips and a draft token", () => {
    expect(
      serializeRecipientField(
        [{ name: "Alice", email: "alice@solace.onl" }],
        "bo",
      ),
    ).toBe("Alice <alice@solace.onl>, bo");
  });
});

describe("consumeRecipientDraft", () => {
  it("commits pasted lists and leaves the incomplete tail", () => {
    expect(
      consumeRecipientDraft("alice@solace.onl, bob@solace.onl, ca"),
    ).toEqual({
      chips: [{ email: "alice@solace.onl" }, { email: "bob@solace.onl" }],
      draft: "ca",
    });
  });
});

describe("shouldCommitDraftOnChange", () => {
  it("commits on comma, semicolon, newline, or space after a valid address", () => {
    expect(shouldCommitDraftOnChange("alice@solace.onl,")).toBe(true);
    expect(shouldCommitDraftOnChange("alice@solace.onl;")).toBe(true);
    expect(shouldCommitDraftOnChange("alice@solace.onl ")).toBe(true);
    expect(shouldCommitDraftOnChange("alice")).toBe(false);
    expect(shouldCommitDraftOnChange("Alice ")).toBe(false);
  });
});

describe("chip mutations", () => {
  it("adds, dedupes, and removes chips", () => {
    const withAlice = addRecipientChip([], {
      email: "alice@solace.onl",
      displayName: "Alice",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      useCount: 1,
      contexts: ["mail"],
    });
    expect(withAlice).toEqual([
      { name: "Alice", email: "alice@solace.onl" },
    ]);
    expect(
      addRecipientChip(withAlice, { email: "alice@solace.onl" }),
    ).toEqual(withAlice);
    expect(removeRecipientChip(withAlice, "alice@solace.onl")).toEqual([]);
  });
});

describe("collectCommittedEmails", () => {
  it("ignores in-progress draft tokens", () => {
    expect(
      collectCommittedEmails("alice@solace.onl, bo", "cc@solace.onl"),
    ).toEqual(["alice@solace.onl", "cc@solace.onl"]);
  });
});
